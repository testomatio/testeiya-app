import { createHash } from "node:crypto";
import { accessSync, chmodSync, constants, copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { PACKAGE_ROOT } from "./env.js";
import { run, type Executed, type RunOptions } from "./exec.js";

const RELEASES_URL = "https://api.github.com/repos/testomatio/testeiya-app/releases?per_page=30";
const APP_NAME = "Testeiya";
const MEGABYTE = 1024 * 1024;

/**
 * The GitHub releases of this repo. CLI and desktop releases share it and CLI
 * ones carry no assets, so a build is found by name, not through `latest`.
 */
export class Releases {
  constructor(private readonly context: { fetch: typeof fetch; env: NodeJS.ProcessEnv }) {}

  async find(assetName: string): Promise<ReleaseAsset> {
    const response = await this.context.fetch(RELEASES_URL, { headers: this.apiHeaders() });
    if (response.status === 403 || response.status === 429) {
      throw new Error("GitHub rate limit reached. Try again later, or set GITHUB_TOKEN.");
    }
    if (!response.ok) throw new Error(`GitHub answered ${response.status} listing releases`);

    const releases = (await response.json()) as GithubRelease[];
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const asset = release.assets.find((candidate) => candidate.name === assetName);
      if (!asset) continue;
      return {
        version: release.tag_name.replace(/^app-/, ""),
        name: asset.name,
        size: asset.size,
        digest: asset.digest,
        url: asset.browser_download_url,
      };
    }
    throw new Error(`no release has ${assetName}`);
  }

  /** Streams to `dest`: the builds run to hundreds of megabytes. */
  async download(asset: ReleaseAsset, dest: string, onProgress?: (received: number) => void): Promise<void> {
    const response = await this.context.fetch(asset.url, { headers: { "User-Agent": "testeiya" } });
    if (!response.ok || !response.body) throw new Error(`download of ${asset.name} failed: ${response.status}`);

    const hash = createHash("sha256");
    let received = 0;
    await pipeline(
      response.body as unknown as AsyncIterable<Uint8Array>,
      async function* (source: AsyncIterable<Uint8Array>) {
        for await (const chunk of source) {
          hash.update(chunk);
          received += chunk.length;
          onProgress?.(received);
          yield chunk;
        }
      },
      createWriteStream(dest)
    );

    const actual = `sha256:${hash.digest("hex")}`;
    if (asset.digest && asset.digest !== actual) {
      throw new Error(`checksum of ${asset.name} does not match the release. Nothing was installed.`);
    }
  }

  private apiHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "testeiya" };
    if (this.context.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${this.context.env.GITHUB_TOKEN}`;
    return headers;
  }
}

/**
 * Puts one desktop build in place. An install is staged beside its target and
 * renamed over it at the end, so a failure leaves whatever was there before.
 */
export abstract class AppInstaller {
  static for(platform: string, arch: string, context: InstallContext): AppInstaller {
    if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return new MacInstaller(arch, context);
    // Windows on ARM runs the x64 build under emulation.
    if (platform === "win32" && (arch === "x64" || arch === "arm64")) return new WindowsInstaller(context);
    if (platform === "linux" && arch === "x64") return new LinuxInstaller(context);
    throw new Error(`no desktop build for ${platform}/${arch}`);
  }

  constructor(protected readonly context: InstallContext) {}

  /** The release asset this OS installs from. */
  abstract readonly asset: string;

  /** Where an install may already be, the path a user launches. */
  protected abstract locations(): string[];

  /** Unpacks the downloaded file to `staged`, on the same disk as the target. */
  protected abstract stage(file: string, staged: string, workDir: string): Promise<void>;

  /** Wires the placed app into the OS and says how to start it. */
  protected abstract integrate(target: string): Promise<string>;

  installed(): string | undefined {
    return this.locations().find((location) => existsSync(location));
  }

  protected target(): string {
    return this.installed() ?? this.locations()[0]!;
  }

  protected launchPath(target: string): string {
    return target;
  }

  async install(file: string, workDir: string): Promise<InstallResult> {
    const target = this.target();
    const staged = `${target}.new`;
    mkdirSync(dirname(target), { recursive: true });
    rmSync(staged, { recursive: true, force: true });
    try {
      await this.stage(file, staged, workDir);
      rmSync(target, { recursive: true, force: true });
      renameSync(staged, target);
    } catch (err) {
      rmSync(staged, { recursive: true, force: true });
      throw err;
    }
    return { path: this.launchPath(target), launch: await this.integrate(target) };
  }

  protected async must(command: string, args: string[]): Promise<Executed> {
    const result = await this.context.run(command, args);
    if (result.code !== 0) {
      throw new Error(`${command} failed: ${result.stderr.trim() || `exit code ${result.code}`}`);
    }
    return result;
  }
}

class MacInstaller extends AppInstaller {
  readonly asset: string;

  constructor(arch: "arm64" | "x64", context: InstallContext) {
    super(context);
    this.asset = `stable-macos-${arch}-${APP_NAME}.dmg`;
  }

  protected locations(): string[] {
    return [`/Applications/${APP_NAME}.app`, join(this.context.home, "Applications", `${APP_NAME}.app`)];
  }

  // /Applications takes anyone in the admin group. Everyone else gets the
  // per-user folder, which Launchpad and Spotlight read too.
  protected override target(): string {
    const [system, personal] = this.locations();
    const installed = this.installed();
    if (installed) return installed;
    try {
      accessSync("/Applications", constants.W_OK);
      return system!;
    } catch {
      return personal!;
    }
  }

  protected async stage(file: string, staged: string, workDir: string): Promise<void> {
    const mount = join(workDir, "mount");
    mkdirSync(mount);
    await this.must("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, file]);
    try {
      const app = readdirSync(mount).find((entry) => entry.endsWith(".app"));
      if (!app) throw new Error(`no .app inside ${this.asset}`);
      await this.must("ditto", [join(mount, app), staged]);
      // The build is unsigned: without this, a quarantined copy will not open.
      await this.context.run("xattr", ["-dr", "com.apple.quarantine", staged]);
    } finally {
      await this.context.run("hdiutil", ["detach", mount]);
    }
  }

  protected async integrate(target: string): Promise<string> {
    return `open "${target}"`;
  }
}

class WindowsInstaller extends AppInstaller {
  readonly asset = `stable-win-x64-${APP_NAME}.zip`;

  // Per user, because creating a folder on the system drive is blocked on
  // locked-down machines.
  private get root(): string {
    const local = this.context.env.LOCALAPPDATA ?? join(this.context.home, "AppData", "Local");
    return join(local, APP_NAME);
  }

  // The README used to send people to C:\Testeiya, so those installs still count.
  protected locations(): string[] {
    const drive = this.context.env.SystemDrive ?? "C:";
    const manual = join(drive.endsWith(":") ? `${drive}${sep}` : drive, APP_NAME);
    return [this.launchPath(this.root), this.launchPath(manual), join(manual, "bin", "launcher.exe")];
  }

  protected override target(): string {
    return this.root;
  }

  protected override launchPath(target: string): string {
    return join(target, APP_NAME, "bin", "launcher.exe");
  }

  protected async stage(file: string, staged: string): Promise<void> {
    mkdirSync(staged, { recursive: true });
    // By full path: Git Bash puts a GNU tar on PATH that cannot read a zip.
    const systemRoot = this.context.env.SystemRoot ?? "C:\\Windows";
    await this.must(join(systemRoot, "System32", "tar.exe"), ["-xf", file, "-C", staged]);
    if (!existsSync(this.launchPath(staged))) throw new Error(`no launcher inside ${this.asset}`);
  }

  protected async integrate(target: string): Promise<string> {
    const launcher = this.launchPath(target);
    const appData = this.context.env.APPDATA;
    if (appData) {
      const link = join(appData, "Microsoft", "Windows", "Start Menu", "Programs", `${APP_NAME}.lnk`);
      const script = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${quotePowerShell(link)});$s.TargetPath=${quotePowerShell(launcher)};$s.Save()`;
      // The app runs without the shortcut, so a locked-down shell is no failure.
      await this.context.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    }
    return `"${launcher}"`;
  }
}

class LinuxInstaller extends AppInstaller {
  readonly asset = `${APP_NAME}-x86_64.AppImage`;

  protected locations(): string[] {
    const { home } = this.context;
    return [join(home, ".local", "bin", this.asset), join(home, "Applications", this.asset)];
  }

  protected async stage(file: string, staged: string): Promise<void> {
    copyFileSync(file, staged);
    chmodSync(staged, 0o755);
  }

  protected async integrate(target: string): Promise<string> {
    const flag = (await this.hasFuse()) ? "" : " --appimage-extract-and-run";
    const { home } = this.context;
    const icon = join(PACKAGE_ROOT, "assets", "testeiya-app-icon.png");
    if (existsSync(icon)) {
      const icons = join(home, ".local", "share", "icons", "hicolor", "256x256", "apps");
      mkdirSync(icons, { recursive: true });
      copyFileSync(icon, join(icons, "testeiya.png"));
    }
    const applications = join(home, ".local", "share", "applications");
    mkdirSync(applications, { recursive: true });
    writeFileSync(
      join(applications, "testeiya.desktop"),
      `[Desktop Entry]\nType=Application\nName=${APP_NAME}\nComment=AI QA agent\nExec="${target.replaceAll("%", "%%")}"${flag}\nIcon=testeiya\nTerminal=false\nCategories=Development;\n`
    );
    return `"${target}"${flag}`;
  }

  // The AppImage runtime is static and mounts itself with fusermount.
  private async hasFuse(): Promise<boolean> {
    for (const binary of ["fusermount3", "fusermount"]) {
      if ((await this.context.run(binary, ["-V"])).code === 0) return true;
    }
    return false;
  }
}

/** `testeiya install-app`: the desktop build for this OS, unless one is already there. */
export async function runInstallApp(options: InstallAppOptions, overrides: Partial<InstallAppDeps> = {}): Promise<number> {
  const deps: InstallAppDeps = {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    env: process.env,
    run,
    fetch: globalThis.fetch,
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    ...overrides,
  };

  const installer = AppInstaller.for(deps.platform, deps.arch, deps);
  const existing = installer.installed();
  if (existing && !options.force) {
    deps.out(
      options.json
        ? `${JSON.stringify({ status: "already-installed", path: existing }, null, 2)}\n`
        : `  Testeiya is already installed at ${existing}\n  It updates itself. Use --force to reinstall.\n`
    );
    return 0;
  }

  const releases = new Releases(deps);
  const asset = await releases.find(installer.asset);

  const workDir = mkdtempSync(join(tmpdir(), "testeiya-app-"));
  const onInterrupt = () => {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // A dmg still mounted inside it is read-only. Exit regardless.
    }
    process.exit(130);
  };
  process.once("SIGINT", onInterrupt);
  try {
    deps.err(`  downloading ${asset.name} ${asset.version}, ${Math.round(asset.size / MEGABYTE)} MB\n`);
    const file = join(workDir, asset.name);
    await releases.download(asset, file, progressBar(asset.size));
    deps.err("  installing\n");
    const result = await installer.install(file, workDir);
    deps.out(
      options.json
        ? `${JSON.stringify({ status: "installed", path: result.path, version: asset.version, asset: asset.name }, null, 2)}\n`
        : `  ✓ Testeiya ${asset.version} installed at ${result.path}\n  Start it from your applications menu, or run: ${result.launch}\n`
    );
    return 0;
  } finally {
    process.off("SIGINT", onInterrupt);
    rmSync(workDir, { recursive: true, force: true });
  }
}

function progressBar(total: number): ((received: number) => void) | undefined {
  if (!process.stderr.isTTY || !total) return undefined;
  let shown = -1;
  return (received) => {
    const percent = Math.floor((received / total) * 100);
    if (percent === shown) return;
    shown = percent;
    process.stderr.write(`\r  ${percent}%${percent === 100 ? "\n" : ""}`);
  };
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface InstallContext {
  home: string;
  env: NodeJS.ProcessEnv;
  run: (command: string, args: string[], options?: RunOptions) => Promise<Executed>;
}

export interface InstallAppDeps extends InstallContext {
  platform: string;
  arch: string;
  fetch: typeof fetch;
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface InstallAppOptions {
  force?: boolean;
  json?: boolean;
}

export interface ReleaseAsset {
  version: string;
  name: string;
  size: number;
  digest?: string;
  url: string;
}

export interface InstallResult {
  path: string;
  launch: string;
}

interface GithubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; size: number; digest?: string; browser_download_url: string }[];
}

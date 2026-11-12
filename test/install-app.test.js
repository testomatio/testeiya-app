import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppInstaller, Releases, runInstallApp } from "../dist/src/install-app.js";
import { parseCliArgs } from "../dist/src/args.js";

const BYTES = Buffer.from("fake desktop build");
const DIGEST = `sha256:${createHash("sha256").update(BYTES).digest("hex")}`;
const ASSET_URL = "https://example.test/download/asset";

function asset(name, digest = DIGEST) {
  return { name, size: BYTES.length, digest, browser_download_url: `${ASSET_URL}/${name}` };
}

function release(tag, assets, extra = {}) {
  return { tag_name: tag, draft: false, prerelease: false, assets, ...extra };
}

/** Serves the release list and the asset bytes, the two URLs the command reads. */
function github(releases, { bytes = BYTES, listStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers ?? {} });
    if (String(url).startsWith(ASSET_URL)) return new Response(bytes);
    return new Response(JSON.stringify(releases), { status: listStatus });
  };
  return { fetch, calls };
}

function sandbox() {
  return mkdtempSync(join(tmpdir(), "install-app-test-"));
}

function context(home, overrides = {}) {
  return { home, env: {}, run: async () => ({ code: 0, stdout: "", stderr: "" }), ...overrides };
}

function deps(home, platform, overrides = {}) {
  return {
    ...context(home),
    platform,
    arch: "x64",
    fetch: github([release("0.10.1", [asset("Testeiya-x86_64.AppImage")])]).fetch,
    out: () => {},
    err: () => {},
    ...overrides,
  };
}

test("install-app takes --force and --json", () => {
  const args = parseCliArgs(["install-app", "--force", "--json"]);
  assert.equal(args.command, "install-app");
  assert.equal(args.force, true);
  assert.equal(args.json, true);
});

test("each OS and architecture gets its own desktop build", () => {
  const cases = [
    ["darwin", "arm64", "stable-macos-arm64-Testeiya.dmg"],
    ["darwin", "x64", "stable-macos-x64-Testeiya.dmg"],
    ["win32", "x64", "stable-win-x64-Testeiya.zip"],
    ["win32", "arm64", "stable-win-x64-Testeiya.zip"],
    ["linux", "x64", "Testeiya-x86_64.AppImage"],
  ];
  for (const [platform, arch, name] of cases) {
    assert.equal(AppInstaller.for(platform, arch, context(sandbox())).asset, name);
  }
});

test("a platform without a build says so", () => {
  assert.throws(() => AppInstaller.for("linux", "arm64", context(sandbox())), /no desktop build for linux\/arm64/);
  assert.throws(() => AppInstaller.for("freebsd", "x64", context(sandbox())), /no desktop build for freebsd\/x64/);
});

test("a cli release without assets is skipped for the newest desktop build", async () => {
  const { fetch } = github([release("0.10.2", []), release("0.10.1", [asset("Testeiya-x86_64.AppImage")])]);
  const found = await new Releases({ fetch, env: {} }).find("Testeiya-x86_64.AppImage");
  assert.equal(found.version, "0.10.1");
});

test("drafts and prereleases are not installed", async () => {
  const name = "Testeiya-x86_64.AppImage";
  const { fetch } = github([
    release("0.12.0", [asset(name)], { draft: true }),
    release("0.11.0", [asset(name)], { prerelease: true }),
    release("0.10.1", [asset(name)]),
  ]);
  const found = await new Releases({ fetch, env: {} }).find(name);
  assert.equal(found.version, "0.10.1");
});

test("no release with the build is an error naming the build", async () => {
  const { fetch } = github([release("0.10.2", [])]);
  await assert.rejects(new Releases({ fetch, env: {} }).find("x.dmg"), /no release has x\.dmg/);
});

test("a rate limit points at GITHUB_TOKEN", async () => {
  const { fetch } = github([], { listStatus: 403 });
  await assert.rejects(new Releases({ fetch, env: {} }).find("x.dmg"), /GITHUB_TOKEN/);
});

test("GITHUB_TOKEN goes to the api and not to the download", async () => {
  const name = "Testeiya-x86_64.AppImage";
  const { fetch, calls } = github([release("0.10.1", [asset(name)])]);
  const releases = new Releases({ fetch, env: { GITHUB_TOKEN: "secret" } });
  const found = await releases.find(name);
  await releases.download(found, join(sandbox(), "file"));
  assert.equal(calls[0].headers.Authorization, "Bearer secret");
  assert.equal(calls[1].headers.Authorization, undefined);
});

test("a corrupted download is refused", async () => {
  const name = "Testeiya-x86_64.AppImage";
  const { fetch } = github([release("0.10.1", [asset(name)])], { bytes: Buffer.from("tampered") });
  const releases = new Releases({ fetch, env: {} });
  await assert.rejects(releases.download(await releases.find(name), join(sandbox(), "file")), /checksum/);
});

test("linux installs a runnable AppImage with a menu entry", async () => {
  const home = sandbox();
  const code = await runInstallApp({}, deps(home, "linux"));
  assert.equal(code, 0);

  const appImage = join(home, ".local/bin/Testeiya-x86_64.AppImage");
  assert.deepEqual(readFileSync(appImage), BYTES);
  assert.equal(statSync(appImage).mode & 0o111, 0o111);

  const entry = readFileSync(join(home, ".local/share/applications/testeiya.desktop"), "utf8");
  assert.match(entry, new RegExp(`Exec="${appImage}"`));
  assert.doesNotMatch(entry, /appimage-extract-and-run/);
});

test("linux without fuse launches through extract-and-run", async () => {
  const home = sandbox();
  const run = async () => ({ code: 127, stdout: "", stderr: "" });
  await runInstallApp({}, deps(home, "linux", { run }));
  const entry = readFileSync(join(home, ".local/share/applications/testeiya.desktop"), "utf8");
  assert.match(entry, /--appimage-extract-and-run/);
});

test("an installed app is left alone and nothing is fetched", async () => {
  const home = sandbox();
  const appImage = join(home, ".local/bin/Testeiya-x86_64.AppImage");
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  writeFileSync(appImage, "existing");

  const { fetch, calls } = github([]);
  const lines = [];
  const code = await runInstallApp({}, deps(home, "linux", { fetch, out: (line) => lines.push(line) }));

  assert.equal(code, 0);
  assert.equal(calls.length, 0);
  assert.equal(readFileSync(appImage, "utf8"), "existing");
  assert.match(lines.join(""), /already installed/);
  assert.match(lines.join(""), /--force/);
});

test("--force replaces the installed app", async () => {
  const home = sandbox();
  const appImage = join(home, ".local/bin/Testeiya-x86_64.AppImage");
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  writeFileSync(appImage, "existing");

  await runInstallApp({ force: true }, deps(home, "linux"));
  assert.deepEqual(readFileSync(appImage), BYTES);
});

test("--json reports what happened on stdout", async () => {
  const home = sandbox();
  let lines = [];
  await runInstallApp({ json: true }, deps(home, "linux", { out: (line) => lines.push(line) }));
  const installed = JSON.parse(lines.join(""));
  assert.equal(installed.status, "installed");
  assert.equal(installed.version, "0.10.1");
  assert.equal(installed.path, join(home, ".local/bin/Testeiya-x86_64.AppImage"));

  lines = [];
  await runInstallApp({ json: true }, deps(home, "linux", { out: (line) => lines.push(line) }));
  assert.equal(JSON.parse(lines.join("")).status, "already-installed");
});

test("a failed download leaves no install behind", async () => {
  const home = sandbox();
  const { fetch } = github([release("0.10.1", [asset("Testeiya-x86_64.AppImage")])], { bytes: Buffer.from("tampered") });
  await assert.rejects(runInstallApp({}, deps(home, "linux", { fetch })), /checksum/);
  assert.equal(existsSync(join(home, ".local/bin/Testeiya-x86_64.AppImage")), false);
});

test("macos copies the app out of the dmg, detaches, and clears quarantine", async () => {
  const home = sandbox();
  const commands = [];
  const run = async (command, args) => {
    commands.push([command, ...args]);
    if (command === "hdiutil" && args[0] === "attach") {
      mkdirSync(join(args[args.indexOf("-mountpoint") + 1], "Testeiya.app"), { recursive: true });
    }
    if (command === "ditto") mkdirSync(args[1], { recursive: true });
    return { code: 0, stdout: "", stderr: "" };
  };
  const fetch = github([release("0.10.1", [asset("stable-macos-arm64-Testeiya.dmg")])]).fetch;
  const code = await runInstallApp({}, deps(home, "darwin", { arch: "arm64", fetch, run }));

  assert.equal(code, 0);
  // No /Applications on the machine running this test, so the home folder wins.
  assert.equal(existsSync(join(home, "Applications/Testeiya.app")), true);
  assert.deepEqual(
    commands.map(([command]) => command),
    ["hdiutil", "ditto", "xattr", "hdiutil"]
  );
  assert.equal(commands.at(-1)[1], "detach");
});

test("macos detaches the dmg when the copy fails", async () => {
  const home = sandbox();
  const commands = [];
  const run = async (command, args) => {
    commands.push([command, ...args]);
    if (command === "hdiutil" && args[0] === "attach") {
      mkdirSync(join(args[args.indexOf("-mountpoint") + 1], "Testeiya.app"), { recursive: true });
    }
    return { code: command === "ditto" ? 1 : 0, stdout: "", stderr: "disk full" };
  };
  const fetch = github([release("0.10.1", [asset("stable-macos-x64-Testeiya.dmg")])]).fetch;
  await assert.rejects(runInstallApp({}, deps(home, "darwin", { fetch, run })), /disk full/);
  assert.equal(commands.at(-1)[1], "detach");
  assert.equal(existsSync(join(home, "Applications/Testeiya.app")), false);
});

function windowsRun(commands) {
  return async (command, args) => {
    commands.push([command, ...args]);
    if (command.endsWith("tar.exe")) {
      const bin = join(args[args.indexOf("-C") + 1], "Testeiya/bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, "launcher.exe"), "exe");
    }
    return { code: 0, stdout: "", stderr: "" };
  };
}

const WINDOWS_FETCH = github([release("0.10.1", [asset("stable-win-x64-Testeiya.zip")])]).fetch;

test("windows installs per user, with a start menu shortcut and nothing on the system drive", async () => {
  const home = sandbox();
  const drive = sandbox();
  const local = sandbox();
  const commands = [];
  const env = { SystemDrive: drive, SystemRoot: "/windows", LOCALAPPDATA: local, APPDATA: join(home, "AppData") };
  const lines = [];
  const code = await runInstallApp({ json: true }, deps(home, "win32", { fetch: WINDOWS_FETCH, run: windowsRun(commands), env, out: (line) => lines.push(line) }));

  assert.equal(code, 0);
  const launcher = join(local, "Testeiya/Testeiya/bin/launcher.exe");
  assert.equal(existsSync(launcher), true);
  assert.equal(JSON.parse(lines.join("")).path, launcher);
  assert.equal(existsSync(join(drive, "Testeiya")), false);
  assert.equal(commands[0][0], "/windows/System32/tar.exe");
  assert.equal(commands[1][0], "powershell.exe");
  assert.ok(commands[1].join(" ").includes(launcher));
});

test("windows finds an install made by hand on the system drive", async () => {
  const home = sandbox();
  const drive = sandbox();
  const bin = join(drive, "Testeiya/Testeiya/bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "launcher.exe"), "exe");

  const { fetch, calls } = github([]);
  const lines = [];
  const env = { SystemDrive: drive, LOCALAPPDATA: sandbox() };
  await runInstallApp({}, deps(home, "win32", { fetch, env, out: (line) => lines.push(line) }));
  assert.equal(calls.length, 0);
  assert.match(lines.join(""), /already installed/);
});

test("windows refuses an archive without the launcher", async () => {
  const local = sandbox();
  const env = { SystemRoot: "/windows", LOCALAPPDATA: local };
  await assert.rejects(runInstallApp({}, deps(sandbox(), "win32", { fetch: WINDOWS_FETCH, env })), /launcher/);
  assert.equal(existsSync(join(local, "Testeiya")), false);
});

test("the linux menu icon ships in the package", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.files.includes("assets/testeiya-app-icon.png"));
});

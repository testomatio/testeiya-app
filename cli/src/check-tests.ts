// One place to run the `check-tests` CLI for manual-test sync (pull & push).
//
// Used by the initial project pull (agent-start) and the in-app Sync button
// (api/workspace-sync). We resolve the LOCAL `check-tests` bin we already ship
// as a dependency and run it with the current runtime — this avoids the slow
// `npx check-tests@latest` registry download (which can take 30s+ on a cold
// cache and made the first project pull appear to hang). `npx` stays as a
// fallback only when the local bin can't be resolved.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { writeSyncSnapshot } from "./sync-snapshot.js";
import { publishCheckTests } from "./debug-bus.js";

const require = createRequire(import.meta.url);
const RUN_TIMEOUT_MS = 120_000;

let cachedBin: string | null | undefined;

/** Run `check-tests <pull|push> -d <dir>` in `cwd` with the project token. */
export async function runCheckTests(
  action: CheckTestsAction,
  opts: RunCheckTestsOptions
): Promise<RunCheckTestsResult> {
  const dir = opts.dir || ".";
  const env: Record<string, string> = { ...process.env, TESTOMATIO: opts.token };
  if (opts.baseUrl) env.TESTOMATIO_URL = opts.baseUrl;

  const bin = resolveCheckTestsBin();
  let command = "npx";
  let args = ["-y", "check-tests@latest", action, "-d", dir];
  if (bin) {
    command = process.execPath;
    args = [bin, action, "-d", dir];
  }
  if (action === "pull") {
    args.push("--force");
    if (opts.exportAutomated) args.push("--export-automated");
    if (opts.suiteIds?.length) args.push("--suite-ids", opts.suiteIds.join(","));
  }
  if (action === "push" && opts.files?.length) {
    args.push("-f", ...toDirRelative(opts.files, dir));
  }

  console.log(
    `[check-tests] ${action} -d ${dir} (cwd ${opts.cwd})${bin ? " [local bin]" : " [npx]"}`
  );

  const started = Date.now();
  return new Promise<RunCheckTestsResult>((resolve) => {
    const child = spawn(command, args, { cwd: opts.cwd, env });
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      output += `\n[check-tests] timed out after ${RUN_TIMEOUT_MS}ms`;
    }, RUN_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      const out = `${output}\n${err.message}`.trim();
      publishCheckTests({ action, dir, code: null, output: out, durationMs: Date.now() - started });
      resolve({ ok: false, action, dir, output: out });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      console.log(`[check-tests] ${action} exited ${code}`);
      publishCheckTests({
        action,
        dir,
        code,
        output: output.trim(),
        durationMs: Date.now() - started,
      });
      if (code === 0) snapshotAfterSync(opts.cwd, dir, opts.files);
      resolve({ ok: code === 0, action, dir, output: output.trim() });
    });
  });
}

/** Resolve the shipped `check-tests` CLI entry, cached after the first lookup. */
function resolveCheckTestsBin(): string | null {
  if (cachedBin !== undefined) return cachedBin;
  const candidates: string[] = [];
  try {
    candidates.push(require.resolve("check-tests/package.json"));
  } catch {
    /* not resolvable from here — try cwd below */
  }
  candidates.push(path.join(process.cwd(), "node_modules/check-tests/package.json"));
  for (const pkgPath of candidates) {
    try {
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      let binRel = pkg.bin;
      if (binRel && typeof binRel === "object") {
        binRel = binRel["check-tests"] ?? Object.values(binRel)[0];
      }
      if (!binRel || typeof binRel !== "string") continue;
      cachedBin = path.resolve(path.dirname(pkgPath), binRel);
      return cachedBin;
    } catch {
      continue;
    }
  }
  cachedBin = null;
  return null;
}

/** Refresh the change-tracking baseline; never let a snapshot error break sync. */
function snapshotAfterSync(cwd: string, dir: string, onlyFiles?: string[]): void {
  try {
    writeSyncSnapshot(cwd, dir, onlyFiles);
  } catch (err) {
    console.error(
      `[check-tests] snapshot failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Re-base cwd-relative paths onto the `-d` dir for `check-tests push -f`. */
function toDirRelative(files: string[], dir: string): string[] {
  const base = dir === "." ? "" : dir;
  if (!base) return files;
  return files.map((f) => (f.startsWith(`${base}/`) ? f.slice(base.length + 1) : f));
}

export type CheckTestsAction = "pull" | "push";

export interface RunCheckTestsOptions {
  cwd: string;
  dir: string;
  token: string;
  baseUrl?: string;
  // push: only these files (cwd-relative) via `-f`; also scopes the snapshot.
  // pull: scopes the snapshot re-baseline to these files (a single-suite pull).
  files?: string[];
  // pull: `--suite-ids` (e.g. `@S12345678`) to fetch only specific suites.
  suiteIds?: string[];
  // pull: include automated tests in the exported markdown (`--export-automated`).
  exportAutomated?: boolean;
}

export interface RunCheckTestsResult {
  ok: boolean;
  action: CheckTestsAction;
  dir: string;
  output: string;
}

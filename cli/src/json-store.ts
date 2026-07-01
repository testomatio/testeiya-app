import fs from "node:fs";
import path from "node:path";

/**
 * Small JSON-on-disk helpers shared by the file-backed stores. Reads fall back
 * to a default on a missing/garbage file; writes are atomic (temp file + rename)
 * so a crash mid-write can't truncate the store. `mode` is preserved for
 * credential files that must stay `0o600`.
 */

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown, opts?: { mode?: number }): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const json = JSON.stringify(value, null, 2);
  if (opts?.mode) {
    fs.writeFileSync(tmp, json, { mode: opts.mode });
  } else {
    fs.writeFileSync(tmp, json);
  }
  fs.renameSync(tmp, file);
  // rename may not carry the mode on every platform, so set it explicitly.
  if (opts?.mode) fs.chmodSync(file, opts.mode);
}

export function updateJson<T extends Record<string, unknown>>(
  file: string,
  fallback: T,
  patch: (current: T) => T,
  opts?: { mode?: number }
): T {
  const next = patch(readJson<T>(file, fallback));
  writeJson(file, next, opts);
  return next;
}

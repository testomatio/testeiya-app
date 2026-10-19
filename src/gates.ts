import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";

import type { Changes } from "./git.js";
import type { ChangesRule, Gate } from "./pipeline-file.js";

const RUN_LIMIT_MS = 30_000;

/** Check each named gate once. A gate passes only when all its checks do. */
export async function checkGates(
  gates: Record<string, Gate>,
  names: Iterable<string>,
  context: GateContext
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  for (const name of names) {
    if (results.has(name)) continue;
    results.set(name, await passes(gates[name]!, context));
  }
  return results;
}

/** `${NAME}` and `${NAME:-default}`, the shell's rule: unset is empty. */
export function expand(text: string, env: Env): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
    const value = env[name];
    if (value) return value;
    return fallback ?? "";
  });
}

/** Whether the changed files satisfy a `changes` check. */
export function matchChanges(files: string[], rule: ChangesRule): boolean {
  const counted = files.filter((file) => !(rule.ignore ?? []).some((mask) => matchesGlob(file, mask)));
  if (rule.minFiles && counted.length < rule.minFiles) return false;
  if (rule.paths && !counted.some((file) => rule.paths!.some((mask) => matchesGlob(file, mask)))) return false;
  return counted.length > 0;
}

async function passes(gate: Gate, context: GateContext): Promise<boolean> {
  const { env, cwd, changes } = context;
  if (gate.env && !gate.env.every((name) => Boolean(env[name]))) return false;
  if (gate.file && !gate.file.every((path) => existsSync(resolve(cwd, expand(path, env))))) return false;
  if (gate.changes && !(changes.files && matchChanges(changes.files, gate.changes))) return false;
  if (gate.run && !(await succeeds(expand(gate.run, env), cwd, env))) return false;
  return true;
}

function succeeds(command: string, cwd: string, env: Env): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(command, { shell: true, cwd, env, stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), RUN_LIMIT_MS);
    child.on("error", () => done(false));
    child.on("close", (code) => {
      clearTimeout(timer);
      done(code === 0);
    });
  });
}

type Env = Record<string, string | undefined>;

export interface GateContext {
  cwd: string;
  env: Env;
  changes: Changes;
}

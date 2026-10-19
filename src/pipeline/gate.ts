import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";

import type { Changes } from "../git.js";
import type { GateSpec } from "./spec.js";
import type { Variables } from "./variables.js";

const RUN_LIMIT_MS = 30_000;

/** A named check. It passes only when every check it has passes. */
export class Gate {
  constructor(
    readonly name: string,
    private readonly spec: GateSpec
  ) {}

  /** A gate the CI job adds with `--gate NAME:COMMAND`. */
  static command(name: string, run: string): Gate {
    return new Gate(name, { run, message: `The ${name} gate did not pass.` });
  }

  get message(): string {
    return this.spec.message;
  }

  get readsChanges(): boolean {
    return Boolean(this.spec.changes);
  }

  async passes(context: GateContext): Promise<boolean> {
    const { spec } = this;
    const { vars, cwd } = context;
    if (spec.env && !spec.env.every((name) => Boolean(vars.get(name)))) return false;
    if (spec.file && !spec.file.every((path) => existsSync(resolve(cwd, vars.expand(path))))) return false;
    if (spec.changes && !this.matchesChanges(context.changes)) return false;
    if (spec.run && !(await this.succeeds(vars.expand(spec.run), context))) return false;
    return true;
  }

  private matchesChanges(changes: Changes): boolean {
    const rule = this.spec.changes!;
    if (!changes.files) return false;
    const counted = changes.files.filter((file) => !(rule.ignore ?? []).some((mask) => matchesGlob(file, mask)));
    if (rule.min_files && counted.length < rule.min_files) return false;
    if (rule.paths && !counted.some((file) => rule.paths!.some((mask) => matchesGlob(file, mask)))) return false;
    return counted.length > 0;
  }

  private succeeds(command: string, context: GateContext): Promise<boolean> {
    return new Promise((done) => {
      const child = spawn(command, { shell: true, cwd: context.cwd, env: context.vars.toEnv(), stdio: "ignore" });
      const timer = setTimeout(() => child.kill("SIGKILL"), RUN_LIMIT_MS);
      child.on("error", () => done(false));
      child.on("close", (code) => {
        clearTimeout(timer);
        done(code === 0);
      });
    });
  }
}

export interface GateContext {
  cwd: string;
  vars: Variables;
  changes: Changes;
}

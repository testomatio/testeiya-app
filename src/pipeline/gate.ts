import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";

import type { Changes } from "../git.js";
import { ChangesMarker, FileMarker, ShellMarker, type Marked } from "./markers.js";
import type { ChangesSpec } from "./spec.js";
import type { Variables } from "./variables.js";

const RUN_LIMIT_MS = 30_000;

/**
 * A check the runner makes before the first stage: a prerequisite's
 * `$value!sh`, `$value!file` or `$value!changes`, or a `--gate`. Its result
 * goes on the marker, so the formulas that read the prerequisite see it.
 */
export class Gate {
  constructor(
    readonly name: string,
    readonly message: string,
    private readonly check: Marked,
    /** The rule of a `$value!changes`, as `PipelineSource` checked it. */
    private readonly rule?: ChangesSpec,
  ) {}

  /** A gate the CI job adds with `--gate NAME:COMMAND`. */
  static command(name: string, run: string): Gate {
    return new Gate(name, `The ${name} gate did not pass.`, new ShellMarker(run));
  }

  get readsChanges(): boolean {
    return this.check instanceof ChangesMarker;
  }

  async passes(context: GateContext): Promise<boolean> {
    this.check.passed = await this.evaluate(context);
    return this.check.passed;
  }

  private async evaluate(context: GateContext): Promise<boolean> {
    const { check } = this;
    if (check instanceof FileMarker) return Gate.list(check.paths).every((path) => existsSync(resolve(context.cwd, path)));
    if (check instanceof ChangesMarker) return this.matchesChanges(context.changes);
    if (check instanceof ShellMarker) return this.succeeds(String(check.command), context);
    return false;
  }

  private matchesChanges(changes: Changes): boolean {
    const rule = this.rule ?? {};
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

  private static list(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    return [String(value)];
  }
}

export interface GateContext {
  cwd: string;
  vars: Variables;
  changes: Changes;
}

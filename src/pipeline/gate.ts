import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";

import { parseExtractFields, type ExtractField } from "../extract-fields.js";
import type { Changes } from "../git.js";
import { ChangesMarker, ExtractMarker, FileMarker, ShellMarker, type Marked } from "./markers.js";
import type { PipelineInput } from "./pipeline-input.js";
import type { GateSpec } from "./spec.js";
import type { Variables } from "./variables.js";

const RUN_LIMIT_MS = 30_000;

/**
 * A check the runner makes before the first stage: a prerequisite's
 * `$value!sh`, `$value!file`, `$value!changes` or `$value!extract`, or a
 * `--gate`. Its result goes on the marker, so the formulas that read the
 * prerequisite see it.
 */
export class Gate {
  constructor(
    readonly name: string,
    private readonly text: string,
    private readonly check: Marked,
    /** The prerequisite as `PipelineSource` checked it: the rule of a `$value!changes`, the values of a `$value!extract`. */
    private readonly spec?: GateSpec,
  ) {}

  /** Why it did not pass. */
  get message(): string {
    const { check } = this;
    if (!(check instanceof ExtractMarker)) return this.text;
    return check.reason(this.text, (this.spec?.extract ?? []).map((field) => field.split(":")[0]!));
  }

  /** The values a `$value!extract` found, once every one was. */
  get found(): Record<string, string> | undefined {
    return this.check instanceof ExtractMarker ? this.check.values : undefined;
  }

  /** A gate the CI job adds with `--gate NAME:COMMAND`. */
  static command(name: string, run: string): Gate {
    return new Gate(name, `The ${name} gate did not pass.`, new ShellMarker(run));
  }

  get readsChanges(): boolean {
    return this.check instanceof ChangesMarker;
  }

  /** It finds values, and may ask the agent for them. */
  get extracts(): boolean {
    return this.check instanceof ExtractMarker;
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
    if (check instanceof ExtractMarker) return this.extract(check, context);
    return false;
  }

  /** Each value from the input, the rest from the agent. One that is still empty fails it. */
  private async extract(check: ExtractMarker, context: GateContext): Promise<boolean> {
    const fields = parseExtractFields(this.spec?.extract ?? []);
    // The builder already checked the values.
    if (typeof fields === "string") throw new Error(fields);
    const values: Record<string, string> = {};
    for (const field of fields) {
      const value = context.input.find(this.name, field.name);
      if (value !== undefined) values[field.name] = value;
    }
    const missing = fields.filter((field) => values[field.name] === undefined);
    check.asked = missing.length > 0 && context.extract !== undefined;
    if (missing.length > 0 && context.extract) {
      const found = await context.extract(this.name, missing);
      for (const field of missing) if (found[field.name]?.trim()) values[field.name] = found[field.name]!.trim();
    }
    check.values = undefined;
    check.empty = fields.filter((field) => values[field.name] === undefined).map((field) => field.name);
    if (check.empty.length > 0) return false;
    check.values = values;
    return true;
  }

  private matchesChanges(changes: Changes): boolean {
    const rule = this.spec?.changes ?? {};
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
  /** Values the job passed: a `$value!extract` takes them first. */
  input: PipelineInput;
  /** Asks the agent for the values the input does not have. None: they stay empty, as in a dry run. */
  extract?: Extractor;
}

/** Finds the values of one prerequisite; one it cannot find is left out. */
export type Extractor = (prerequisite: string, fields: ExtractField[]) => Promise<Record<string, string>>;

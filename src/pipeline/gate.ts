import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";

import type { Decision, DecisionRequest } from "../decision.js";
import { ExtractFields, type ExtractField } from "../extract-fields.js";
import type { Changes } from "../git.js";
import { ContextReader } from "./decide-context.js";
import { ChangesMarker, DecideMarker, ExtractMarker, FileMarker, ShellMarker, type Marked } from "./markers.js";
import type { PipelineValues } from "./pipeline-definition.js";
import type { GateSpec } from "./spec.js";
import type { Variables } from "./variables.js";

const RUN_LIMIT_MS = 30_000;

/**
 * A check the runner makes before the first stage: a prerequisite's
 * `$value!sh`, `$value!file`, `$value!changes`, `$value!decide` or
 * `$value!extract`, or a `--gate`. Its result goes on the marker, so the formulas that read the
 * prerequisite see it.
 */
export class Gate {
  constructor(
    readonly name: string,
    private readonly text: string,
    private readonly check: Marked,
    /** The prerequisite as `PipelineSource` checked it: the rule of a `$value!changes`, a `$value!decide`, a `$value!extract`. */
    private readonly spec?: GateSpec,
  ) {}

  /** Why it did not pass. */
  get message(): string {
    const { check } = this;
    if (!(check instanceof ExtractMarker)) return this.text;
    return check.reason(this.text, ExtractFields.names(this.spec?.extract?.values ?? []));
  }

  /** The values a `$value!extract` found, once every one was. */
  get found(): Record<string, string> | undefined {
    return this.check instanceof ExtractMarker ? this.check.values : undefined;
  }

  /** What a run would ask a model for, which a dry run and a check do not. Undefined: nothing waits. */
  get pending(): string | undefined {
    const { check } = this;
    if (check instanceof ExtractMarker && check.pending.length > 0) return `a run asks the agent for ${check.pending.join(", ")}`;
    if (check instanceof DecideMarker && this.waiting) return "a run asks the decision model";
    return undefined;
  }

  private waiting = false;

  /** A gate the CI job adds with `--gate NAME:COMMAND`. */
  static command(name: string, run: string): Gate {
    return new Gate(name, `The ${name} gate did not pass.`, new ShellMarker(run));
  }

  get readsChanges(): boolean {
    return this.check instanceof ChangesMarker;
  }

  /** It asks a model: the agent for values, or the decision model. */
  get asks(): boolean {
    return this.check instanceof ExtractMarker || this.check instanceof DecideMarker;
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
    if (check instanceof DecideMarker) return this.decide(context);
    return false;
  }

  /** The agent finds the values with its tools. One that is still empty fails it. A dry run asks no agent: each reads as `<name>`. */
  private async extract(check: ExtractMarker, context: GateContext): Promise<boolean> {
    const fields = ExtractFields.checked(this.spec?.extract?.values ?? []);
    const values: Record<string, string> = {};
    check.values = undefined;
    check.pending = [];
    if (!context.extract) {
      check.pending = fields.map((field) => field.name);
      for (const field of fields) values[field.name] = `<${field.name}>`;
    } else {
      const found = await context.extract(this.name, context.values().extracts(this.name), fields);
      for (const field of fields) if (found[field.name]?.trim()) values[field.name] = found[field.name]!.trim();
    }
    check.empty = fields.filter((field) => values[field.name] === undefined).map((field) => field.name);
    if (check.empty.length > 0) return false;
    check.values = values;
    return true;
  }

  /** Yes from the decision model, judging its context. A dry run asks none and counts on yes. */
  private async decide(context: GateContext): Promise<boolean> {
    this.waiting = !context.decide;
    if (!context.decide) return true;
    const asked = context.values().decide(this.name, true);
    const state = await new ContextReader({ cwd: context.cwd, vars: context.vars }).read(asked.context);
    try {
      const decision = await context.decide({ question: asked.question.trim(), state, threshold: this.spec?.decide?.threshold });
      return decision.answer === "yes";
    } catch {
      // A call that failed is not a yes: the prerequisite fails closed.
      return false;
    }
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
  /** The pipeline's values for these variables: the text of a `$value!decide` or `$value!extract`, `{{ }}` filled in. */
  values: () => PipelineValues;
  /** Asks the agent for values. None in a dry run or a check. */
  extract?: Extractor;
  /** Asks the decision model. None in a dry run or a check. */
  decide?: (request: DecisionRequest) => Promise<Decision>;
}

/** Finds the values of one prerequisite, `what` saying what they are; one it cannot find is left out. */
export type Extractor = (prerequisite: string, what: string, fields: ExtractField[]) => Promise<Record<string, string>>;

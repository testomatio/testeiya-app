import { ResolveFailed, type Document, type Marked as DocumentMark } from "scripted-yaml/core";

import { ExtractFields } from "../extract-fields.js";
import { ExtractMarker, TaskMarker, type Marked } from "./markers.js";
import { PipelineError } from "./pipeline-error.js";
import type { InputUse, PipelineSpec } from "./spec.js";

/** Where the file reads a variable. `within` is the `env:` key whose value reads it. */
export interface InputRead {
  name: string;
  use: InputUse;
  /** A shell `${NAME:-default}`. */
  default?: string;
  within?: string;
  /** A `when` read: the stage it is in. None for the top-level `when`. */
  stage?: string;
}

/** A variable of `$vars`. Required: neither `optional: true` nor a `default`, so a run without it is bad usage. */
export interface DeclaredVariable {
  name: string;
  required: boolean;
  default?: string;
  about?: string;
  secret: boolean;
}

type Raw = Record<string, unknown>;

/**
 * A checked pipeline: its spec, the one YAML file it runs from, and the
 * loaded scripted-yaml document that computes its formulas for a run.
 */
export class PipelineDefinition {
  constructor(
    readonly spec: PipelineSpec,
    /** The file with `$extends` and overrides applied. It needs nothing else to run. */
    readonly text: string,
    /** Every variable the file reads, and where. */
    readonly reads: InputRead[],
    private readonly document: Document,
    private readonly markers: Map<string, Marked>,
  ) {
    this.found();
  }

  /** The checks the runner makes before the first stage, by prerequisite: `$value!sh`, `$value!file`, `$value!changes`, `$value!extract`. */
  checks(): Map<string, Marked> {
    return new Map(this.markers);
  }

  /** The variables `$vars` declares, with what a UI needs to ask for one. */
  variables(): DeclaredVariable[] {
    return this.document.variables
      .filter((variable) => !variable.host)
      .map((variable) => {
        const declared: DeclaredVariable = { name: variable.name, required: variable.required, secret: variable.secret };
        if (variable.default !== undefined && variable.default !== null) declared.default = String(variable.default);
        if (variable.about !== undefined) declared.about = variable.about;
        return declared;
      });
  }

  /** The `default` of each variable `$vars` declares: a stage's shell sees it when no one set the variable. */
  defaults(): Record<string, string> {
    return Object.fromEntries(this.variables().flatMap((variable) => (variable.default === undefined ? [] : [[variable.name, variable.default]])));
  }

  /**
   * Runs the file's `$tests`: each gives variables and the values it expects.
   * Call it before the checks: an unchecked check reads as false, as a test says.
   */
  async test(): Promise<Array<{ about: string; failures: string[] }>> {
    return (await this.document.test()).map(({ about, failures }) => ({ about, failures }));
  }

  /** Every formula and `{{ }}` computed with these variables. Checks the runner has not made read as false. */
  values(vars: Record<string, string | undefined>): PipelineValues {
    this.found();
    try {
      return new PipelineValues(this.spec, this.document.resolve({ vars }) as Raw, this.reasons());
    } catch (err) {
      if (err instanceof ResolveFailed) throw new PipelineError(err.message);
      throw err;
    }
  }

  /**
   * What a formula reads for each `$value!extract`: the values once every one was found, else null,
   * so `prerequisites.git.sha` is null until then and `prerequisites.git != null` says if they were.
   */
  private found(): void {
    for (const [name, check] of this.markers) {
      if (!(check instanceof ExtractMarker)) continue;
      const mark = this.mark(`prerequisites.${name}.$value!extract`);
      if (mark) mark.value = check.values ? { ...check.values } : null;
    }
  }

  /** What a `$value!extract` that did not pass says: the values it did not find. */
  private reasons(): Record<string, string> {
    const reasons: Record<string, string> = {};
    for (const [name, check] of this.markers) {
      const gate = this.spec.prerequisites[name];
      if (!(check instanceof ExtractMarker) || !gate?.extract) continue;
      reasons[name] = check.reason(gate.message, ExtractFields.names(gate.extract));
    }
    return reasons;
  }

  private mark(path: string): DocumentMark | undefined {
    return this.document.marked.find((mark) => mark.path === path);
  }
}

/** One run's values of a pipeline: what passes, what runs, the texts with `{{ }}` filled in. */
export class PipelineValues {
  constructor(
    private readonly spec: PipelineSpec,
    private readonly data: Raw,
    /** A prerequisite's message for this run, where it is not the one written. */
    private readonly reasons: Record<string, string> = {},
  ) {}

  passes(name: string): boolean {
    const gate = (this.data.prerequisites as Raw | undefined)?.[name];
    const value = PipelineValues.isRecord(gate) ? gate.$value : gate;
    // Its values once every one was found, else null.
    if (this.spec.prerequisites[name]?.extract) return PipelineValues.isRecord(value);
    return this.truth(value, `prerequisite "${name}"`, this.spec.prerequisites[name]?.formula);
  }

  /** The top-level `when`. */
  runs(): boolean {
    return this.truth(this.data.when ?? true, "when", this.spec.condition);
  }

  stageRuns(id: string): boolean {
    const stage = this.stage(id);
    return this.truth(stage.when ?? true, `stage "${id}" when`, this.spec.stages.find((spec) => spec.id === id)?.condition);
  }

  /** Why `when` is false: the message of the first prerequisite it reads that does not pass. */
  reason(names: string[], formula: string | undefined): string {
    const closed = names.find((name) => !this.passes(name));
    if (closed) return this.reasons[closed] ?? this.spec.prerequisites[closed]!.message;
    return `when is false: ${formula ?? ""}`.trim();
  }

  /** The text of a stage's `run!task` or `run!decide`, `{{ }}` filled in. */
  task(id: string): string {
    const run = this.stage(id).run;
    return run instanceof TaskMarker ? String(run.text ?? "") : "";
  }

  summary(): string | undefined {
    const summary = this.data.summary;
    return summary === undefined || summary === null ? undefined : String(summary);
  }

  /** `env:` as the shell gets it. A value that is null is not set. */
  env(): Record<string, string> {
    return PipelineValues.texts(this.data.env);
  }

  packages(): Record<string, string> {
    return PipelineValues.texts(this.data.packages);
  }

  private stage(id: string): Raw {
    const stages = Array.isArray(this.data.stages) ? (this.data.stages as Raw[]) : [];
    return stages.find((stage) => stage.id === id) ?? {};
  }

  // A check reads as "1" or "0"; a formula has to say true or false.
  private truth(value: unknown, what: string, formula?: string): boolean {
    if (value === true || value === "1") return true;
    if (value === false || value === "0") return false;
    throw new PipelineError(`${what} is ${JSON.stringify(value ?? null)}, not true or false: ${formula ?? ""}. Compare a variable with null: vars.NAME != null`);
  }

  private static texts(value: unknown): Record<string, string> {
    if (!PipelineValues.isRecord(value)) return {};
    const texts: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) if (item !== null && item !== undefined) texts[key] = String(item);
    return texts;
  }

  private static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

/**
 * A pipeline file, key for key. PIPELINES.md documents every field.
 * `PipelineSource` validates the scripted-yaml file into these shapes. A
 * formula stays as it is written (`condition`, `task`): `PipelineValues`
 * computes it for one run.
 */

/** The targets a host acts on. Any other word is free text and means "started by hand". */
export const PIPELINE_TARGETS = ["pr", "issue", "daily-cron", "weekly-cron"] as const;

export interface PipelineSpec {
  name: string;
  description: string;
  /** What starts it, for grouping: one of `PIPELINE_TARGETS`, or free text. */
  target?: string;
  /** Extra instructions for the final summary. */
  summary?: string;
  /** Variables for every stage, as written: a `KEY!` value is a formula. */
  env: Record<string, string>;
  /** npm package name to version, as written, installed for the run. */
  packages: Record<string, string>;
  /** Named checks, defined once. */
  prerequisites: Record<string, GateSpec>;
  /** The prerequisites the top-level `when` reads, also through other prerequisites. One fails: nothing runs. */
  when: string[];
  /** The top-level `when!` formula. None: the pipeline always runs. */
  condition?: string;
  stages: StageSpec[];
}

/** A prerequisite: a formula over variables and other prerequisites, or one check the runner makes. */
export interface GateSpec {
  /** `$value!:` the formula. */
  formula?: string;
  /** `$value!file:` every path exists, relative to the checkout. */
  file?: string[];
  /** `$value!sh:` the command exits 0 within 30 seconds. */
  run?: string;
  /** `$value!changes:` the changed files match. */
  changes?: ChangesSpec;
  /** Why the prerequisite failed, shown when it skips something. */
  message: string;
  /** The variables its formula reads: what a user sets to pass it. */
  env: string[];
  /** The other prerequisites its formula reads. */
  needs: string[];
  /** One of its variables is declared `secret: true` in `$vars`. */
  secret: boolean;
}

export interface ChangesSpec {
  /** At least one counted file matches. */
  paths?: string[];
  /** These never count. */
  ignore?: string[];
  /** At least this many count. */
  min_files?: number;
}

/** Exactly one of `task` or `run`; at most one of `each_line` or `each_file`. */
export interface StageSpec {
  id: string;
  /** Names the stage's section in the final report. */
  title: string;
  emoji: string;
  /** An agent stage: the task text, `{{ }}` as written. */
  task?: string;
  /** A command stage: the shell command of `run!sh`. */
  run?: string;
  /** A named, persistent conversation. */
  session?: string;
  inputs: string[];
  outputs: string[];
  /** The prerequisites its `when` reads, also through other prerequisites. One fails: the stage is skipped. */
  when: string[];
  /** The `when!` formula. None: the stage runs. */
  condition?: string;
  /** When the pipeline stops after this stage. `fail` is there unless the stage is optional or has `continueOn: fail`. */
  stopOn: StopOn[];
  /** Its fail, break or timeout neither stops the pipeline nor fails the run. */
  optional: boolean;
  /** "90s", "30m", "1h", or seconds. */
  timeout?: string | number;
  each_line?: string;
  each_file?: string;
}

export type StopOn = "fail" | "gate";

/** A pipeline as a UI shows it: what runs, what it needs, what a user can set. `Pipeline.describe()` returns it. */
export interface PipelineDescription {
  name: string;
  description: string;
  target?: string;
  summary?: string;
  stages: StageView[];
  prerequisites: PrerequisiteView[];
  inputs: PipelineInput[];
}

export interface StageView {
  id: string;
  title: string;
  emoji: string;
  kind: "task" | "run";
  /** The task or the command. */
  text: string;
  session?: string;
  /** Prerequisite names its `when` reads. */
  when: string[];
  /** The `when!` formula, as written. */
  condition?: string;
  inputs: string[];
  outputs: string[];
  loop?: { each_line: string } | { each_file: string };
  stopOn: StopOn[];
  optional: boolean;
  timeout?: string | number;
}

export interface PrerequisiteView {
  name: string;
  message: string;
  /** run: in the top-level when. stages: only in stage whens. unused: in neither. */
  scope: "run" | "stages" | "unused";
  /** Stage ids whose `when` names it. */
  stages: string[];
  /** The part a user can satisfy by setting inputs. */
  env: string[];
  /** Checked in the checkout. A UI shows them, it cannot set them. */
  checks: Array<"file" | "run" | "changes">;
  secret: boolean;
}

export interface PipelineInput {
  name: string;
  /** Without it, nothing runs: an `env` check of a top-level prerequisite. */
  required: boolean;
  /** Its `default` in `$vars`, or the first `${NAME:-default}` a shell command has that reads no other variable. */
  default?: string;
  /** The message of the prerequisite that asks for it. The UI's hint. */
  message?: string;
  /** Prerequisites whose `env` lists it. */
  prerequisites: string[];
  /** Stages skipped without it. Empty when it is required, or when nothing is skipped. */
  unlocks: string[];
  /** Where the file reads it. `run` is a shell command: a stage's or a prerequisite's. */
  usedIn: InputUse[];
  /** `$vars` declares it `secret: true`. */
  secret: boolean;
}

export type InputUse = "prerequisite" | "when" | "env" | "packages" | "task" | "summary" | "run";

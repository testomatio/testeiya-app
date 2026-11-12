/**
 * A pipeline file, key for key. PIPELINES.md documents every field.
 * `PipelineSource` validates YAML into these shapes and nothing else reads YAML.
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
  /** Variables for every stage. Values expand `${NAME}`. */
  env: Record<string, string>;
  /** npm package name to version, installed for the run. Values expand `${NAME}`. */
  packages: Record<string, string>;
  /** Named checks, defined once. */
  prerequisites: Record<string, GateSpec>;
  /** Prerequisites for the whole run. One fails: nothing runs. */
  when: string[];
  stages: StageSpec[];
}

/** A prerequisite passes when every check it has passes. */
export interface GateSpec {
  /** Every variable is set and not empty. */
  env?: string[];
  /** Every path exists, relative to the checkout. */
  file?: string[];
  /** The command exits 0 within 30 seconds. */
  run?: string;
  /** The changed files match. */
  changes?: ChangesSpec;
  /** Why the prerequisite failed, shown when it skips something. */
  message: string;
  /** Its `env` values are secrets: a UI hides them and keeps them out of plain storage. */
  secret?: boolean;
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
  /** An agent stage: the task text. */
  task?: string;
  /** A command stage: a shell command. */
  run?: string;
  /** A named, persistent conversation. */
  session?: string;
  inputs: string[];
  outputs: string[];
  /** Prerequisites this stage needs. One fails: the stage is skipped. */
  when: string[];
  stopOn: StopOn[];
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
  /** Prerequisite names. */
  when: string[];
  inputs: string[];
  outputs: string[];
  loop?: { each_line: string } | { each_file: string };
  stopOn: StopOn[];
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
  /** From `${NAME:-default}`, the first one found. Never one that reads another variable. */
  default?: string;
  /** The message of the prerequisite that asks for it. The UI's hint. */
  message?: string;
  /** Prerequisites whose `env` lists it. */
  prerequisites: string[];
  /** Stages skipped without it. Empty when it is required, or when nothing is skipped. */
  unlocks: string[];
  /** Where the file reads it. `run` is a shell command: a stage's or a prerequisite's. */
  usedIn: InputUse[];
  /** A prerequisite that lists it is `secret`. */
  secret: boolean;
}

export type InputUse = "prerequisite" | "env" | "packages" | "task" | "run" | "outputs" | "file";

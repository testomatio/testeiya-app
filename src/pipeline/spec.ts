import { Dictionary, Each, Flag, Group, List, Named, OptionalList, Shape, Slug, Text, Timeout, Whole, type Field } from "./field.js";

/**
 * A pipeline file, key for key. PIPELINES.md documents every field.
 * `PipelineSource` validates YAML into these shapes and nothing else reads YAML.
 *
 * Every key is declared twice here and nowhere else: in an interface, for its
 * type and its meaning, and in the table at the end of this file, for how it is
 * checked, overridden and expanded. The compiler rejects a key that is in one
 * and not in the other.
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
  /** When the pipeline stops after this stage. `fail` is there unless the stage is optional or has `continueOn: fail`. */
  stopOn: StopOn[];
  /** Its fail, break or timeout neither stops the pipeline nor fails the run. */
  optional: boolean;
  /** "90s", "30m", "1h", or seconds. */
  timeout?: string | number;
  each_line?: string;
  each_file?: string;
}

export const STOP_ON = ["fail", "gate"] as const;

export type StopOn = (typeof STOP_ON)[number];

/** A pipeline as a UI shows it: what runs, what it needs, what a user can set. `Pipeline.describe()` returns it. */
export interface PipelineDescription extends Pick<PipelineSpec, "name" | "description" | "target" | "summary"> {
  stages: StageView[];
  prerequisites: PrerequisiteView[];
  inputs: PipelineInput[];
}

/** A stage's own keys, with `task` or `run` as `kind` and `text`, and the loop as `loop`. */
export interface StageView extends Omit<StageSpec, "task" | "run" | "each_line" | "each_file"> {
  kind: "task" | "run";
  /** The task or the command. */
  text: string;
  loop?: { each_line: string } | { each_file: string };
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

/** `prerequisite`: a prerequisite's `env` lists it. Any other: the key whose text reads it. */
export const INPUT_USES = ["prerequisite", "env", "packages", "task", "run", "outputs", "file"] as const;

export type InputUse = (typeof INPUT_USES)[number];

/** A field for every key of `T`, and for the keys only the file has. */
type Keys<T, FileOnly extends string = never> = Record<keyof T | FileOnly, Field>;

export const CHANGES = new Shape({
  paths: new OptionalList(),
  ignore: new OptionalList(),
  min_files: new Whole(),
} satisfies Keys<ChangesSpec>);

export const GATE = new Shape({
  env: new OptionalList(),
  file: new OptionalList({ expands: "runner" }),
  // The runner expands it, then a shell runs it.
  run: new Text({ expands: "both" }),
  changes: new Group(CHANGES),
  message: new Text(),
  secret: new Flag(),
} satisfies Keys<GateSpec>);

/** `continueOn` is the file's way to say what `stopOn` leaves out. The spec holds `stopOn` only. */
export const STAGE = new Shape({
  id: new Slug(),
  title: new Text(),
  emoji: new Text(),
  task: new Text({ expands: "runner" }),
  run: new Text({ expands: "shell" }),
  session: new Slug(),
  inputs: new List(),
  outputs: new List({ expands: "runner" }),
  when: new List(),
  stopOn: new List({ oneOf: STOP_ON }),
  continueOn: new List({ oneOf: ["fail"] }),
  optional: new Flag(),
  timeout: new Timeout(),
  each_line: new Text(),
  each_file: new Text(),
} satisfies Keys<StageSpec, "continueOn">);

export const PIPELINE = new Shape({
  name: new Text(),
  description: new Text(),
  target: new Text(),
  summary: new Text(),
  env: new Dictionary({ expands: "runner" }),
  packages: new Dictionary({ expands: "runner" }),
  prerequisites: new Named(GATE, "prerequisite"),
  when: new List(),
  stages: new Each(STAGE, "stage", ["task", "run"]),
} satisfies Keys<PipelineSpec>);

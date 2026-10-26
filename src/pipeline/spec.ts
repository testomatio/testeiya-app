/**
 * A pipeline file, key for key. PIPELINES.md documents every field.
 * `PipelineFile` validates YAML into these shapes and nothing else reads YAML.
 */
export interface PipelineSpec {
  name: string;
  description: string;
  /** Extra instructions for the final summary. */
  summary?: string;
  /** Variables for every stage. Values expand `${NAME}`. */
  env: Record<string, string>;
  /** Named checks, defined once. */
  gates: Record<string, GateSpec>;
  /** Gates for the whole run. One fails: nothing runs. */
  when: string[];
  stages: StageSpec[];
}

/** A gate passes when every check it has passes. */
export interface GateSpec {
  /** Every variable is set and not empty. */
  env?: string[];
  /** Every path exists, relative to the checkout. */
  file?: string[];
  /** The command exits 0 within 30 seconds. */
  run?: string;
  /** The changed files match. */
  changes?: ChangesSpec;
  /** Why the gate failed, shown when it skips something. */
  message: string;
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
  /** Gates this stage needs. One fails: the stage is skipped. */
  when: string[];
  stopOn: StopOn[];
  /** "90s", "30m", "1h", or seconds. */
  timeout?: string | number;
  each_line?: string;
  each_file?: string;
}

export type StopOn = "fail" | "gate";

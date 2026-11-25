import type { Marker } from "scripted-yaml/core";

/**
 * A value a pipeline writes with a marker: a stage's `run!sh:`, `run!task:`,
 * `run!decide:` or `run!extract:`, or a prerequisite's `$value!sh:`,
 * `$value!file:`, `$value!changes:` or `$value!extract:`. Loading a file makes
 * one and runs nothing; the runner's `Gate` checks a prerequisite and sets
 * `passed`. A formula that reads a check reads it as true or false:
 * scripted-yaml takes `"1"` and `"0"`.
 */
export abstract class Marked {
  /** The marker as written after the `!`. */
  abstract readonly marker: string;
  /** Set once the runner checked it. Unchecked reads as false. */
  passed?: boolean;

  toString(): string {
    return this.passed ? "1" : "0";
  }
}

/** `run!sh:` a stage's command, or `$value!sh:` a check that passes when the command exits 0. */
export class ShellMarker extends Marked {
  readonly marker = "sh";

  constructor(readonly command: unknown) {
    super();
  }
}

/** `$value!file:` passes when every path exists, relative to the checkout. One path or a list. */
export class FileMarker extends Marked {
  readonly marker = "file";

  constructor(readonly paths: unknown) {
    super();
  }
}

/** `$value!changes:` passes when the changed files match `paths`, `ignore` and `min_files`. */
export class ChangesMarker extends Marked {
  readonly marker = "changes";

  constructor(readonly rule: unknown) {
    super();
  }
}

/**
 * `run!task:` an agent's task, or `run!decide:` a yes or no question. The text is
 * computed: on load it is a scripted-yaml `Text` when it holds `{{ }}`, and each
 * resolve makes the marker again with the text filled in.
 */
export class TaskMarker extends Marked {
  readonly marker: string = "task";

  constructor(readonly text: unknown) {
    super();
  }

  override toString(): string {
    return String(this.text);
  }
}

export class DecideMarker extends TaskMarker {
  override readonly marker = "decide";
}

/**
 * `run!extract:` or a prerequisite's `$value!extract:`: the values to find, as
 * `name: what it is`. A prerequisite's values are set once found; a formula
 * reads them as `prerequisites.git.sha`.
 */
export class ExtractMarker extends Marked {
  readonly marker = "extract";
  /** Every value, once each was found. */
  values?: Record<string, string>;
  /** The values that were not found, once it was checked. */
  empty: string[] = [];
  /**
   * The values the input does not have, in a dry run or a check, which ask no
   * agent: a run would. Until then each reads as its name, `<pr_url>`.
   */
  pending: string[] = [];

  constructor(readonly fields: unknown) {
    super();
  }

  /** The message of a prerequisite that gives none. */
  static notFound(names: string[]): string {
    return `Not found: ${names.join(", ")}.`;
  }

  /** Why it did not pass: the file's message, or the values that were not found when the file gives none. */
  reason(message: string, names: string[]): string {
    if (this.empty.length === 0 || message !== ExtractMarker.notFound(names)) return message;
    return ExtractMarker.notFound(this.empty);
  }
}

/** The marker functions a pipeline is loaded with. Each keeps the value, for `PipelineSource` to check. */
export const PIPELINE_MARKERS: Record<string, Marker> = {
  sh: (value) => new ShellMarker(value),
  file: (value) => new FileMarker(value),
  changes: (value) => new ChangesMarker(value),
  task: (value) => new TaskMarker(value),
  decide: (value) => new DecideMarker(value),
  extract: (value) => new ExtractMarker(value),
};

/** Markers whose text is computed: `{{ }}` in it is checked, and filled in for a run. */
export const COMPUTED_MARKERS = ["task", "decide"];

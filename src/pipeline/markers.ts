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
 * `run!task:` an agent's task. Computed, as `run!decide` and `run!extract` are:
 * on load a text with `{{ }}` is a scripted-yaml `Text`, and each resolve makes
 * the marker again with it filled in.
 */
export class TaskMarker extends Marked {
  readonly marker = "task";

  constructor(readonly text: unknown) {
    super();
  }
}

/** A marker whose value is a map, as the DSL's `markers` shapes it. */
abstract class MapMarker extends Marked {
  constructor(readonly value: unknown) {
    super();
  }

  protected field(name: string): unknown {
    const value = this.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[name];
  }
}

/**
 * `run!decide:` or `$value!decide:`: a yes or no question for a decision model,
 * the `context` it judges it against, a `threshold`. A prerequisite's answer is
 * set once asked: `prerequisites.ui_change` is true for yes.
 */
export class DecideMarker extends MapMarker {
  readonly marker = "decide";

  get question(): unknown {
    return this.field("question");
  }

  get context(): unknown {
    return this.field("context");
  }

  get threshold(): unknown {
    return this.field("threshold");
  }
}

/**
 * `run!extract:` or `$value!extract:`: `what` to find and why, and the `values`,
 * `name: what it is`. The agent finds them with its tools. A prerequisite's values
 * are set once found; a formula reads them as `prerequisites.git.sha`.
 */
export class ExtractMarker extends MapMarker {
  readonly marker = "extract";
  /** Every value, once each was found. */
  values?: Record<string, string>;
  /** The values that were not found, once it was checked. */
  empty: string[] = [];
  /** A dry run or a check asks no agent: the values a run would ask for. Until then each reads as `<name>`. */
  pending: string[] = [];

  get what(): unknown {
    return this.field("what");
  }

  get fields(): unknown {
    return this.field("values");
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
export const COMPUTED_MARKERS = ["task", "decide", "extract"];

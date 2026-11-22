import type { Marker } from "scripted-yaml/core";

/**
 * A value a pipeline writes with a marker: `run!sh:`, or a prerequisite's
 * `$value!sh:`, `$value!file:` or `$value!changes:`. Loading a file makes one
 * and runs nothing; the runner's `Gate` checks it and sets `passed`. A formula
 * that reads a check reads it as true or false: scripted-yaml takes `"1"` and `"0"`.
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

/** The marker functions a pipeline is loaded with. Each keeps the value as written, for `PipelineSource` to check. */
export const PIPELINE_MARKERS: Record<string, Marker> = {
  sh: (value) => new ShellMarker(value),
  file: (value) => new FileMarker(value),
  changes: (value) => new ChangesMarker(value),
};

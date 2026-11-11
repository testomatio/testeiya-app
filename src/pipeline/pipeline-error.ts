import { UsageError } from "../usage-error.js";

/**
 * A pipeline that cannot run, found before a token is spent. `line` and `key`
 * say where, so an editor can point at it.
 */
export class PipelineError extends UsageError {
  /** 1-based, when the problem has a place in the text. */
  readonly line?: number;
  /** Like `stages[2].when` or `prerequisites.staging.env`. */
  readonly key?: string;
  /** What the message is already prefixed with: a file path, or `--stage plan`. */
  readonly source?: string;

  constructor(message: string, where: { line?: number; key?: string; source?: string } = {}) {
    super(message);
    this.name = "PipelineError";
    if (where.line !== undefined) this.line = where.line;
    if (where.key !== undefined) this.key = where.key;
    if (where.source !== undefined) this.source = where.source;
  }

  /** The same error, its message prefixed with where it comes from, unless it has a source already. */
  in(source: string): PipelineError {
    if (this.source !== undefined) return this;
    return new PipelineError(`${source}: ${this.message}`, { line: this.line, key: this.key, source });
  }
}

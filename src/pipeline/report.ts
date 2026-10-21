import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { UsageError } from "../model.js";
import { parseDestinations, preflight } from "../output.js";

/**
 * Where the pipeline's report goes. Only the reporting stage gets these
 * destinations: the summary, or the one stage of a one-stage pipeline.
 */
export class Report {
  private readonly passed: string[] = [];
  /** Markdown paths: the stage writes its own report, copied there after. */
  private readonly copies: string[] = [];

  private constructor(
    outputs: string[],
    private readonly options: ReportOptions
  ) {
    for (const output of outputs) {
      const kind = parseDestinations([output]);
      if (typeof kind !== "string" && kind[0]?.kind === "markdown") this.copies.push(output);
      else this.passed.push(output);
    }
  }

  /** Checked before the first stage, like any task: a run that cannot post spends nothing. */
  static async prepare(options: ReportOptions): Promise<Report> {
    const outputs = options.outputs ?? [];
    const parsed = parseDestinations(outputs);
    if (typeof parsed === "string") throw new UsageError(parsed);
    const unreachable = await preflight(parsed);
    if (unreachable) throw new UsageError(unreachable);
    return new Report(outputs, options);
  }

  /** The `task` options that post the report. */
  args(): string[] {
    const { options } = this;
    const args: string[] = [];
    for (const output of this.passed) args.push("-o", output);
    if (options.thread) args.push("--thread", options.thread);
    if (options.header !== undefined) args.push("--header", options.header);
    if (options.footer !== undefined) args.push("--footer", options.footer);
    if (options.noDefaultFooter) args.push("--no-default-footer");
    return args;
  }

  // The stage already writes its own markdown report, and a task takes only one.
  copy(report: string): void {
    if (!existsSync(report)) return;
    for (const path of this.copies) {
      mkdirSync(dirname(resolve(path)), { recursive: true });
      copyFileSync(report, path);
    }
  }
}

export interface ReportOptions {
  outputs?: string[];
  thread?: string;
  header?: string;
  footer?: string;
  noDefaultFooter?: boolean;
}

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { log } from "./log.js";
import { Stage, type Item, type StageContext } from "./stage.js";
import { SESSIONS_DIR, type StageResult } from "./state.js";
import type { Variables } from "./variables.js";

const RETRY_NOTE =
  "This stage stopped before it finished. Go on from where you stopped. Files you already wrote are in the pipeline folder.";

/**
 * An agent stage: a `testeiya task` run. It writes its report to `<id>.md`
 * and its verdict to `<id>.json`.
 */
export class TaskStage extends Stage {
  protected readonly result = { field: "report" as const, extension: "md" };

  files(): string[] {
    return [`${this.id}.md`, `${this.id}.json`];
  }

  protected async runItem(context: StageContext, item: Item, vars: Variables): Promise<StageResult> {
    const { dir } = context;
    const report = `${this.id}${item.suffix}.md`;
    const envelope = `${this.id}${item.suffix}.json`;
    rmSync(join(dir, report), { force: true });
    rmSync(join(dir, envelope), { force: true });

    const task = this.task(context, vars);
    const args = [context.cli, "task", ...this.options(context, item, [join(dir, report), join(dir, envelope)]), "--", task];
    log.command(`testeiya ${args.slice(1, -1).join(" ")} "${task.split("\n")[0]}…"`);

    const done = await context.launcher.start({ command: process.execPath, args, vars, log: null, timeout: this.timeout });
    const result = this.readEnvelope(join(dir, envelope));
    context.report?.copy(join(dir, report));
    if (done.code === 2) return { ...this.outcome(done, "broken", "bad usage, see the log above"), report };
    if (!result) return { ...this.outcome(done, "broken", "it wrote no result"), report };
    let status: StageResult["status"] = "pass";
    if (result.status === "fail") status = "fail";
    return { ...this.outcome(done, status, result.reason), report };
  }

  private options(context: StageContext, item: Item, outputs: string[]): string[] {
    const { session } = this.spec;
    const args: string[] = [];
    // Only the reporting stage posts. Every other stage keeps out of the comment thread.
    if (!context.report) args.push("--no-thread");
    for (const output of outputs) args.push("-o", output);
    if (context.report) args.push(...context.report.args());
    if (session) args.push("--session-file", join(context.dir, SESSIONS_DIR, `${session}.jsonl`));
    else args.push("--no-session");
    if (context.model) args.push("--model", context.model);
    if (item.resumed && session) args.push("--followup", RETRY_NOTE);
    return args;
  }

  /** The task, then where its files are, so the model never guesses a path. */
  private task(context: StageContext, vars: Variables): string {
    const { dir } = context;
    const lines = [`Pipeline folder: ${dir}`];
    const wanted = this.inputs();
    const present = wanted.filter((input) => existsSync(join(dir, input)));
    const absent = wanted.filter((input) => !present.includes(input));
    if (present.length > 0) lines.push(`Read these first: ${present.join(", ")}`);
    const outputs = this.spec.outputs.map((output) => vars.expand(output));
    if (outputs.length > 0) lines.push(`Write these files: ${outputs.join(", ")}`);
    for (const input of absent) lines.push(`Not available: ${input} (${context.missing(input)})`);
    return `${vars.expand(this.spec.task ?? "").trim()}\n\n${lines.join("\n")}`;
  }

  private readEnvelope(path: string): { status?: string; reason?: string | null } | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }
}

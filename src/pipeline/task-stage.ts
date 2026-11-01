import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { UsageError } from "../model.js";
import type { TaskOutcome, TaskRequest } from "../run.js";
import { KILL_GRACE_MS, type Launched } from "./launcher.js";
import { log } from "./log.js";
import { Stage, type Item, type StageContext } from "./stage.js";
import { StageEnv } from "./stage-env.js";
import { CHANGES_FILE, LAST_DIR, SESSIONS_DIR, type StageResult } from "./state.js";
import type { Variables } from "./variables.js";

const RETRY_NOTE =
  "This stage stopped before it finished. Go on from where you stopped. Files you already wrote are in the stage folder.";

/**
 * An agent stage: one task, run in this process. It writes its report to `<id>.md`
 * and its verdict to `<id>.json`, in its folder.
 */
export class TaskStage extends Stage {
  protected readonly result = { field: "report" as const, extension: "md" };

  files(): string[] {
    return [`${this.id}.md`, `${this.id}.json`];
  }

  protected async runItem(context: StageContext, item: Item, vars: Variables): Promise<StageResult> {
    const { dir } = context;
    const report = `${this.folder}/${this.id}${item.suffix}.md`;
    const envelope = `${this.folder}/${this.id}${item.suffix}.json`;
    rmSync(join(dir, report), { force: true });
    rmSync(join(dir, envelope), { force: true });

    const task = this.task(context, vars);
    if (process.env.TESTEIYA_PIPELINE_SPAWN === "1") return this.spawn(context, item, vars, task, report, envelope);

    const request = this.request(context, item, [join(dir, report), join(dir, envelope)], task);
    let session: string | null = null;
    if (request.sessionFile) session = basename(request.sessionFile);
    log.task(`${this.id}${item.suffix}`, context.model, session, task);

    const controller = new AbortController();
    context.launcher.track(controller);
    let timer: NodeJS.Timeout | undefined;
    if (this.timeout) timer = setTimeout(() => controller.abort("timeout"), this.timeout);
    // A task that ignores the abort is left behind once the grace period runs out.
    let grace: NodeJS.Timeout | undefined;
    const abandoned = new Promise<null>((done) => {
      controller.signal.addEventListener("abort", () => (grace = setTimeout(() => done(null), KILL_GRACE_MS)), { once: true });
    });
    const running: { task?: Promise<TaskOutcome>; left?: boolean } = {};
    context.guard.arm();
    try {
      // Raced inside the env, so the env comes back even for a task left behind.
      const outcome = await new StageEnv(vars.toEnv()).run(() => {
        running.task = context.runTask(request, { signal: controller.signal });
        return Promise.race([running.task, abandoned]);
      });
      if (!outcome) {
        running.left = true;
        log.abandoned(`${this.id}${item.suffix}`);
      }
      context.report?.copy(join(dir, report));
      const done: Launched = { code: outcome?.code ?? 1, timedOut: controller.signal.reason === "timeout", interrupted: context.launcher.interrupted };
      if (!outcome) return { ...this.outcome(done, "broken", "it did not stop"), report };
      let status: StageResult["status"] = "pass";
      if (outcome.envelope.status === "fail") status = "fail";
      return { ...this.outcome(done, status, outcome.envelope.reason), report };
    } catch (err) {
      const done: Launched = { code: 1, timedOut: false, interrupted: context.launcher.interrupted };
      let message = String(err);
      if (err instanceof Error) message = err.message;
      if (err instanceof UsageError) return { ...this.outcome(done, "broken", `bad usage: ${message}`), report };
      return { ...this.outcome(done, "broken", message), report };
    } finally {
      clearTimeout(timer);
      clearTimeout(grace);
      context.launcher.untrack();
      // A task left behind can still crash the process, so the guard stays until it settles.
      const disarm = () => context.guard.disarm();
      if (running.left && running.task) running.task.then(disarm, disarm);
      else disarm();
    }
  }

  private request(context: StageContext, item: Item, outputs: string[], task: string): TaskRequest {
    const { session } = this.spec;
    const request: TaskRequest = { prompt: task, outputs: [...outputs] };
    // Only the reporting stage posts. Every other stage keeps out of the comment thread.
    if (!context.report) {
      request.noThread = true;
      request.noDefaultFooter = true;
    }
    context.report?.fill(request);
    if (session) request.sessionFile = join(context.dir, SESSIONS_DIR, `${session}.jsonl`);
    else request.noSession = true;
    if (context.model) request.model = context.model;
    if (item.resumed && session) request.followUp = RETRY_NOTE;
    return request;
  }

  /** The old path: a `testeiya task` child process. */
  private async spawn(context: StageContext, item: Item, vars: Variables, task: string, report: string, envelope: string): Promise<StageResult> {
    const { dir } = context;
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
    // Their reports land in the summary, which is signed once.
    if (!context.report) args.push("--no-thread", "--no-default-footer");
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
    const dir = this.dir(context);
    const lines = [`Stage folder: ${dir}`];
    const wanted = this.inputs();
    const present = wanted.filter((input) => existsSync(join(dir, input)));
    const absent = wanted.filter((input) => !present.includes(input));
    if (present.length > 0) lines.push(`Read these first: ${present.map((input) => join(dir, input)).join(", ")}`);
    const outputs = this.spec.outputs.map((output) => join(dir, vars.expand(output)));
    if (outputs.length > 0) lines.push(`Write these files: ${outputs.join(", ")}`);
    for (const input of absent) lines.push(`Not available: ${input} (${context.missing(input)})`);
    const last = this.lastRound(context);
    if (last) lines.push(last);
    return `${vars.expand(this.spec.task ?? "").trim()}\n\n${lines.join("\n")}`;
  }

  /** A new round updates the last one's result instead of starting over. */
  protected lastRound(context: StageContext): string | null {
    const last = join(context.dir, LAST_DIR, this.folder);
    if (!existsSync(last)) return null;
    let line = `Last round: ${last}. Update its result: keep what still holds, redo what the changes touch.`;
    const changes = join(context.dir, CHANGES_FILE);
    if (existsSync(changes)) line += ` Changed files: ${changes}`;
    return line;
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

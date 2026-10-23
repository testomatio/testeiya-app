import { cpSync, existsSync, globSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

import type { Launched, Launcher } from "./launcher.js";
import { log } from "./log.js";
import type { Report } from "./report.js";
import type { StageSpec, StopOn } from "./spec.js";
import { PipelineState, type ItemRecord, type StageRecord, type StageResult, type Status } from "./state.js";
import type { Variables } from "./variables.js";

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

/**
 * One step of a pipeline. The base runs what every stage shares: its folder
 * with the inputs linked in, loops over lines or files, the outputs check,
 * timing. A subclass runs one item.
 */
export abstract class Stage {
  /** The field and file a loop's items are joined into. */
  protected abstract readonly result: { field: "report" | "log"; extension: string };

  /** `folder` is the stage's own folder in the pipeline folder, like `2-review`. */
  constructor(
    readonly spec: StageSpec,
    readonly folder = spec.id
  ) {}

  /** "30m", "90s", "1h", or a bare number of seconds, in milliseconds. */
  static duration(value: unknown): number | null {
    if (typeof value === "number" && value > 0) return value * 1000;
    if (typeof value !== "string") return null;
    const unit = value.slice(-1);
    const scale = UNITS[unit];
    let amount = Number(value);
    if (scale) amount = Number(value.slice(0, -1));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount * (scale ?? 1000);
  }

  get id(): string {
    return this.spec.id;
  }

  get timeout(): number | undefined {
    return Stage.duration(this.spec.timeout) ?? undefined;
  }

  /** The files the stage leaves in the pipeline folder on its own. */
  abstract files(): string[];

  /** Files the stage reads: the loop's list, and the folder an `each_file` mask starts with. */
  inputs(): string[] {
    const { each_line, each_file } = this.spec;
    const inputs = [...this.spec.inputs];
    if (each_line) inputs.push(each_line);
    const head = each_file?.split("/")[0];
    if (head && head !== each_file && !head.includes("*")) inputs.push(`${head}/`);
    return [...new Set(inputs)];
  }

  /** The stage's folder, absolute. */
  dir(context: StageContext): string {
    return join(context.dir, this.folder);
  }

  produces(file: string): boolean {
    return this.files().includes(file) || this.spec.outputs.includes(file);
  }

  /** The first gate in `when` that failed. */
  closedGate(results: Map<string, boolean>): string | undefined {
    return this.spec.when.find((name) => !results.get(name));
  }

  stopsOn(reason: StopOn): boolean {
    return this.spec.stopOn.includes(reason);
  }

  skip(record: StageRecord, reason: string): void {
    record.status = "skipped";
    record.reason = reason;
    log.stage(record);
  }

  async run(context: StageContext, record: StageRecord): Promise<void> {
    const resumed = PipelineState.STOPPED.includes(record.status);
    mkdirSync(this.dir(context), { recursive: true });
    this.linkInputs(context);
    const items = this.items(this.dir(context));
    if (items && items.length === 0) {
      this.skip(record, this.emptyLoop());
      return;
    }

    const started = Date.now();
    record.status = "running";
    if (!items) Object.assign(record, await this.runOne(context, { suffix: "", resumed }));
    else await this.runLoop(context, record, items);
    record.seconds = Math.round((Date.now() - started) / 1000);

    const status = record.status as Status;
    if (status === "pass" || status === "fail") {
      const missing = this.spec.outputs.filter((output) => !existsSync(join(this.dir(context), output)));
      if (missing.length > 0) {
        record.status = "broken";
        record.reason = `did not write ${missing.join(", ")}`;
      }
    }
    log.stage(record);
  }

  protected abstract runItem(context: StageContext, item: Item, vars: Variables): Promise<StageResult>;

  protected outcome(done: Launched, status: Status, reason?: string | null): StageResult {
    if (done.interrupted) return { status: "interrupted" };
    if (done.timedOut) return { status: "timeout", reason: "ran past its timeout" };
    const result: StageResult = { status };
    if (status !== "pass" && reason) result.reason = reason;
    return result;
  }

  private runOne(context: StageContext, item: Item): Promise<StageResult> {
    let vars = context.vars.with({ STAGE_DIR: this.dir(context) });
    if (item.item !== undefined) vars = vars.with({ ITEM: item.item, ITEM_NAME: basename(item.item, extname(item.item)) });
    if (item.resumed) vars = vars.with({ PIPELINE_RESUME: "1" });
    log.starting(`${this.id}${item.suffix}`, item.item);
    return this.runItem(context, item, vars);
  }

  // A retry runs only the items that did not finish.
  private async runLoop(context: StageContext, record: StageRecord, items: string[]): Promise<void> {
    const previous = record.items ?? [];
    record.items = [];
    for (const [index, item] of items.entries()) {
      const done = previous.find((entry) => entry.item === item && (entry.status === "pass" || entry.status === "fail"));
      if (done) {
        record.items.push(done);
        continue;
      }
      const resumed = previous.some((entry) => entry.item === item);
      const result = await this.runOne(context, { suffix: `.${index + 1}`, item, resumed });
      record.items.push({ item, ...result });
      if (result.status === "broken" || result.status === "timeout" || result.status === "interrupted") break;
    }
    record.status = PipelineState.verdict(record.items);
    this.joinItems(context.dir, record);
  }

  // A link per input, so the stage reads every file from its own folder and a review sees what it read.
  private linkInputs(context: StageContext): void {
    for (const input of this.inputs()) {
      const folder = context.locate(input, this);
      if (!folder) continue;
      let name = input;
      if (name.endsWith("/")) name = name.slice(0, -1);
      const target = join(this.dir(context), name);
      const from = join(context.dir, folder, name);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(dirname(target), { recursive: true });
      try {
        symlinkSync(relative(dirname(target), from), target);
      } catch {
        cpSync(from, target, { recursive: true });
      }
    }
  }

  private items(dir: string): string[] | null {
    const { each_line, each_file } = this.spec;
    if (each_line) {
      const path = join(dir, each_line);
      if (!existsSync(path)) return [];
      return readFileSync(path, "utf8")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (each_file) return globSync(each_file, { cwd: dir }).sort();
    return null;
  }

  private emptyLoop(): string {
    if (this.spec.each_line) return `${this.spec.each_line} is empty`;
    return `no files match ${this.spec.each_file}`;
  }

  // A loop's items read as one stage to whoever comes next.
  private joinItems(dir: string, record: StageRecord): void {
    const { field, extension } = this.result;
    const parts = (record.items ?? [])
      .filter((item: ItemRecord) => item[field] && existsSync(join(dir, item[field]!)))
      .map((item) => `## ${item.item}\n\n${readFileSync(join(dir, item[field]!), "utf8").trim()}\n`);
    const file = `${this.folder}/${this.id}.${extension}`;
    writeFileSync(join(dir, file), parts.join("\n"));
    record[field] = file;
  }
}

export interface StageContext {
  dir: string;
  vars: Variables;
  launcher: Launcher;
  /** The `testeiya` CLI an agent stage runs. */
  cli: string;
  model?: string;
  /** Set only for the stage whose report the pipeline posts. */
  report: Report | null;
  /** Why an input is not in the folder. */
  missing(input: string): string;
  /** The folder holding an input: the folder of the stage that wrote it, `.` for the top, null when absent. */
  locate(input: string, reader: Stage): string | null;
}

export interface Item {
  /** `.1`, `.2`, … in a loop, empty otherwise. */
  suffix: string;
  item?: string;
  resumed: boolean;
}

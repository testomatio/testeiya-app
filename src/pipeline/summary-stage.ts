import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { pipelineReport } from "../../prompt/pipeline-report.js";
import type { PipelineSpec } from "./spec.js";
import type { Stage, StageContext } from "./stage.js";
import { STATE_FILE, type PipelineState, type StageRecord } from "./state.js";
import { TaskStage } from "./task-stage.js";

const DRAFT_FILE = "draft.md";
/** A stage's own headings start one level under its section. */
const TOP_LEVEL = 4;

/**
 * The final report. Code joins the stages' reports into a draft, word for
 * word, so the agent only trims it and never writes a section of its own.
 */
export class SummaryStage extends TaskStage {
  constructor(
    pipeline: PipelineSpec,
    private readonly stages: Stage[],
    private readonly state: PipelineState,
    dir: string
  ) {
    const lines = [`Write the final report of the "${pipeline.name}" pipeline, round ${state.record.round}.`];
    if (pipeline.summary) lines.push("", pipeline.summary.trim());
    lines.push("", `The verdict is ${state.record.status}.`, `The draft: ${join(dir, "summary", DRAFT_FILE)}`, "", pipelineReport);
    const spec = { id: "summary", title: "Summary", emoji: "🧾", task: lines.join("\n"), session: "summary" };
    super({ ...spec, inputs: [STATE_FILE], outputs: [], when: [], stopOn: [] });
  }

  files(): string[] {
    return [...super.files(), DRAFT_FILE];
  }

  async run(context: StageContext, record: StageRecord): Promise<void> {
    mkdirSync(this.dir(context), { recursive: true });
    writeFileSync(join(this.dir(context), DRAFT_FILE), this.draft(context.dir));
    await super.run(context, record);
  }

  /** The stages' reports already update the last round, so the summary starts from the draft. */
  protected lastRound(): string | null {
    return null;
  }

  /** One `### <emoji> <title>` section per stage, in order. */
  private draft(dir: string): string {
    const sections = this.stages.map((stage) => {
      const body = this.section(stage, this.state.stage(stage.id), dir);
      return `### ${stage.spec.emoji} ${stage.spec.title}\n\n${body}`;
    });
    return `${sections.join("\n\n")}\n`;
  }

  private section(stage: Stage, record: StageRecord | undefined, dir: string): string {
    if (!record || record.status === "not-run") return "Did not run.";
    if (record.status === "skipped") return `Skipped: ${record.reason}`;
    const lines: string[] = [];
    if (record.status === "broken" || record.status === "timeout") {
      lines.push(`Stopped: ${record.reason}. A re-run on the same commit picks up from there.`);
    }
    if (record.status === "fail" && record.reason) lines.push(`Failed: ${record.reason}`);
    if (record.log) lines.push(`\`${stage.spec.run}\` ended ${record.status}. Log: [${record.log}](${record.log})`);
    const report = record.report && join(dir, record.report);
    if (report && existsSync(report)) lines.push(this.demote(readFileSync(report, "utf8").trim()));
    if (lines.length === 0) return `Ended ${record.status}.`;
    return lines.join("\n\n");
  }

  /** Moves every heading down so the report's top one is `####`, outside code blocks. */
  private demote(text: string): string {
    const lines = text.split("\n");
    const levels = this.headings(lines).map((index) => this.level(lines[index]!));
    if (levels.length === 0) return text;
    const shift = TOP_LEVEL - Math.min(...levels);
    if (shift <= 0) return text;
    for (const index of this.headings(lines)) lines[index] = `${"#".repeat(shift)}${lines[index]}`;
    return lines.join("\n");
  }

  private headings(lines: string[]): number[] {
    const found: number[] = [];
    let fenced = false;
    for (const [index, line] of lines.entries()) {
      if (line.startsWith("```")) fenced = !fenced;
      if (!fenced && this.level(line) > 0) found.push(index);
    }
    return found;
  }

  private level(line: string): number {
    let hashes = 0;
    while (line[hashes] === "#") hashes++;
    if (hashes === 0 || hashes > 6 || line[hashes] !== " ") return 0;
    return hashes;
  }
}

import { chalkStderr as c } from "chalk";

import type { Changes } from "../git.js";
import type { Overlay } from "./overlay.js";
import type { StageRecord } from "./state.js";

const MARKS: Record<string, string> = {
  pass: c.green("✓"),
  fail: c.red("✗"),
  broken: c.red("✗"),
  timeout: c.red("✗"),
  skipped: c.yellow("⨯"),
};

/** What a pipeline prints while it runs. All of it goes to stderr. */
export class PipelineLog {
  header(name: string, round: number, changes: Changes, dir: string): void {
    let counted = `${changes.files?.length} files changed since ${changes.from.slice(0, 12)}`;
    if (!changes.files) counted = c.dim(`changes unknown: ${changes.error}`);
    this.note(`  Pipeline ${c.bold(name)} ${c.dim("·")} round ${round} ${c.dim("·")} ${counted}`);
    this.note(c.dim(`  ${dir}`));
  }

  valid(name: string, path: string): void {
    this.note(`  ${c.green("✓")} Pipeline ${c.bold(name)} is valid ${c.dim(`· ${path}`)}`);
  }

  /** One line per override: where it came from and the keys it changes. */
  overlays(overlays: Overlay[]): void {
    for (const overlay of overlays) this.note(`  ${c.magenta("±")} ${overlay.source}${c.dim(`  ${overlay.keys().join(", ")}`)}`);
  }

  checked(failed: number): void {
    if (!failed) return this.note("\n  All gates pass.");
    if (failed === 1) return this.note("\n  1 gate does not pass.");
    this.note(`\n  ${failed} gates do not pass.`);
  }

  skipped(reason: string): void {
    this.note(`  ${c.yellow("⨯")} skipped: ${reason}`);
  }

  interrupted(): void {
    this.note(c.yellow("\n  ⨯ interrupted"));
  }

  /** One line per stage: its mark, time, and status or a note. */
  stage(record: StageRecord, detail?: string): void {
    let time = "";
    if (record.seconds !== undefined) time = `${record.seconds}s`;
    const text = detail ?? [record.status, record.reason].filter(Boolean).join(": ");
    this.note(`  ${MARKS[record.status] ?? c.dim("·")} ${record.id.padEnd(14)} ${time.padEnd(6)} ${text}`);
  }

  starting(name: string, item?: string): void {
    let line = `\n  ▸ ${name}`;
    if (item !== undefined) line += `  ${item}`;
    this.note(c.dim(line));
  }

  command(text: string): void {
    this.note(c.dim(`  $ ${text}`));
  }

  gate(name: string, passed: boolean, message: string, mark = c.yellow("✗")): void {
    if (passed) this.note(`  ${c.green("✓")} gate ${name}`);
    else this.note(`  ${mark} gate ${name}${c.dim(`  ${message}`)}`);
  }

  aiGate(problem: string | null): void {
    this.gate("ai", !problem, problem ?? "", c.red("✗"));
  }

  /** A dry run's line for a stage. */
  plan(id: string, mark: PlanMark, text: string): void {
    const marks: Record<PlanMark, string> = { runs: c.green("▸"), skipped: c.yellow("⨯"), "not-run": c.dim("·") };
    this.note(`  ${marks[mark]} ${id.padEnd(14)} ${c.dim(text)}`);
  }

  note(message: string): void {
    process.stderr.write(`${message}\n`);
  }
}

export const log = new PipelineLog();

type PlanMark = "runs" | "skipped" | "not-run";

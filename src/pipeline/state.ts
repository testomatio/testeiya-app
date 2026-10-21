import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STATE_FILE = "pipeline.json";
export const COPY_FILE = "pipeline.yml";
export const SESSIONS_DIR = ".sessions";
export const CHANGES_FILE = "changes.txt";
const OWN = [STATE_FILE, COPY_FILE, SESSIONS_DIR];

/**
 * `pipeline.json` in the pipeline folder: the round, each stage's result, and
 * the rounds before. The next run reads it to retry or start a new round, the
 * summary reads it to explain the run, and `--json` prints it.
 */
export class PipelineState {
  /** A round in one of these did not finish, so the same commit retries it. */
  static readonly STOPPED: Status[] = ["broken", "timeout", "interrupted", "running"];

  private existing = new Set<string>();
  private createdBefore: string[] = [];

  constructor(
    private readonly dir: string,
    readonly record: PipelineRecord
  ) {}

  static read(dir: string): PipelineRecord | null {
    const path = join(dir, STATE_FILE);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }

  /** The worst status wins. */
  static verdict(records: Array<{ status: Status }>): Status {
    const statuses = records.map((record) => record.status);
    for (const status of ["interrupted", "broken", "timeout", "fail"] as Status[]) {
      if (statuses.includes(status)) return status;
    }
    return "pass";
  }

  stage(id: string): StageRecord | undefined {
    return this.record.stages.find((entry) => entry.id === id);
  }

  /** Remember what is in the folder now, so `created` lists only what the stages add. */
  trackFiles(): void {
    this.createdBefore = this.record.created ?? [];
    this.existing = new Set(readdirSync(this.dir));
  }

  /** Close the round in the history, replacing a run of the same round. */
  finishRound(): void {
    const { record } = this;
    const others = record.rounds.filter((entry) => entry.round !== record.round);
    record.rounds = [...others, { round: record.round, commit: record.commit, status: record.status }];
  }

  save(): void {
    mkdirSync(this.dir, { recursive: true });
    if (this.existing.size > 0) {
      const made = readdirSync(this.dir).filter((name) => !this.existing.has(name) && !OWN.includes(name));
      this.record.created = [...new Set([...this.createdBefore, ...made, CHANGES_FILE])];
    }
    writeFileSync(join(this.dir, STATE_FILE), `${JSON.stringify(this.record, null, 2)}\n`);
  }

  toJSON(): PipelineRecord {
    return this.record;
  }
}

export type Status = "pass" | "fail" | "broken" | "timeout" | "skipped" | "interrupted" | "not-run" | "running";

export interface PipelineRecord {
  name: string;
  round: number;
  commit: string | null;
  since: string | null;
  status: Status;
  reason?: string;
  stages: StageRecord[];
  rounds: Array<{ round: number; commit: string | null; status: Status }>;
  /** What this round wrote into the folder, cleared when the next round starts. */
  created?: string[];
}

export interface StageRecord extends StageResult {
  id: string;
  seconds?: number;
  items?: ItemRecord[];
}

export interface ItemRecord extends StageResult {
  item: string;
}

export interface StageResult {
  status: Status;
  reason?: string;
  report?: string;
  log?: string;
}

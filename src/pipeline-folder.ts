import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const STATE = "pipeline.json";
export const CHANGES = "changes.txt";
const COPY = "pipeline.yml";
const SESSIONS = ".sessions";
const OWN = [STATE, COPY, SESSIONS];

/**
 * The pipeline folder is the whole state of a run: `pipeline.json`, a copy of
 * the pipeline file, the sessions, and every file the stages wrote.
 */
export class PipelineFolder {
  readonly dir: string;
  private existing = new Set<string>();

  constructor(dir: string | undefined, name: string, dryRun?: boolean) {
    if (dir) this.dir = resolve(dir);
    else if (dryRun) this.dir = join(tmpdir(), `testeiya-${name}`);
    else this.dir = mkdtempSync(join(tmpdir(), `testeiya-${name}-`));
  }

  path(name: string): string {
    return join(this.dir, name);
  }

  has(name: string): boolean {
    return existsSync(this.path(name));
  }

  session(name: string): string {
    return join(this.dir, SESSIONS, `${name}.jsonl`);
  }

  readState(): PipelineState | null {
    return readJson(this.path(STATE));
  }

  saveState(state: PipelineState): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path(STATE), `${JSON.stringify(state, null, 2)}\n`);
  }

  /** The pipeline file as the round started with it. */
  readCopy(): string | null {
    if (!this.has(COPY)) return null;
    return readFileSync(this.path(COPY), "utf8");
  }

  /** A new round clears what the last one wrote and keeps the sessions. */
  startRound(created: string[], pipelineText: string): void {
    mkdirSync(this.dir, { recursive: true });
    for (const name of created) rmSync(this.path(name), { recursive: true, force: true });
    writeFileSync(this.path(COPY), pipelineText);
  }

  writeChanges(files: string[]): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path(CHANGES), `${files.join("\n")}\n`);
  }

  /** Remember what is here, so `created` can tell what the stages add. */
  snapshot(): void {
    mkdirSync(this.dir, { recursive: true });
    this.existing = new Set(readdirSync(this.dir));
  }

  /** Everything this round wrote, for the next round to clear. */
  created(before: string[]): string[] {
    const made = readdirSync(this.dir).filter((name) => !this.existing.has(name) && !OWN.includes(name));
    return [...new Set([...before, ...made, CHANGES])];
  }
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export type Status = "pass" | "fail" | "broken" | "timeout" | "skipped" | "interrupted" | "not-run" | "running";

export interface PipelineState {
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
  items?: Array<StageResult & { item: string }>;
}

export interface StageResult {
  status: Status;
  reason?: string;
  report?: string;
  log?: string;
}

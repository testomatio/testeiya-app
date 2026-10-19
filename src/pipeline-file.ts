import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";

import { PACKAGE_ROOT } from "./env.js";
import { UsageError } from "./model.js";

export const BUNDLED_PIPELINES_DIR = join(PACKAGE_ROOT, "pipelines");

/** `pipeline.json` and the summary's own files live beside the stages' files. */
export const RESERVED_IDS = ["pipeline", "summary"];

/** A path when it looks like one, otherwise a bundled pipeline's name. */
export function resolvePipelinePath(name: string): string {
  if (isPath(name)) {
    if (!existsSync(name)) throw new UsageError(`no pipeline file ${name}`);
    return name;
  }
  const bundled = join(BUNDLED_PIPELINES_DIR, `${name}.yml`);
  if (existsSync(bundled)) return bundled;
  throw new UsageError(`no pipeline "${name}" — run "testeiya pipeline" to list them, or pass a .yml path`);
}

export function listBundled(): Array<{ name: string; description: string }> {
  if (!existsSync(BUNDLED_PIPELINES_DIR)) return [];
  const files = readdirSync(BUNDLED_PIPELINES_DIR).filter((file) => file.endsWith(".yml")).sort();
  return files.map((file) => {
    const pipeline = parsePipeline(readFileSync(join(BUNDLED_PIPELINES_DIR, file), "utf8"), file);
    return { name: basename(file, ".yml"), description: pipeline.description };
  });
}

/** Parse and validate. Every mistake is bad usage, found before a token is spent. */
export function parsePipeline(text: string, source: string): Pipeline {
  return new PipelineParser(source).parse(text);
}

/** The files a stage leaves in the pipeline folder on its own. */
export function stageFiles(stage: Stage): string[] {
  if (stage.task !== undefined) return [`${stage.id}.md`, `${stage.id}.json`];
  return [`${stage.id}.log`];
}

/** "30m", "90s", "1h", or a bare number of seconds. */
export function parseDuration(value: unknown): number | null {
  if (typeof value === "number" && value > 0) return value * 1000;
  if (typeof value !== "string") return null;
  const unit = value.slice(-1);
  const scale = UNITS[unit];
  const amount = Number(scale ? value.slice(0, -1) : value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount * (scale ?? 1000);
}

/** Reads one pipeline file. Every message names the file. */
class PipelineParser {
  constructor(private readonly source: string) {}

  parse(text: string): Pipeline {
    let raw: unknown;
    try {
      raw = parse(text);
    } catch (err) {
      return this.fail(err instanceof Error ? err.message : String(err));
    }
    if (!isRecord(raw)) return this.fail("a pipeline is a YAML mapping");
    this.unknownKeys(raw, TOP_KEYS, "pipeline");

    const gates: Record<string, Gate> = {};
    const rawGates = raw.gates ?? {};
    if (!isRecord(rawGates)) return this.fail("gates must be a mapping of name to checks");
    for (const [name, value] of Object.entries(rawGates)) gates[name] = this.gate(name, value);

    const rawStages = raw.stages;
    if (!Array.isArray(rawStages) || rawStages.length === 0) return this.fail("stages must be a non-empty list");
    const stages = rawStages.map((value, index) => this.stage(value, index));

    const pipeline: Pipeline = {
      name: this.string(raw.name, "name") ?? basename(this.source).replace(/\.ya?ml$/, ""),
      description: this.string(raw.description, "description") ?? "",
      summary: this.string(raw.summary, "summary"),
      env: this.map(raw.env, "env"),
      gates,
      when: this.list(raw.when, "when"),
      stages,
    };
    this.checkReferences(pipeline);
    return pipeline;
  }

  private gate(name: string, value: unknown): Gate {
    if (!isRecord(value)) return this.fail(`gate "${name}" must be a mapping`);
    this.unknownKeys(value, GATE_KEYS, `gate "${name}"`);
    const message = this.string(value.message, `gate "${name}" message`);
    if (!message) return this.fail(`gate "${name}" needs a message`);
    const gate: Gate = { message };
    if (value.env !== undefined) gate.env = this.list(value.env, `gate "${name}" env`);
    if (value.file !== undefined) gate.file = this.list(value.file, `gate "${name}" file`);
    if (value.run !== undefined) gate.run = this.string(value.run, `gate "${name}" run`);
    if (value.changes !== undefined) gate.changes = this.changes(name, value.changes);
    if (!gate.env && !gate.file && !gate.run && !gate.changes) {
      return this.fail(`gate "${name}" needs a check: env, file, run or changes`);
    }
    return gate;
  }

  private changes(name: string, value: unknown): ChangesRule {
    if (!isRecord(value)) return this.fail(`gate "${name}" changes must be a mapping`);
    this.unknownKeys(value, CHANGES_KEYS, `gate "${name}" changes`);
    const rule: ChangesRule = {};
    if (value.paths !== undefined) rule.paths = this.list(value.paths, `gate "${name}" paths`);
    if (value.ignore !== undefined) rule.ignore = this.list(value.ignore, `gate "${name}" ignore`);
    if (value.min_files !== undefined) {
      if (!Number.isInteger(value.min_files) || (value.min_files as number) < 1) {
        return this.fail(`gate "${name}" min_files must be a whole number above 0`);
      }
      rule.minFiles = value.min_files as number;
    }
    return rule;
  }

  private stage(value: unknown, index: number): Stage {
    if (!isRecord(value)) return this.fail(`stage ${index + 1} must be a mapping`);
    const id = value.id;
    if (typeof id !== "string" || !isSlug(id)) {
      return this.fail(`stage ${index + 1} needs an id of lowercase words joined by dashes`);
    }
    const where = `stage "${id}"`;
    this.unknownKeys(value, STAGE_KEYS, where);
    if (RESERVED_IDS.includes(id)) this.fail(`${where}: "${id}" is reserved`);
    if ((value.task === undefined) === (value.run === undefined)) this.fail(`${where} needs exactly one of task or run`);
    if (value.each_line !== undefined && value.each_file !== undefined) {
      this.fail(`${where} can loop over each_line or each_file, not both`);
    }

    const stage: Stage = {
      id,
      inputs: this.list(value.inputs, `${where} inputs`),
      outputs: this.list(value.outputs, `${where} outputs`),
      when: this.list(value.when, `${where} when`),
      stopOn: this.list(value.stopOn, `${where} stopOn`) as StopOn[],
    };
    for (const reason of stage.stopOn) {
      if (reason !== "fail" && reason !== "gate") this.fail(`${where} stopOn takes fail or gate, got "${reason}"`);
    }
    if (value.task !== undefined) stage.task = this.string(value.task, `${where} task`);
    if (value.run !== undefined) stage.run = this.string(value.run, `${where} run`);
    if (value.session !== undefined) {
      const session = this.string(value.session, `${where} session`);
      if (!session || !isSlug(session)) this.fail(`${where} session must be lowercase words joined by dashes`);
      stage.session = session;
    }
    if (value.each_line !== undefined) stage.eachLine = this.string(value.each_line, `${where} each_line`);
    if (value.each_file !== undefined) stage.eachFile = this.string(value.each_file, `${where} each_file`);
    if (value.timeout !== undefined) {
      const timeout = parseDuration(value.timeout);
      if (!timeout) this.fail(`${where} timeout must look like 90s, 30m or 1h`);
      stage.timeout = timeout ?? undefined;
    }
    return stage;
  }

  private checkReferences(pipeline: Pipeline): void {
    const ids = new Set<string>();
    const taken = new Map<string, string>();
    for (const stage of pipeline.stages) {
      if (ids.has(stage.id)) this.fail(`two stages are called "${stage.id}"`);
      ids.add(stage.id);
      for (const file of stageFiles(stage)) taken.set(file, stage.id);
    }
    for (const name of pipeline.when) {
      if (!pipeline.gates[name]) this.fail(`when names gate "${name}", which gates does not define`);
    }
    for (const stage of pipeline.stages) {
      for (const name of stage.when) {
        if (!pipeline.gates[name]) this.fail(`stage "${stage.id}" when names gate "${name}", which gates does not define`);
      }
      for (const output of stage.outputs) {
        const owner = taken.get(output);
        if (owner) this.fail(`stage "${stage.id}" output ${output} is a file stage "${owner}" writes itself`);
      }
    }
  }

  private unknownKeys(value: Record<string, unknown>, known: string[], where: string): void {
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) this.fail(`${where} has an unknown key "${key}"`);
    }
  }

  private string(value: unknown, what: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return this.fail(`${what} must be text`);
    return value;
  }

  // A single value is a list of one, so `stopOn: fail` and `when: staging` read naturally.
  private list(value: unknown, what: string): string[] {
    if (value === undefined || value === null) return [];
    if (typeof value === "string") return [value];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      return this.fail(`${what} must be a list of text`);
    }
    return value as string[];
  }

  private map(value: unknown, what: string): Record<string, string> {
    if (value === undefined || value === null) return {};
    if (!isRecord(value)) return this.fail(`${what} must be a mapping`);
    const map: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
        this.fail(`${what}.${key} must be text`);
      }
      map[key] = String(item);
    }
    return map;
  }

  private fail(message: string): never {
    throw new UsageError(`${this.source}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlug(value: string): boolean {
  if (!value || value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
  return [...value].every((char) => (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-");
}

function isPath(name: string): boolean {
  return name.endsWith(".yml") || name.endsWith(".yaml") || name.includes("/") || name.includes("\\");
}

const TOP_KEYS = ["name", "description", "summary", "env", "gates", "when", "stages"];
const GATE_KEYS = ["env", "file", "run", "changes", "message"];
const CHANGES_KEYS = ["paths", "ignore", "min_files"];
const STAGE_KEYS = [
  "id",
  "task",
  "run",
  "session",
  "inputs",
  "outputs",
  "when",
  "stopOn",
  "timeout",
  "each_line",
  "each_file",
];
const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

export type StopOn = "fail" | "gate";

export interface Pipeline {
  name: string;
  description: string;
  summary?: string;
  env: Record<string, string>;
  gates: Record<string, Gate>;
  when: string[];
  stages: Stage[];
}

export interface Gate {
  env?: string[];
  file?: string[];
  run?: string;
  changes?: ChangesRule;
  message: string;
}

export interface ChangesRule {
  paths?: string[];
  ignore?: string[];
  minFiles?: number;
}

export interface Stage {
  id: string;
  task?: string;
  run?: string;
  session?: string;
  inputs: string[];
  outputs: string[];
  when: string[];
  stopOn: StopOn[];
  timeout?: number;
  eachLine?: string;
  eachFile?: string;
}

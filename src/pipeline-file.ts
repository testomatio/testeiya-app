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
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new UsageError(`${source}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const fail = (message: string): never => {
    throw new UsageError(`${source}: ${message}`);
  };
  if (!isRecord(raw)) return fail("a pipeline is a YAML mapping");
  unknownKeys(raw, TOP_KEYS, "pipeline", fail);

  const gates: Record<string, Gate> = {};
  const rawGates = raw.gates ?? {};
  if (!isRecord(rawGates)) return fail("gates must be a mapping of name to checks");
  for (const [name, value] of Object.entries(rawGates)) gates[name] = parseGate(name, value, fail);

  const rawStages = raw.stages;
  if (!Array.isArray(rawStages) || rawStages.length === 0) return fail("stages must be a non-empty list");
  const stages = rawStages.map((value, index) => parseStage(value, index, fail));

  const pipeline: Pipeline = {
    name: optionalString(raw.name, "name", fail) ?? basename(source).replace(/\.ya?ml$/, ""),
    description: optionalString(raw.description, "description", fail) ?? "",
    summary: optionalString(raw.summary, "summary", fail),
    env: stringMap(raw.env, "env", fail),
    gates,
    when: stringList(raw.when, "when", fail),
    stages,
  };
  checkReferences(pipeline, fail);
  return pipeline;
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

function parseGate(name: string, value: unknown, fail: Fail): Gate {
  if (!isRecord(value)) return fail(`gate "${name}" must be a mapping`);
  unknownKeys(value, GATE_KEYS, `gate "${name}"`, fail);
  const message = optionalString(value.message, `gate "${name}" message`, fail);
  if (!message) return fail(`gate "${name}" needs a message`);
  const gate: Gate = { message };
  if (value.env !== undefined) gate.env = stringList(value.env, `gate "${name}" env`, fail);
  if (value.file !== undefined) gate.file = stringList(value.file, `gate "${name}" file`, fail);
  if (value.run !== undefined) gate.run = optionalString(value.run, `gate "${name}" run`, fail);
  if (value.changes !== undefined) gate.changes = parseChanges(name, value.changes, fail);
  if (!gate.env && !gate.file && !gate.run && !gate.changes) {
    return fail(`gate "${name}" needs a check: env, file, run or changes`);
  }
  return gate;
}

function parseChanges(name: string, value: unknown, fail: Fail): ChangesRule {
  if (!isRecord(value)) return fail(`gate "${name}" changes must be a mapping`);
  unknownKeys(value, CHANGES_KEYS, `gate "${name}" changes`, fail);
  const rule: ChangesRule = {};
  if (value.paths !== undefined) rule.paths = stringList(value.paths, `gate "${name}" paths`, fail);
  if (value.ignore !== undefined) rule.ignore = stringList(value.ignore, `gate "${name}" ignore`, fail);
  if (value.min_files !== undefined) {
    if (!Number.isInteger(value.min_files) || (value.min_files as number) < 1) {
      return fail(`gate "${name}" min_files must be a whole number above 0`);
    }
    rule.minFiles = value.min_files as number;
  }
  return rule;
}

function parseStage(value: unknown, index: number, fail: Fail): Stage {
  if (!isRecord(value)) return fail(`stage ${index + 1} must be a mapping`);
  const id = value.id;
  if (typeof id !== "string" || !isSlug(id)) {
    return fail(`stage ${index + 1} needs an id of lowercase words joined by dashes`);
  }
  const where = `stage "${id}"`;
  unknownKeys(value, STAGE_KEYS, where, fail);
  if (RESERVED_IDS.includes(id)) fail(`${where}: "${id}" is reserved`);
  if ((value.task === undefined) === (value.run === undefined)) fail(`${where} needs exactly one of task or run`);
  if (value.each_line !== undefined && value.each_file !== undefined) {
    fail(`${where} can loop over each_line or each_file, not both`);
  }

  const stage: Stage = {
    id,
    inputs: stringList(value.inputs, `${where} inputs`, fail),
    outputs: stringList(value.outputs, `${where} outputs`, fail),
    gates: stringList(value.gates, `${where} gates`, fail),
    stopOn: stringList(value.stopOn, `${where} stopOn`, fail) as StopOn[],
  };
  for (const reason of stage.stopOn) {
    if (reason !== "fail" && reason !== "gate") fail(`${where} stopOn takes fail or gate, got "${reason}"`);
  }
  if (value.task !== undefined) stage.task = optionalString(value.task, `${where} task`, fail);
  if (value.run !== undefined) stage.run = optionalString(value.run, `${where} run`, fail);
  if (value.session !== undefined) {
    const session = optionalString(value.session, `${where} session`, fail);
    if (!session || !isSlug(session)) fail(`${where} session must be lowercase words joined by dashes`);
    stage.session = session;
  }
  if (value.each_line !== undefined) stage.eachLine = optionalString(value.each_line, `${where} each_line`, fail);
  if (value.each_file !== undefined) stage.eachFile = optionalString(value.each_file, `${where} each_file`, fail);
  if (value.timeout !== undefined) {
    const timeout = parseDuration(value.timeout);
    if (!timeout) fail(`${where} timeout must look like 90s, 30m or 1h`);
    stage.timeout = timeout ?? undefined;
  }
  return stage;
}

function checkReferences(pipeline: Pipeline, fail: Fail): void {
  const ids = new Set<string>();
  const taken = new Map<string, string>();
  for (const stage of pipeline.stages) {
    if (ids.has(stage.id)) fail(`two stages are called "${stage.id}"`);
    ids.add(stage.id);
    for (const file of stageFiles(stage)) taken.set(file, stage.id);
  }
  for (const name of pipeline.when) {
    if (!pipeline.gates[name]) fail(`when names gate "${name}", which gates does not define`);
  }
  for (const stage of pipeline.stages) {
    for (const name of stage.gates) {
      if (!pipeline.gates[name]) fail(`stage "${stage.id}" names gate "${name}", which gates does not define`);
    }
    for (const output of stage.outputs) {
      const owner = taken.get(output);
      if (owner) fail(`stage "${stage.id}" output ${output} is a file stage "${owner}" writes itself`);
    }
  }
}

function unknownKeys(value: Record<string, unknown>, known: string[], where: string, fail: Fail): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) fail(`${where} has an unknown key "${key}"`);
  }
}

function optionalString(value: unknown, what: string, fail: Fail): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return fail(`${what} must be text`);
  return value;
}

// A single value is a list of one, so `stopOn: fail` and `gates: staging` read naturally.
function stringList(value: unknown, what: string, fail: Fail): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return fail(`${what} must be a list of text`);
  }
  return value as string[];
}

function stringMap(value: unknown, what: string, fail: Fail): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return fail(`${what} must be a mapping`);
  const map: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      fail(`${what}.${key} must be text`);
    }
    map[key] = String(item);
  }
  return map;
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
  "gates",
  "stopOn",
  "timeout",
  "each_line",
  "each_file",
];
const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

type Fail = (message: string) => never;

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
  gates: string[];
  stopOn: StopOn[];
  timeout?: number;
  eachLine?: string;
  eachFile?: string;
}

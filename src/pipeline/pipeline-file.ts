import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";

import { PACKAGE_ROOT } from "../env.js";
import { UsageError } from "../model.js";
import { Overlay } from "./overlay.js";
import type { ChangesSpec, GateSpec, PipelineSpec, StageSpec, StopOn } from "./spec.js";
import { Stage } from "./stage.js";
import { Variables } from "./variables.js";

const BUNDLED_DIR = join(PACKAGE_ROOT, "pipelines");
/** `pipeline.json` and the summary's own files live beside the stages' files. */
const RESERVED_IDS = ["pipeline", "summary"];
const TOP_KEYS = ["name", "description", "summary", "env", "gates", "when", "stages"];
const GATE_KEYS = ["env", "file", "run", "changes", "message"];
const CHANGES_KEYS = ["paths", "ignore", "min_files"];
const STAGE_KEYS = ["id", "title", "emoji", "task", "run", "session", "inputs", "outputs", "when", "stopOn", "timeout", "each_line", "each_file"];

/**
 * A pipeline file: found by path or bundled name, then parsed and validated
 * into a `PipelineSpec`. Every mistake is bad usage, found before a token is
 * spent, and every message names the file.
 */
export class PipelineFile {
  constructor(readonly path: string) {}

  /** A path when it looks like one, otherwise a bundled pipeline's name. */
  static find(name: string): PipelineFile {
    if (PipelineFile.isPath(name)) {
      if (!existsSync(name)) throw new UsageError(`no pipeline file ${name}`);
      return new PipelineFile(name);
    }
    const bundled = join(BUNDLED_DIR, `${name}.yml`);
    if (existsSync(bundled)) return new PipelineFile(bundled);
    throw new UsageError(`no pipeline "${name}" — run "testeiya pipeline" to list them, or pass a .yml path`);
  }

  static bundled(): Array<{ name: string; description: string }> {
    if (!existsSync(BUNDLED_DIR)) return [];
    const files = readdirSync(BUNDLED_DIR).filter((file) => file.endsWith(".yml")).sort();
    return files.map((file) => {
      const spec = new PipelineFile(join(BUNDLED_DIR, file)).read();
      return { name: basename(file, ".yml"), description: spec.description };
    });
  }

  text(): string {
    return readFileSync(this.path, "utf8");
  }

  read(overlays: Overlay[] = []): PipelineSpec {
    return this.resolve(overlays).spec;
  }

  /** The spec with `extends` and every overlay applied, and the same as YAML, which needs neither. */
  resolve(overlays: Overlay[] = []): { spec: PipelineSpec; text: string } {
    let raw = this.raw(this.text(), [resolve(this.path)]);
    for (const overlay of overlays) raw = overlay.apply(raw);
    return { spec: this.validate(raw), text: stringify(raw) };
  }

  /** Parse text as this file, so a copy keeps the file's name. */
  parse(text: string): PipelineSpec {
    return this.validate(this.raw(text, [resolve(this.path)]));
  }

  // The file's own keys are an overlay on the pipeline it extends.
  private raw(text: string, chain: string[]): Record<string, unknown> {
    let raw: unknown;
    try {
      raw = parse(text);
    } catch (err) {
      return this.fail(String((err as Error).message ?? err));
    }
    if (!PipelineFile.isRecord(raw)) return this.fail("a pipeline is a YAML mapping");
    if (raw.extends === undefined) return raw;
    const { extends: name, ...own } = raw;
    if (typeof name !== "string" || !name) return this.fail("extends names a bundled pipeline or a .yml path");
    let path = name;
    if (PipelineFile.isPath(name)) path = resolve(dirname(this.path), name);
    const base = PipelineFile.find(path);
    const at = resolve(base.path);
    if (chain.includes(at)) return this.fail(`extends ${name} loops back to itself`);
    const parent = base.raw(base.text(), [...chain, at]);
    return new Overlay(this.path, own).apply(parent);
  }

  private validate(raw: Record<string, unknown>): PipelineSpec {
    this.unknownKeys(raw, TOP_KEYS, "pipeline");

    const gates: Record<string, GateSpec> = {};
    const rawGates = raw.gates ?? {};
    if (!PipelineFile.isRecord(rawGates)) return this.fail("gates must be a mapping of name to checks");
    for (const [name, value] of Object.entries(rawGates)) gates[name] = this.gate(name, value);

    const rawStages = raw.stages;
    if (!Array.isArray(rawStages) || rawStages.length === 0) return this.fail("stages must be a non-empty list");
    const stages = rawStages.map((value, index) => this.stage(value, index));

    const spec: PipelineSpec = {
      name: this.string(raw.name, "name") ?? basename(this.path).replace(/\.ya?ml$/, ""),
      description: this.string(raw.description, "description") ?? "",
      summary: this.string(raw.summary, "summary"),
      env: this.map(raw.env, "env"),
      gates,
      when: this.list(raw.when, "when"),
      stages,
    };
    this.checkReferences(spec);
    this.checkFilters(spec);
    return spec;
  }

  private gate(name: string, value: unknown): GateSpec {
    if (!PipelineFile.isRecord(value)) return this.fail(`gate "${name}" must be a mapping`);
    this.unknownKeys(value, GATE_KEYS, `gate "${name}"`);
    const message = this.string(value.message, `gate "${name}" message`);
    if (!message) return this.fail(`gate "${name}" needs a message`);
    const gate: GateSpec = { message };
    if (value.env !== undefined) gate.env = this.list(value.env, `gate "${name}" env`);
    if (value.file !== undefined) gate.file = this.list(value.file, `gate "${name}" file`);
    if (value.run !== undefined) gate.run = this.string(value.run, `gate "${name}" run`);
    if (value.changes !== undefined) gate.changes = this.changes(name, value.changes);
    if (!gate.env && !gate.file && !gate.run && !gate.changes) {
      return this.fail(`gate "${name}" needs a check: env, file, run or changes`);
    }
    return gate;
  }

  private changes(name: string, value: unknown): ChangesSpec {
    if (!PipelineFile.isRecord(value)) return this.fail(`gate "${name}" changes must be a mapping`);
    this.unknownKeys(value, CHANGES_KEYS, `gate "${name}" changes`);
    const rule: ChangesSpec = {};
    if (value.paths !== undefined) rule.paths = this.list(value.paths, `gate "${name}" paths`);
    if (value.ignore !== undefined) rule.ignore = this.list(value.ignore, `gate "${name}" ignore`);
    if (value.min_files !== undefined) {
      if (!Number.isInteger(value.min_files) || (value.min_files as number) < 1) {
        return this.fail(`gate "${name}" min_files must be a whole number above 0`);
      }
      rule.min_files = value.min_files as number;
    }
    return rule;
  }

  private stage(value: unknown, index: number): StageSpec {
    if (!PipelineFile.isRecord(value)) return this.fail(`stage ${index + 1} must be a mapping`);
    const id = value.id;
    if (typeof id !== "string" || !PipelineFile.isSlug(id)) {
      return this.fail(`stage ${index + 1} needs an id of lowercase words joined by dashes`);
    }
    const where = `stage "${id}"`;
    this.unknownKeys(value, STAGE_KEYS, where);
    if (RESERVED_IDS.includes(id)) this.fail(`${where}: "${id}" is reserved`);
    if ((value.task === undefined) === (value.run === undefined)) this.fail(`${where} needs exactly one of task or run`);
    if (value.each_line !== undefined && value.each_file !== undefined) {
      this.fail(`${where} can loop over each_line or each_file, not both`);
    }

    const title = this.string(value.title, `${where} title`);
    if (!title) this.fail(`${where} needs a title`);
    const emoji = this.string(value.emoji, `${where} emoji`);
    if (!emoji) this.fail(`${where} needs an emoji`);

    const stage: StageSpec = {
      id,
      title,
      emoji,
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
      if (!session || !PipelineFile.isSlug(session)) this.fail(`${where} session must be lowercase words joined by dashes`);
      stage.session = session;
    }
    if (value.each_line !== undefined) stage.each_line = this.string(value.each_line, `${where} each_line`);
    if (value.each_file !== undefined) stage.each_file = this.string(value.each_file, `${where} each_file`);
    if (value.timeout !== undefined) {
      if (!Stage.duration(value.timeout)) this.fail(`${where} timeout must look like 90s, 30m or 1h`);
      stage.timeout = value.timeout as string | number;
    }
    return stage;
  }

  private checkReferences(spec: PipelineSpec): void {
    const ids = new Set<string>();
    for (const stage of spec.stages) {
      if (ids.has(stage.id)) this.fail(`two stages are called "${stage.id}"`);
      ids.add(stage.id);
    }
    for (const name of spec.when) {
      if (!spec.gates[name]) this.fail(`when names gate "${name}", which gates does not define`);
    }
    for (const stage of spec.stages) {
      for (const name of stage.when) {
        if (!spec.gates[name]) this.fail(`stage "${stage.id}" when names gate "${name}", which gates does not define`);
      }
    }
  }

  // Filters run where the runner expands. A shell would fail on them.
  private checkFilters(spec: PipelineSpec): void {
    const texts: Array<[string, string]> = Object.entries(spec.env).map(([key, value]) => [`env.${key}`, value]);
    for (const [name, gate] of Object.entries(spec.gates)) {
      for (const file of gate.file ?? []) texts.push([`gate "${name}" file`, file]);
      if (gate.run) texts.push([`gate "${name}" run`, gate.run]);
    }
    for (const stage of spec.stages) {
      if (stage.task) texts.push([`stage "${stage.id}" task`, stage.task]);
      for (const output of stage.outputs) texts.push([`stage "${stage.id}" outputs`, output]);
      if (stage.run && Variables.filtered(stage.run)) {
        this.fail(`stage "${stage.id}" run: a shell command cannot use filters. Set a variable in env and use that`);
      }
    }
    for (const [where, text] of texts) {
      const problem = Variables.problem(text);
      if (problem) this.fail(`${where}: ${problem}`);
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
    if (!PipelineFile.isRecord(value)) return this.fail(`${what} must be a mapping`);
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
    throw new UsageError(`${this.path}: ${message}`);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static isSlug(value: string): boolean {
    if (!value || value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
    return [...value].every((char) => (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-");
  }

  private static isPath(name: string): boolean {
    return name.endsWith(".yml") || name.endsWith(".yaml") || name.includes("/") || name.includes("\\");
  }
}

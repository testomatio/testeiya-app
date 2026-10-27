import { parse } from "yaml";

import { UsageError } from "../model.js";

type Kind = "text" | "list" | "value" | "map" | Schema;
type Schema = { [key: string]: Kind };
type Raw = Record<string, unknown>;
type Op = "append" | "prepend" | "remove";

const OPS: Op[] = ["append", "prepend", "remove"];
const CHANGES: Schema = { paths: "list", ignore: "list", min_files: "value" };
const GATE: Schema = { env: "list", file: "list", run: "text", message: "text", changes: CHANGES };
const STAGE: Schema = {
  id: "value",
  title: "text",
  emoji: "value",
  task: "text",
  run: "text",
  session: "value",
  inputs: "list",
  outputs: "list",
  when: "list",
  stopOn: "list",
  timeout: "value",
  each_line: "text",
  each_file: "text",
};
const TOP: Schema = { name: "text", description: "text", summary: "text", env: "map", when: "list" };

/**
 * Changes laid over a raw pipeline before it is validated. A plain key
 * replaces, `append_` and `prepend_` add, `remove_` drops. Stages match by id,
 * gates by name. PIPELINES.md documents every rule.
 */
export class Overlay {
  constructor(
    readonly source: string,
    readonly raw: Raw,
  ) {}

  /** `--pipeline YAML`: keys of the pipeline itself. */
  static pipeline(text: string): Overlay {
    return new Overlay("--pipeline", Overlay.read(text, "--pipeline"));
  }

  /** `--stage ID:YAML`: keys of one stage. */
  static stage(value: string): Overlay {
    const colon = value.indexOf(":");
    const id = value.slice(0, colon);
    const source = `--stage ${id}`;
    if (colon <= 0 || !value.slice(colon + 1).trim()) throw new UsageError(`--stage takes ID:YAML, got "${value}"`);
    return new Overlay(source, { stages: [{ ...Overlay.read(value.slice(colon + 1), source), id }] });
  }

  /** The keys this overlay changes, for logs: `requirements.append_task`. */
  keys(): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(this.raw)) {
      if (key !== "stages" || !Array.isArray(value)) {
        keys.push(key);
        continue;
      }
      for (const stage of value as Raw[]) {
        const fields = Object.keys(stage).filter((name) => name !== "id");
        if (this.source === `--stage ${stage.id}`) keys.push(...fields);
        else keys.push(...fields.map((field) => `${stage.id}.${field}`));
      }
    }
    return keys;
  }

  apply(base: Raw): Raw {
    const result = { ...base };
    for (const [key, value] of Object.entries(this.raw)) {
      const [op, field] = Overlay.split(key);
      if (field === "stages") result.stages = this.stages(result.stages, value, op);
      else if (field === "gates") result.gates = this.gates(result.gates, value, op);
      else this.field(result, field, op, value, TOP[field] ?? "value", "pipeline");
    }
    return result;
  }

  private stages(base: unknown, value: unknown, op?: Op): Raw[] {
    const stages = [...(Array.isArray(base) ? (base as Raw[]) : [])];
    if (op === "remove") {
      for (const id of Overlay.list(value)) {
        if (!stages.some((stage) => stage.id === id)) this.fail(`there is no stage "${id}" to remove`);
      }
      return stages.filter((stage) => !Overlay.list(value).includes(stage.id as string));
    }
    if (op) this.fail(`stages take changes by id or remove_stages, not ${op}_stages`);
    if (!Array.isArray(value)) this.fail("stages must be a list of stages with an id");
    for (const change of value as unknown[]) {
      if (!Overlay.isRecord(change) || typeof change.id !== "string") this.fail("every stage needs an id");
      const index = stages.findIndex((stage) => stage.id === change.id);
      if (index >= 0) {
        stages[index] = this.merge(stages[index], change, STAGE, `stage "${change.id}"`);
        continue;
      }
      if (change.task === undefined && change.run === undefined) this.fail(`there is no stage "${change.id}" to change`);
      stages.push(change);
    }
    return stages;
  }

  private gates(base: unknown, value: unknown, op?: Op): Raw {
    const gates: Raw = { ...(Overlay.isRecord(base) ? base : {}) };
    if (op === "remove") {
      for (const name of Overlay.list(value).map(String)) {
        if (!(name in gates)) this.fail(`there is no gate "${name}" to remove`);
        delete gates[name];
      }
      return gates;
    }
    if (op) this.fail(`gates take changes by name or remove_gates, not ${op}_gates`);
    if (!Overlay.isRecord(value)) this.fail("gates must be a mapping of name to checks");
    for (const [name, gate] of Object.entries(value)) {
      if (!Overlay.isRecord(gate)) this.fail(`gate "${name}" must be a mapping`);
      gates[name] = this.merge(Overlay.isRecord(gates[name]) ? gates[name] : {}, gate, GATE, `gate "${name}"`);
    }
    return gates;
  }

  private merge(base: Raw, change: Raw, schema: Schema, where: string): Raw {
    const result = { ...base };
    for (const [key, value] of Object.entries(change)) {
      const [op, field] = Overlay.split(key);
      this.field(result, field, op, value, schema[field] ?? "value", where);
    }
    return result;
  }

  private field(target: Raw, field: string, op: Op | undefined, value: unknown, kind: Kind, where: string): void {
    const current = target[field];
    if (typeof kind === "object") {
      if (op) this.fail(`${where}: ${op}_${field} is not allowed, set ${field} instead`);
      if (!Overlay.isRecord(value)) this.fail(`${where}: ${field} must be a mapping`);
      target[field] = this.merge(Overlay.isRecord(current) ? current : {}, value, kind, `${where} ${field}`);
      return;
    }
    if (!op) {
      if (kind === "map" && Overlay.isRecord(current) && Overlay.isRecord(value)) target[field] = { ...current, ...value };
      else target[field] = value;
      return;
    }
    if (kind === "text" && op !== "remove") {
      if (typeof value !== "string") this.fail(`${where}: ${op}_${field} must be text`);
      target[field] = Overlay.join(current, value, op);
      return;
    }
    if (kind === "list") {
      const items = Overlay.list(value);
      const list = Overlay.list(current);
      if (op === "append") target[field] = [...list, ...items];
      if (op === "prepend") target[field] = [...items, ...list];
      if (op === "remove") target[field] = list.filter((item) => !items.includes(item));
      return;
    }
    if (kind === "map" && op === "remove") {
      const map = { ...(Overlay.isRecord(current) ? current : {}) };
      for (const name of Overlay.list(value).map(String)) delete map[name];
      target[field] = map;
      return;
    }
    this.fail(`${where}: ${op}_${field} is not allowed, set ${field} instead`);
  }

  private fail(message: string): never {
    throw new UsageError(`${this.source}: ${message}`);
  }

  private static read(text: string, source: string): Raw {
    let raw: unknown;
    try {
      raw = parse(text);
    } catch (err) {
      throw new UsageError(`${source}: ${String((err as Error).message ?? err)}`);
    }
    if (!Overlay.isRecord(raw)) throw new UsageError(`${source} takes YAML keys, like "append_task: Check the login."`);
    return raw;
  }

  private static split(key: string): [Op | undefined, string] {
    const op = OPS.find((name) => key.startsWith(`${name}_`));
    if (!op) return [undefined, key];
    return [op, key.slice(op.length + 1)];
  }

  private static join(current: unknown, value: string, op: Op): string {
    if (typeof current !== "string" || !current.trim()) return value;
    if (op === "prepend") return `${value.trimEnd()}\n${current}`;
    return `${current.trimEnd()}\n${value}`;
  }

  // A single value is a list of one, as in the pipeline file.
  private static list(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  private static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

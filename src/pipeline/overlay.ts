import { parse } from "yaml";

import { UsageError } from "../usage-error.js";
import { Field, type Raw } from "./field.js";
import { PIPELINE } from "./spec.js";

/**
 * Changes laid over a raw pipeline before it is validated. A plain key
 * replaces, `append_` and `prepend_` add, `remove_` drops. Stages match by id,
 * prerequisites by name. PIPELINES.md documents every rule.
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
    return PIPELINE.merge(base, this.raw, { where: "pipeline", path: [], fail: (message) => this.fail(message) });
  }

  // No source: the keys are the file's own, and the file names itself.
  private fail(message: string): never {
    throw new UsageError(this.source ? `${this.source}: ${message}` : message);
  }

  private static read(text: string, source: string): Raw {
    let raw: unknown;
    try {
      raw = parse(text);
    } catch (err) {
      throw new UsageError(`${source}: ${String((err as Error).message ?? err)}`);
    }
    if (!Field.isRecord(raw)) throw new UsageError(`${source} takes YAML keys, like "append_task: Check the login."`);
    return raw;
  }
}

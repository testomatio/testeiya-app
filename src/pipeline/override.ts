import { parse } from "yaml";

import { UsageError } from "../usage-error.js";

type Raw = Record<string, unknown>;

/**
 * A change to a pipeline for one run, from `--pipeline YAML` or `--stage ID:YAML`.
 * It is a scripted-yaml patch, the same `$replace`, `$add`, `$before`, `$after`
 * and `$remove` a file that starts with `$extends` writes. `PipelineSource`
 * applies it. PIPELINES.md documents the rules.
 */
export class Override {
  constructor(
    /** What it is called in messages: `--pipeline`, `--stage review`. */
    readonly source: string,
    /** The patch, as data. */
    readonly patch: Raw,
  ) {}

  /** `--pipeline YAML`: a patch of the pipeline. */
  static pipeline(text: string): Override {
    return new Override("--pipeline", Override.read(text, "--pipeline"));
  }

  /** `--stage ID:YAML`: a patch of one stage. */
  static stage(value: string): Override {
    const colon = value.indexOf(":");
    const id = value.slice(0, colon);
    const source = `--stage ${id}`;
    if (colon <= 0 || !value.slice(colon + 1).trim()) throw new UsageError(`--stage takes ID:YAML, got "${value}"`);
    return new Override(source, { stages: { [id]: Override.read(value.slice(colon + 1), source) } });
  }

  /** What it changes, for logs: `$replace.timeout`, `task.$after`. */
  keys(): string[] {
    const stage = this.source.startsWith("--stage ") ? this.source.slice("--stage ".length) : undefined;
    const patch = stage ? (this.patch.stages as Raw)[stage] : this.patch;
    return Override.paths(patch);
  }

  private static paths(value: unknown, prefix = ""): string[] {
    if (!Override.isRecord(value)) return [prefix];
    return Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      // A change says what it does with its key; what it holds is the new value.
      if (key.startsWith("$")) return Override.isRecord(item) ? Object.keys(item).map((name) => `${path}.${name}`) : [path];
      return Override.paths(item, path);
    });
  }

  private static read(text: string, source: string): Raw {
    let raw: unknown;
    try {
      raw = parse(text);
    } catch (err) {
      throw new UsageError(`${source}: ${String((err as Error).message ?? err)}`);
    }
    if (!Override.isRecord(raw)) throw new UsageError(`${source} takes a YAML patch, like "$replace: { timeout: 45m }"`);
    return raw;
  }

  private static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

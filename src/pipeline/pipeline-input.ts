import { readFileSync } from "node:fs";

import { UsageError } from "../usage-error.js";

/** A JSON file of values, like `--input`. */
export const INPUT_FILE_VARIABLE = "TESTEIYA_PIPELINE_INPUT_FILE";
/** The values as a JSON object. */
export const INPUT_JSON_VARIABLE = "TESTEIYA_PIPELINE_INPUT_JSON";

type Raw = Record<string, unknown>;

/**
 * Values the job already has, for a pipeline's `$value!extract` prerequisites:
 * a value found here is not asked of the agent. JSON objects from
 * TESTEIYA_PIPELINE_INPUT_FILE, TESTEIYA_PIPELINE_INPUT_JSON, then each
 * `--input` file, merged in that order. A value is looked up under the
 * prerequisite's name, `{ "git": { "sha": "…" } }`, then at the top, `{ "sha": "…" }`.
 */
export class PipelineInput {
  constructor(private readonly data: Raw = {}) {}

  static read(files: string[], env: Record<string, string | undefined>): PipelineInput {
    const sources: Array<{ what: string; text: string }> = [];
    const file = env[INPUT_FILE_VARIABLE];
    if (file) sources.push({ what: `${INPUT_FILE_VARIABLE} ${file}`, text: PipelineInput.file(file, INPUT_FILE_VARIABLE) });
    const json = env[INPUT_JSON_VARIABLE];
    if (json?.trim()) sources.push({ what: INPUT_JSON_VARIABLE, text: json });
    for (const path of files) sources.push({ what: `--input ${path}`, text: PipelineInput.file(path, "--input") });
    const data: Raw = {};
    for (const source of sources) Object.assign(data, PipelineInput.parse(source.what, source.text));
    return new PipelineInput(data);
  }

  /** The value as text. Null, an empty text, a map or a list is not a value. */
  find(prerequisite: string, name: string): string | undefined {
    const own = this.data[prerequisite];
    if (PipelineInput.isRecord(own) && name in own) return PipelineInput.text(own[name]);
    return PipelineInput.text(this.data[name]);
  }

  private static text(value: unknown): string | undefined {
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value !== "string" || !value.trim()) return undefined;
    return value.trim();
  }

  private static file(path: string, what: string): string {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      throw new UsageError(`${what} ${path}: cannot read it (${(err as NodeJS.ErrnoException).code ?? String(err)})`);
    }
  }

  private static parse(what: string, text: string): Raw {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new UsageError(`${what} is not JSON: ${(err as Error).message}`);
    }
    if (!PipelineInput.isRecord(data)) throw new UsageError(`${what} is not a JSON object like { "sha": "…" }`);
    return data;
  }

  private static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

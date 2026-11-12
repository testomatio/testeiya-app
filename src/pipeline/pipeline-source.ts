import { isMap, isScalar, isSeq, LineCounter, parseDocument, stringify, type Document, type Node } from "yaml";

import { UsageError } from "../usage-error.js";
import { Duration } from "./duration.js";
import { Overlay } from "./overlay.js";
import { PipelineError } from "./pipeline-error.js";
import type { ChangesSpec, GateSpec, PipelineSpec, StageSpec, StopOn } from "./spec.js";
import { Variables } from "./variables.js";

/** `pipeline.json` and the summary's own files live beside the stages' files. */
const RESERVED_IDS = ["pipeline", "summary"];
const TOP_KEYS = ["name", "description", "target", "summary", "env", "packages", "prerequisites", "when", "stages"];
const GATE_KEYS = ["env", "file", "run", "changes", "message", "secret"];
const CHANGES_KEYS = ["paths", "ignore", "min_files"];
const STAGE_EMOJIS = ["🔹", "🔸", "🧪", "🔍", "🛠️", "📋", "🚀", "🧭", "📦", "🧩", "🎯", "⚙️"];
const STAGE_KEYS = ["id", "title", "emoji", "task", "run", "session", "inputs", "outputs", "when", "stopOn", "timeout", "each_line", "each_file"];

/** The text of the pipeline `extends` names, or undefined when there is none. */
export type ExtendsResolver = (name: string) => string | undefined;

export interface PipelineSourceOptions {
  /** The default for `name:`. The CLI passes the file's base name. */
  name?: string;
  resolve?: ExtendsResolver;
}

type Raw = Record<string, unknown>;
/** Where a value sits in the pipeline: `["stages", 2, "when"]`. */
type Path = Array<string | number>;

/**
 * A pipeline's text, parsed and validated into a `PipelineSpec`: the parser
 * under the CLI's `PipelineFile` and the package's `Pipelines`. It reads no
 * file and imports nothing from Node, so a Worker and a browser run the same
 * checks as the CLI. Every mistake is a `PipelineError`, with the line and key
 * it is about when the file's own text has them.
 */
export class PipelineSource {
  private readonly lines = new LineCounter();
  private document?: Document;
  /** The raw stages being validated, so an error in stage 3 finds stage 3's line by its id. */
  private stages: unknown[] = [];

  constructor(
    private readonly source: string,
    private readonly options: PipelineSourceOptions = {},
  ) {}

  spec(overlays: Overlay[] = []): PipelineSpec {
    return this.validate(this.resolved(overlays));
  }

  /** The YAML with `extends` and overlays applied: what the container runs. It is not validated: call `spec` for that. */
  text(overlays: Overlay[] = []): string {
    const raw = this.resolved(overlays);
    if (raw.name === undefined && this.options.name) return stringify({ name: this.options.name, ...raw });
    return stringify(raw);
  }

  private resolved(overlays: Overlay[]): Raw {
    // Not its own name: a file called regression may extend the bundled regression.
    let raw = this.raw(this.source, [], true);
    for (const overlay of overlays) {
      try {
        raw = overlay.apply(raw);
      } catch (err) {
        if (err instanceof UsageError) throw new PipelineError(err.message, { source: overlay.source });
        throw err;
      }
    }
    return raw;
  }

  // The file's own keys are an overlay on the pipeline it extends.
  // Only this source's own text has lines an error can point at.
  private raw(text: string, chain: string[], own = false): Raw {
    // The own text is parsed once: a LineCounter counts every parse it sees.
    const document = own ? (this.document ??= parseDocument(text, { lineCounter: this.lines })) : parseDocument(text);
    const [error] = document.errors;
    if (error) {
      const line = own ? error.linePos?.[0]?.line : undefined;
      throw new PipelineError(error.message, { line });
    }
    const raw: unknown = document.toJS();
    if (!PipelineSource.isRecord(raw)) return this.fail("a pipeline is a YAML mapping");
    if (raw.extends === undefined) return raw;

    const { extends: name, ...keys } = raw;
    if (typeof name !== "string" || !name) return this.fail("extends names a pipeline", ["extends"]);
    if (chain.includes(name)) return this.fail(`extends ${name} loops back to itself`, ["extends"]);
    const parentText = this.parentText(name);
    if (parentText === undefined) return this.fail(`no pipeline "${name}" to extend`, ["extends"]);
    let parent: Raw;
    try {
      parent = this.raw(parentText, [...chain, name]);
    } catch (err) {
      // The parent's lines are not this text's.
      if (err instanceof PipelineError && err.source === undefined) {
        throw new PipelineError(`extends ${name}: ${err.message}`, { key: "extends", line: this.lineOf(["extends"]) });
      }
      throw err;
    }
    try {
      return new Overlay("", keys).apply(parent);
    } catch (err) {
      if (err instanceof UsageError && !(err instanceof PipelineError)) return this.fail(err.message);
      throw err;
    }
  }

  // A resolver's own error, such as a loop it found, is about this text's `extends`.
  private parentText(name: string): string | undefined {
    try {
      return this.options.resolve?.(name);
    } catch (err) {
      if (err instanceof PipelineError && err.source === undefined) {
        throw new PipelineError(err.message, { key: "extends", line: this.lineOf(["extends"]) });
      }
      throw err;
    }
  }

  private validate(raw: Raw): PipelineSpec {
    if (raw.gates !== undefined) return this.fail("gates is now called prerequisites", ["gates"]);
    this.unknownKeys(raw, TOP_KEYS, "pipeline", []);

    const prerequisites: Record<string, GateSpec> = {};
    const rawPrerequisites = raw.prerequisites ?? {};
    if (!PipelineSource.isRecord(rawPrerequisites)) return this.fail("prerequisites must be a mapping of name to checks", ["prerequisites"]);
    for (const [name, value] of Object.entries(rawPrerequisites)) prerequisites[name] = this.gate(name, value);

    const rawStages = raw.stages;
    if (!Array.isArray(rawStages) || rawStages.length === 0) return this.fail("stages must be a non-empty list", ["stages"]);
    this.stages = rawStages;
    const stages = rawStages.map((value, index) => this.stage(value, index));

    const spec: PipelineSpec = {
      name: this.string(raw.name, "name", ["name"]) ?? this.options.name ?? "pipeline",
      description: this.string(raw.description, "description", ["description"]) ?? "",
      target: this.string(raw.target, "target", ["target"]),
      summary: this.string(raw.summary, "summary", ["summary"]),
      env: this.map(raw.env, "env", ["env"]),
      packages: this.map(raw.packages, "packages", ["packages"]),
      prerequisites,
      when: this.list(raw.when, "when", ["when"]),
      stages,
    };
    this.checkReferences(spec);
    this.checkFilters(spec);
    return spec;
  }

  private gate(name: string, value: unknown): GateSpec {
    const at: Path = ["prerequisites", name];
    const where = `prerequisite "${name}"`;
    if (!PipelineSource.isRecord(value)) return this.fail(`${where} must be a mapping`, at);
    this.unknownKeys(value, GATE_KEYS, where, at);
    const message = this.string(value.message, `${where} message`, [...at, "message"]);
    if (!message) return this.fail(`${where} needs a message`, at);
    const gate: GateSpec = { message };
    if (value.env !== undefined) gate.env = this.list(value.env, `${where} env`, [...at, "env"]);
    if (value.file !== undefined) gate.file = this.list(value.file, `${where} file`, [...at, "file"]);
    if (value.run !== undefined) gate.run = this.string(value.run, `${where} run`, [...at, "run"]);
    if (value.changes !== undefined) gate.changes = this.changes(name, value.changes);
    if (!gate.env && !gate.file && !gate.run && !gate.changes) {
      return this.fail(`${where} needs a check: env, file, run or changes`, at);
    }
    if (value.secret !== undefined) {
      if (typeof value.secret !== "boolean") return this.fail(`${where} secret must be true or false`, [...at, "secret"]);
      if (value.secret && !gate.env?.length) return this.fail(`${where} secret hides env variables, and it has none`, [...at, "secret"]);
      gate.secret = value.secret;
    }
    return gate;
  }

  private changes(name: string, value: unknown): ChangesSpec {
    const at: Path = ["prerequisites", name, "changes"];
    const where = `prerequisite "${name}"`;
    if (!PipelineSource.isRecord(value)) return this.fail(`${where} changes must be a mapping`, at);
    this.unknownKeys(value, CHANGES_KEYS, `${where} changes`, at);
    const rule: ChangesSpec = {};
    if (value.paths !== undefined) rule.paths = this.list(value.paths, `${where} paths`, [...at, "paths"]);
    if (value.ignore !== undefined) rule.ignore = this.list(value.ignore, `${where} ignore`, [...at, "ignore"]);
    if (value.min_files !== undefined) {
      if (!Number.isInteger(value.min_files) || (value.min_files as number) < 1) {
        return this.fail(`${where} min_files must be a whole number above 0`, [...at, "min_files"]);
      }
      rule.min_files = value.min_files as number;
    }
    return rule;
  }

  private stage(value: unknown, index: number): StageSpec {
    const at: Path = ["stages", index];
    if (!PipelineSource.isRecord(value)) return this.fail(`stage ${index + 1} must be a mapping`, at);
    const id = value.id;
    if (typeof id !== "string" || !PipelineSource.isSlug(id)) {
      return this.fail(`stage ${index + 1} needs an id of lowercase words joined by dashes`, [...at, "id"]);
    }
    const where = `stage "${id}"`;
    this.unknownKeys(value, STAGE_KEYS, where, at);
    if (RESERVED_IDS.includes(id)) this.fail(`${where}: "${id}" is reserved`, [...at, "id"]);
    if ((value.task === undefined) === (value.run === undefined)) this.fail(`${where} needs exactly one of task or run`, at);
    if (value.each_line !== undefined && value.each_file !== undefined) {
      this.fail(`${where} can loop over each_line or each_file, not both`, at);
    }

    const title = this.string(value.title, `${where} title`, [...at, "title"]) || PipelineSource.titleOf(id);
    const emoji = this.string(value.emoji, `${where} emoji`, [...at, "emoji"]) || PipelineSource.emojiOf(id);

    const stage: StageSpec = {
      id,
      title,
      emoji,
      inputs: this.list(value.inputs, `${where} inputs`, [...at, "inputs"]),
      outputs: this.list(value.outputs, `${where} outputs`, [...at, "outputs"]),
      when: this.list(value.when, `${where} when`, [...at, "when"]),
      stopOn: this.list(value.stopOn, `${where} stopOn`, [...at, "stopOn"]) as StopOn[],
    };
    for (const reason of stage.stopOn) {
      if (reason !== "fail" && reason !== "gate") this.fail(`${where} stopOn takes fail or gate, got "${reason}"`, [...at, "stopOn"]);
    }
    if (value.task !== undefined) stage.task = this.string(value.task, `${where} task`, [...at, "task"]);
    if (value.run !== undefined) stage.run = this.string(value.run, `${where} run`, [...at, "run"]);
    if (value.session !== undefined) {
      const session = this.string(value.session, `${where} session`, [...at, "session"]);
      if (!session || !PipelineSource.isSlug(session)) this.fail(`${where} session must be lowercase words joined by dashes`, [...at, "session"]);
      stage.session = session;
    }
    if (value.each_line !== undefined) stage.each_line = this.string(value.each_line, `${where} each_line`, [...at, "each_line"]);
    if (value.each_file !== undefined) stage.each_file = this.string(value.each_file, `${where} each_file`, [...at, "each_file"]);
    if (value.timeout !== undefined) {
      if (!Duration.ms(value.timeout)) this.fail(`${where} timeout must look like 90s, 30m or 1h`, [...at, "timeout"]);
      stage.timeout = value.timeout as string | number;
    }
    return stage;
  }

  private checkReferences(spec: PipelineSpec): void {
    const ids = new Set<string>();
    for (const [index, stage] of spec.stages.entries()) {
      if (ids.has(stage.id)) this.fail(`two stages are called "${stage.id}"`, ["stages", index, "id"]);
      ids.add(stage.id);
    }
    for (const name of spec.when) {
      if (!spec.prerequisites[name]) this.fail(`when names prerequisite "${name}", which prerequisites does not define`, ["when"]);
    }
    for (const [index, stage] of spec.stages.entries()) {
      for (const name of stage.when) {
        if (!spec.prerequisites[name]) {
          this.fail(`stage "${stage.id}" when names prerequisite "${name}", which prerequisites does not define`, ["stages", index, "when"]);
        }
      }
    }
  }

  // Filters run where the runner expands. A shell would fail on them.
  private checkFilters(spec: PipelineSpec): void {
    const texts: Array<[string, Path, string]> = Object.entries(spec.env).map(([key, value]) => [`env.${key}`, ["env", key], value]);
    for (const [name, version] of Object.entries(spec.packages)) texts.push([`packages.${name}`, ["packages", name], version]);
    for (const [name, gate] of Object.entries(spec.prerequisites)) {
      for (const file of gate.file ?? []) texts.push([`prerequisite "${name}" file`, ["prerequisites", name, "file"], file]);
      if (gate.run) texts.push([`prerequisite "${name}" run`, ["prerequisites", name, "run"], gate.run]);
    }
    for (const [index, stage] of spec.stages.entries()) {
      if (stage.task) texts.push([`stage "${stage.id}" task`, ["stages", index, "task"], stage.task]);
      for (const output of stage.outputs) texts.push([`stage "${stage.id}" outputs`, ["stages", index, "outputs"], output]);
      if (stage.run && Variables.filtered(stage.run)) {
        this.fail(`stage "${stage.id}" run: a shell command cannot use filters. Set a variable in env and use that`, ["stages", index, "run"]);
      }
    }
    for (const [where, path, text] of texts) {
      const problem = Variables.problem(text);
      if (problem) this.fail(`${where}: ${problem}`, path);
    }
  }

  private unknownKeys(value: Raw, known: string[], where: string, at: Path): void {
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) this.fail(`${where} has an unknown key "${key}"`, [...at, key]);
    }
  }

  private string(value: unknown, what: string, at: Path): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return this.fail(`${what} must be text`, at);
    return value;
  }

  // A single value is a list of one, so `stopOn: fail` and `when: staging` read naturally.
  private list(value: unknown, what: string, at: Path): string[] {
    if (value === undefined || value === null) return [];
    if (typeof value === "string") return [value];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      return this.fail(`${what} must be a list of text`, at);
    }
    return value as string[];
  }

  private map(value: unknown, what: string, at: Path): Record<string, string> {
    if (value === undefined || value === null) return {};
    if (!PipelineSource.isRecord(value)) return this.fail(`${what} must be a mapping`, at);
    const map: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
        this.fail(`${what}.${key} must be text`, [...at, key]);
      }
      map[key] = String(item);
    }
    return map;
  }

  private fail(message: string, at?: Path): never {
    if (!at) throw new PipelineError(message);
    throw new PipelineError(message, { key: PipelineSource.keyOf(at), line: this.lineOf(at) });
  }

  /**
   * The line of the deepest part of `at` this text has. A stage is found by its
   * id, so the line holds when `extends` or an overlay moved it.
   */
  private lineOf(at: Path): number | undefined {
    let node: unknown = this.document?.contents;
    let offset: number | undefined;
    for (const [depth, segment] of at.entries()) {
      let next: unknown;
      let start: number | undefined;
      if (isMap(node)) {
        const pair = node.items.find((item) => isScalar(item.key) && item.key.value === segment);
        next = pair?.value;
        start = (pair?.key as Node | undefined)?.range?.[0];
      } else if (isSeq(node) && typeof segment === "number") {
        next = this.stageNode(node.items, at[depth - 1] === "stages" ? this.stages[segment] : undefined, segment);
        start = (next as Node | undefined)?.range?.[0];
      }
      if (start === undefined) break;
      offset = start;
      node = next;
    }
    if (offset === undefined) return undefined;
    return this.lines.linePos(offset).line;
  }

  private stageNode(items: unknown[], stage: unknown, index: number): unknown {
    const id = PipelineSource.isRecord(stage) ? stage.id : undefined;
    if (typeof id !== "string") return this.document?.has("extends") ? undefined : items[index];
    return items.find((item) => isMap(item) && item.get("id") === id);
  }

  private static keyOf(at: Path): string {
    return at.map((segment, index) => (typeof segment === "number" ? `[${segment}]` : index ? `.${segment}` : segment)).join("");
  }

  private static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // `browser-testing` reads as "Browser testing".
  private static titleOf(id: string): string {
    const words = id.split("-").join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  // Picked from the id, so a stage keeps its emoji across runs.
  private static emojiOf(id: string): string {
    const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
    return STAGE_EMOJIS[sum % STAGE_EMOJIS.length];
  }

  private static isSlug(value: string): boolean {
    if (!value || value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
    return [...value].every((char) => (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-");
  }
}

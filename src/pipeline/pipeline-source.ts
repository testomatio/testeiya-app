import { isMap, isScalar, isSeq, LineCounter, parseDocument, stringify, type Document as YamlDocument, type Node as YamlNode } from "yaml";
import { Files, ScriptedYaml, ValidationFailed, type Document, type FileText, type Problem } from "scripted-yaml/core";

import { BUNDLED_DSL } from "./bundled.js";
import { COMPUTED_MARKERS, PIPELINE_MARKERS } from "./markers.js";
import type { Override } from "./override.js";
import { PipelineBuilder } from "./pipeline-builder.js";
import type { PipelineDefinition } from "./pipeline-definition.js";
import { PipelineError, PipelineErrors } from "./pipeline-error.js";
import type { PipelineSpec } from "./spec.js";

/** The DSL every pipeline is checked against, wherever the file is: `$dsl: ./pipeline.dsl.yml`. */
export const DSL_FILE = "pipeline.dsl.yml";
const DSL_LINE = `$dsl: ./${DSL_FILE}\n`;
/** What an override's patch extends: the pipeline as it was before it. */
const BEFORE_OVERRIDE = "./pipeline-before-override.yml";

export interface PipelineSourceOptions {
  /** The default for `name:`. The CLI passes the file's base name. */
  name?: string;
  /** What the text is called: problems name it, and its `$extends` paths start from it. */
  file?: string;
  /** Reads what `$extends` names, by name or path. Undefined: `files` is asked. The DSL is always found. */
  read?: Reader;
  /** Where a name `read` leaves goes next, such as the disk (`DiskFiles`). None: there is no such file. */
  files?: Files;
}

/** The text a name stands for, or undefined when someone else should look. */
export type Reader = (path: string, from: string | undefined) => FileText | undefined;

type Raw = Record<string, unknown>;
/** Where a value sits in the pipeline: `["stages", 2, "when"]`. */
export type Path = Array<string | number>;

/**
 * A pipeline's text, loaded with scripted-yaml and checked into a
 * `PipelineDefinition`: the parser under the CLI's `PipelineFile` and the
 * package's `Pipelines`. It reads no file, unless `read` leaves a path to the
 * disk, so a Worker runs the same checks as the CLI. Every mistake is a
 * `PipelineError`, with the line and key it is about when the text has them.
 */
export class PipelineSource {
  private readonly lines = new LineCounter();
  private yamlDocument?: YamlDocument;
  private definitions = new Map<string, PipelineDefinition>();

  constructor(
    private readonly source: string,
    private readonly options: PipelineSourceOptions = {},
  ) {}

  get file(): string {
    return this.options.file ?? "(pipeline)";
  }

  definition(overrides: Override[] = []): PipelineDefinition {
    const key = JSON.stringify(overrides.map((override) => [override.source, override.patch]));
    let definition = this.definitions.get(key);
    if (!definition) {
      definition = this.build(overrides);
      this.definitions.set(key, definition);
    }
    return definition;
  }

  spec(overrides: Override[] = []): PipelineSpec {
    return this.definition(overrides).spec;
  }

  /** The YAML with `$extends` and overrides applied: one file that runs on its own. */
  text(overrides: Override[] = []): string {
    return this.definition(overrides).text;
  }

  private build(overrides: Override[]): PipelineDefinition {
    OldFormat.check(this.raw(), (message, at) => this.fail(message, at));
    let document = this.load(this.source, this.file);
    for (const override of overrides) document = this.apply(override, document);
    const merged = this.merged(document, this.file);
    if (merged.name === undefined && this.options.name) merged.name = this.options.name;
    const text = stringify(merged);
    // What runs is the one file: a formula that read `base` has the base's formula in it now.
    if (overrides.length > 0 || PipelineSource.extends(this.raw())) document = this.load(text, this.file, false);
    return new PipelineBuilder(document, text, this.options.name, (message, at) => this.fail(message, at)).build();
  }

  /** A warning stops a pipeline too: a field the DSL does not know is a typo. `lines` false: the text is not this file's own. */
  private load(text: string, file: string, lines = true): Document {
    // The DSL is checked whether the file names it or not; a line put in moves every line after it by one.
    const shift = PipelineSource.namesDsl(text) ? 0 : 1;
    const input = shift ? PipelineSource.withDsl(text) : text;
    const files = this.files();
    const scripted = this.scripted(files);
    try {
      const problems = scripted.validateText(input, { file });
      files.check();
      if (problems.length > 0) throw new ValidationFailed(problems);
      return scripted.loadTextSync(input, { file });
    } catch (err) {
      if (err instanceof ValidationFailed) throw this.problems(err.problems, file, lines ? shift : Number.POSITIVE_INFINITY);
      throw err;
    }
  }

  // An override is a patch of the pipeline as it was: scripted-yaml applies it like a file that extends it.
  private apply(override: Override, document: Document): Document {
    OldFormat.check(override.patch, (message) => {
      throw new PipelineError(`${override.source}: ${message}`, { source: override.source });
    });
    const before = stringify(this.merged(document, override.source));
    const read: Reader = (path) => (path === BEFORE_OVERRIDE ? { file: `${override.source} (before)`, text: before } : this.read(path, override.source));
    const patch = { $extends: BEFORE_OVERRIDE, ...override.patch };
    const files = this.files(read);
    const scripted = this.scripted(files);
    try {
      const problems = scripted.validateText(patch, { file: override.source });
      files.check();
      if (problems.length > 0) throw new ValidationFailed(problems);
      return scripted.loadTextSync(patch, { file: override.source });
    } catch (err) {
      if (!(err instanceof ValidationFailed)) throw err;
      const errors = err.problems.map((problem) => new PipelineError(`${override.source}: ${PipelineSource.say(problem)}`, { source: override.source }));
      throw PipelineErrors.of(errors);
    }
  }

  private files(read: Reader = (path, from) => this.read(path, from)): ReaderFiles {
    return new ReaderFiles(read, this.options.files);
  }

  private scripted(files: Files): ScriptedYaml {
    return new ScriptedYaml({ markers: PIPELINE_MARKERS, computed: COMPUTED_MARKERS, files });
  }

  /** The DSL wherever a file names it; anything else as the options read it, checked for the old format first. */
  private read(path: string, from: string | undefined): FileText | undefined {
    if (path.split("/").at(-1) === DSL_FILE) return { file: DSL_FILE, text: BUNDLED_DSL };
    let found: FileText | undefined;
    try {
      found = this.options.read?.(path, from) ?? this.options.files?.read(path, from);
    } catch (err) {
      if (err instanceof PipelineError && err.line === undefined) throw new PipelineError(err.message, { key: "$extends", line: this.lineOf(["$extends"]) });
      throw err;
    }
    if (found === undefined) return undefined;
    const parsed = parseDocument(found.text);
    OldFormat.check(PipelineSource.isRecord(parsed.toJS()) ? parsed.toJS() : {}, (message) => {
      throw new PipelineError(`$extends ${path}: ${message}`, { key: "$extends", line: this.lineOf(["$extends"]) });
    });
    return found;
  }

  /** The file with `$extends` applied, keys as written. A formula cannot hold a marked `base`: that is the file's mistake. */
  private merged(document: Document, file: string): Record<string, unknown> {
    try {
      return MergedBase.inline(document.merged(), (message, at) => this.fail(message, at));
    } catch (err) {
      if (err instanceof ValidationFailed) throw this.problems(err.problems, file, Number.POSITIVE_INFINITY);
      throw err;
    }
  }

  /** scripted-yaml's problems as pipeline errors. Only this text's own problems have a line here. */
  private problems(problems: Problem[], file: string, shift: number): PipelineError {
    const errors = problems.map((problem) => {
      const message = PipelineSource.say(problem);
      if (problem.file !== file) return new PipelineError(`${problem.file}: ${message}`, { key: problem.key || undefined });
      const line = problem.line > shift ? problem.line - shift : undefined;
      return new PipelineError(message, { line, key: problem.key || undefined });
    });
    return PipelineErrors.of(errors);
  }

  private static say(problem: Problem): string {
    return problem.key ? `${problem.key}: ${problem.message}` : problem.message;
  }

  private raw(): Raw {
    const document = this.yaml();
    const [error] = document.errors;
    // scripted-yaml reports a broken file with its line; the old format needs a file that parses.
    if (error) return {};
    let raw: unknown;
    try {
      raw = document.toJS();
    } catch (err) {
      // Text that parses can still have no value: an alias to an anchor that is not there.
      throw new PipelineError(err instanceof Error ? err.message : String(err));
    }
    return PipelineSource.isRecord(raw) ? raw : {};
  }

  private yaml(): YamlDocument {
    // Parsed once: a LineCounter counts every parse it sees.
    return (this.yamlDocument ??= parseDocument(this.source, { lineCounter: this.lines }));
  }

  private fail(message: string, at?: Path): never {
    if (!at) throw new PipelineError(message);
    throw new PipelineError(message, { key: PipelineSource.keyOf(at), line: this.lineOf(at) });
  }

  /** The line of the deepest part of `at` this text has. A stage is found by its id, so the line holds when `$extends` moved it. */
  private lineOf(at: Path): number | undefined {
    let node: unknown = this.yaml().contents;
    let offset: number | undefined;
    for (const segment of at) {
      let next: unknown;
      let start: number | undefined;
      if (isMap(node)) {
        const pair = node.items.find((item) => isScalar(item.key) && PipelineSource.named(String(item.key.value)) === segment);
        next = pair?.value;
        start = (pair?.key as YamlNode | undefined)?.range?.[0];
      } else if (isSeq(node) && typeof segment === "string") {
        next = node.items.find((item) => isMap(item) && item.get("id") === segment);
        start = (next as YamlNode | undefined)?.range?.[0];
      } else if (isSeq(node) && typeof segment === "number") {
        next = node.items[segment];
        start = (next as YamlNode | undefined)?.range?.[0];
      }
      if (start === undefined) break;
      offset = start;
      node = next;
    }
    if (offset === undefined) return undefined;
    return this.lines.linePos(offset).line;
  }

  /** `when!` and `run!sh` are the keys `when` and `run`. */
  static named(key: string): string {
    const at = key.lastIndexOf("!");
    return at < 0 ? key : key.slice(0, at);
  }

  /** `stages.tests.timeout`, as scripted-yaml names a place: a stage by its id, else by its number. */
  static keyOf(at: Path): string {
    return at.map((segment, index) => (typeof segment === "number" ? `[${segment + 1}]` : index ? `.${segment}` : segment)).join("");
  }

  private static extends(raw: Raw): boolean {
    return raw.$extends !== undefined;
  }

  private static namesDsl(text: string): boolean {
    return /^\$dsl\s*:/m.test(text);
  }

  /** `$dsl` first, or right after the `---` that starts the document. */
  private static withDsl(text: string): string {
    const start = text.match(/^(?:[ \t]*(?:#.*|%.*)?\r?\n)*---[^\n]*\n/);
    if (!start) return DSL_LINE + text;
    return start[0] + DSL_LINE + text.slice(start[0].length);
  }

  static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

/**
 * scripted-yaml's `Files` over a `Reader`: names it does not know go to `fallback`, which also says
 * when two names are one file. scripted-yaml reports what a reader refuses as a problem of its own;
 * `check` throws the pipeline's error as it was, line and all.
 */
class ReaderFiles extends Files {
  private refused?: PipelineError;

  constructor(
    private readonly reader: Reader,
    private readonly fallback?: Files,
  ) {
    super();
  }

  read(path: string, from: string | undefined): FileText | undefined {
    try {
      return this.reader(path, from);
    } catch (err) {
      if (err instanceof PipelineError) this.refused ??= err;
      throw err;
    }
  }

  check(): void {
    if (this.refused) throw this.refused;
  }

  key(file: string): string {
    return this.fallback ? this.fallback.key(file) : super.key(file);
  }
}

/**
 * `merged()` keeps the entry a formula's `base` replaced under `$base`. A pipeline shows its condition
 * and finds the prerequisites a stage needs from the formula's text, so each `base` is written out
 * there, in brackets, and `$base` goes.
 */
class MergedBase {
  static inline(data: Raw, fail: (message: string, at?: Path) => never): Raw {
    return new MergedBase(fail).value(data, []) as Raw;
  }

  private constructor(private readonly fail: (message: string, at?: Path) => never) {}

  private value(value: unknown, at: Path): unknown {
    if (Array.isArray(value)) return value.map((item, index) => this.value(item, [...at, PipelineSource.isRecord(item) && typeof item.id === "string" ? item.id : index]));
    if (!PipelineSource.isRecord(value)) return value;
    const base = PipelineSource.isRecord(value.$base) ? value.$base : undefined;
    const data: Raw = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "$base") continue;
      data[key] = base && MergedBase.isFormula(key) && typeof item === "string" ? this.formula(key, item, base, [...at, key]) : this.value(item, [...at, key]);
    }
    return data;
  }

  /** The formula with `base` replaced by what it stood for. */
  private formula(key: string, source: string, base: Raw, at: Path): string {
    if (!MergedBase.readsBase(source)) return source;
    const name = MergedBase.name(key);
    const replaced = Object.keys(base).find((other) => other !== "$base" && MergedBase.name(other) === name);
    const value = replaced === undefined ? undefined : base[replaced];
    let inlined: string;
    if (replaced !== undefined && MergedBase.isFormula(replaced) && typeof value === "string") {
      inlined = PipelineSource.isRecord(base.$base) ? this.formula(replaced, value, base.$base, at) : value;
    } else if (replaced !== undefined && !replaced.includes("!") && (value === null || typeof value !== "object")) {
      inlined = JSON.stringify(value ?? null);
    } else {
      const what = replaced?.includes("!") ? "a marked value" : "a map or a list";
      return this.fail(`${PipelineSource.keyOf(at)}: base is ${what}, which a formula cannot hold: the file cannot be written without its base`, at);
    }
    return MergedBase.replace(source, `(${inlined})`);
  }

  /** `when!` is a formula; `run!sh` is marked. */
  private static isFormula(key: string): boolean {
    return key.endsWith("!");
  }

  private static name(key: string): string {
    const at = key.indexOf("!");
    return at < 0 ? key : key.slice(0, at);
  }

  private static readsBase(source: string): boolean {
    return MergedBase.outsideText(source).some((part) => /(?<![\w.])base(?![\w])/.test(part));
  }

  /** Every `base` that is a name, not part of a longer name, a field or a text. */
  private static replace(source: string, by: string): string {
    return source
      .split(/("(?:[^"\\]|\\.)*")/)
      .map((part, index) => (index % 2 ? part : part.replace(/(?<![\w.])base(?![\w])/g, by)))
      .join("");
  }

  private static outsideText(source: string): string[] {
    return source.split(/("(?:[^"\\]|\\.)*")/).filter((_, index) => index % 2 === 0);
  }
}

/**
 * The pipeline format before scripted-yaml. A file written in it fails with
 * the new spelling, before scripted-yaml reports what it does not know.
 */
class OldFormat {
  private static readonly prerequisiteChecks: Record<string, string> = {
    env: '$value!: vars.NAME != null (one "vars.NAME != null" per variable, joined by "and")',
    file: "$value!file: [path]",
    run: "$value!sh: <command>",
    changes: "$value!changes: { paths, ignore, min_files }",
    secret: "secret: true on the variable in $vars: { NAME: { optional: true, secret: true } }",
  };

  private static readonly stageKinds: Record<string, string> = {
    task: "run!task: <task>",
    decide: "run!decide: <question>",
    extract: "run!extract: { name: what it is } (one key per value; the format goes there)",
    format: "the keys of run!extract: { name: what it is }",
  };

  constructor(private readonly fail: (message: string, at?: Path) => never) {}

  static check(raw: Raw, fail: (message: string, at?: Path) => never): void {
    new OldFormat(fail).pipeline(raw);
  }

  private pipeline(raw: Raw): void {
    if (raw.gates !== undefined) this.fail("gates is now called prerequisites", ["gates"]);
    if (raw.extends !== undefined) this.fail("extends is now $extends, and the keys it changes go under $replace, $add, $before, $after or $remove", ["extends"]);
    this.operations(raw, []);
    if (raw.when !== undefined) this.fail("when is now a formula: when!: prerequisites.a and prerequisites.b", ["when"]);
    if (PipelineSource.isRecord(raw.prerequisites)) {
      for (const [name, gate] of Object.entries(raw.prerequisites)) this.prerequisite(name, gate);
    }
    for (const key of ["summary", "description"]) this.text(raw[key], [key]);
    if (PipelineSource.isRecord(raw.env)) for (const [key, value] of Object.entries(raw.env)) this.text(value, ["env", key]);
    if (PipelineSource.isRecord(raw.packages)) for (const [key, value] of Object.entries(raw.packages)) this.text(value, ["packages", key]);
    if (Array.isArray(raw.stages)) raw.stages.forEach((stage, index) => this.stage(stage, index));
  }

  private prerequisite(name: string, gate: unknown): void {
    if (!PipelineSource.isRecord(gate)) return;
    for (const [key, spelling] of Object.entries(OldFormat.prerequisiteChecks)) {
      if (gate[key] !== undefined) this.fail(`prerequisite "${name}" ${key} is now ${spelling}`, ["prerequisites", name, key]);
    }
    this.text(gate.message, ["prerequisites", name, "message"]);
  }

  private stage(stage: unknown, index: number): void {
    if (!PipelineSource.isRecord(stage)) return;
    const at: Path = ["stages", typeof stage.id === "string" ? stage.id : index];
    if (stage.when !== undefined) this.fail("when is now a formula: when!: prerequisites.a and prerequisites.b", [...at, "when"]);
    if (stage.run !== undefined) this.fail("run is now run!sh: <command>", [...at, "run"]);
    for (const [key, spelling] of Object.entries(OldFormat.stageKinds)) {
      if (stage[key] !== undefined) this.fail(`${key} is now ${spelling}`, [...at, key]);
    }
    for (const key of ["run!task", "run!decide", "title"]) this.text(stage[key], [...at, PipelineSource.named(key)]);
    for (const key of ["inputs", "outputs"]) for (const item of Array.isArray(stage[key]) ? stage[key] : []) this.text(item, [...at, key]);
  }

  /** `append_task`, `remove_stages`: the overlay keys. */
  private operations(value: unknown, at: Path): void {
    if (Array.isArray(value)) value.forEach((item, index) => this.operations(item, [...at, PipelineSource.isRecord(item) && typeof item.id === "string" ? item.id : index]));
    if (!PipelineSource.isRecord(value)) return;
    for (const [key, item] of Object.entries(value)) {
      const old = key.match(/^(append|prepend|remove)_(\w+)$/);
      if (old) {
        const [, op, field] = old;
        const now = { append: "$after", prepend: "$before", remove: "$remove" }[op as "append" | "prepend" | "remove"];
        const example = op === "remove" ? `${field === "stages" || field === "prerequisites" ? field : field}: { $remove: [...] }` : `${field}: { ${now}: ... }`;
        this.fail(`${key} is now ${now}: write ${example}`, [...at, key]);
      }
      this.operations(item, [...at, key]);
    }
  }

  /** `${NAME}` was expanded by the runner. Text now says `{{ vars.NAME }}`. */
  private text(value: unknown, at: Path): void {
    if (typeof value !== "string") return;
    const reference = value.match(/\$\{([A-Za-z_][A-Za-z0-9_]*)[^}]*\}/);
    if (!reference) return;
    this.fail(`${reference[0]} is now {{ vars.${reference[1]} }} (filters are FEEL formulas: see PIPELINES.md)`, at);
  }
}

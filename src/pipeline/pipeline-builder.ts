import { Expression, type Document } from "scripted-yaml";

import { Duration } from "./duration.js";
import { ChangesMarker, FileMarker, Marked, ShellMarker } from "./markers.js";
import { PipelineDefinition, type InputRead } from "./pipeline-definition.js";
import type { Path } from "./pipeline-source.js";
import type { ChangesSpec, GateSpec, PipelineSpec, StageSpec, StopOn } from "./spec.js";
import { Variables } from "./variables.js";

/** `pipeline.json` and the summary's own files live beside the stages' files. */
const RESERVED_IDS = ["pipeline", "summary"];
const CHANGES_KEYS = ["paths", "ignore", "min_files"];
const STAGE_EMOJIS = ["🔹", "🔸", "🧪", "🔍", "🛠️", "📋", "🚀", "🧭", "📦", "🧩", "🎯", "⚙️"];

type Raw = Record<string, unknown>;
type Fail = (message: string, at?: Path) => never;

/**
 * A loaded pipeline file into a `PipelineSpec`: the checks the DSL cannot
 * make (ids, sessions, timeouts, the values of markers), the defaults, and
 * which prerequisites and variables each part reads.
 */
export class PipelineBuilder {
  private readonly reads: InputRead[] = [];
  private readonly markers = new Map<string, Marked>();
  private prerequisites: Record<string, GateSpec> = {};

  constructor(
    private readonly document: Document,
    private readonly text: string,
    private readonly name: string | undefined,
    private readonly fail: Fail,
  ) {}

  build(): PipelineDefinition {
    const data = this.document.data as Raw;
    const secrets = new Set(this.document.variables.filter((variable) => variable.secret).map((variable) => variable.name));
    const raw = PipelineBuilder.isRecord(data.prerequisites) ? data.prerequisites : {};
    for (const [name, gate] of Object.entries(raw)) this.prerequisites[name] = this.gate(name, gate, secrets);
    for (const gate of Object.values(this.prerequisites)) gate.needs = gate.needs.filter((name) => name in this.prerequisites);

    if (!Array.isArray(data.stages) || data.stages.length === 0) this.fail("stages must be a non-empty list", ["stages"]);
    const stages = (data.stages as unknown[]).map((value, index) => {
      if (!PipelineBuilder.isRecord(value)) return this.fail(`stage ${index + 1} must be a mapping`, ["stages", index]);
      return this.stage(value, index);
    });
    const ids = new Set<string>();
    for (const stage of stages) {
      if (ids.has(stage.id)) this.fail(`two stages are called "${stage.id}"`, ["stages", stage.id, "id"]);
      ids.add(stage.id);
    }

    const when = this.condition(data.when, "when", ["when"]);
    const spec: PipelineSpec = {
      name: this.plain(data.name, "name", ["name"]) ?? this.name ?? "pipeline",
      description: this.plain(data.description, "description", ["description"]) ?? "",
      target: this.plain(data.target, "target", ["target"]),
      summary: this.written(data.summary, "summary", ["summary"]),
      env: this.values(data.env, "env"),
      packages: this.values(data.packages, "packages"),
      prerequisites: this.prerequisites,
      when: when.names,
      stages,
    };
    if (when.formula !== undefined) spec.condition = when.formula;
    return new PipelineDefinition(spec, this.text, this.reads, this.document, this.markers);
  }

  private gate(name: string, value: unknown, secrets: Set<string>): GateSpec {
    const at: Path = ["prerequisites", name];
    const where = `prerequisite "${name}"`;
    if (!/^[a-z][a-z0-9_]*$/.test(name)) this.fail(`${where}: a name is lowercase words joined by underscores, like ${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, at);
    const gate = value as Raw;
    const check = gate.$value;
    const spec: GateSpec = { message: this.plain(gate.message, `${where} message`, [...at, "message"]) ?? "", env: [], needs: [], secret: false };
    if (check instanceof Expression) {
      spec.formula = check.source;
      for (const read of check.reads) this.read(read, "prerequisite", (variable) => spec.env.push(variable), (other) => spec.needs.push(other));
    } else if (check instanceof ShellMarker) {
      spec.run = this.plain(check.command, `${where} $value!sh`, [...at, "$value"]) ?? "";
      this.shell(spec.run, "run");
    } else if (check instanceof FileMarker) {
      spec.file = this.list(check.paths, `${where} $value!file`, [...at, "$value"]);
    } else if (check instanceof ChangesMarker) {
      spec.changes = this.changes(check.rule, where, [...at, "$value"]);
    } else {
      this.fail(`${where}: $value is a formula ($value!:) or a check ($value!sh:, $value!file:, $value!changes:)`, [...at, "$value"]);
    }
    if (check instanceof Marked) this.markers.set(name, check);
    spec.env = [...new Set(spec.env)];
    spec.secret = spec.env.some((variable) => secrets.has(variable));
    return spec;
  }

  private changes(value: unknown, where: string, at: Path): ChangesSpec {
    if (!PipelineBuilder.isRecord(value)) return this.fail(`${where} changes must be a mapping`, at);
    for (const key of Object.keys(value)) if (!CHANGES_KEYS.includes(key)) this.fail(`${where} changes has an unknown key "${key}"`, [...at, key]);
    const rule: ChangesSpec = {};
    if (value.paths !== undefined) rule.paths = this.list(value.paths, `${where} paths`, [...at, "paths"]);
    if (value.ignore !== undefined) rule.ignore = this.list(value.ignore, `${where} ignore`, [...at, "ignore"]);
    if (value.min_files !== undefined) {
      if (!Number.isInteger(value.min_files) || (value.min_files as number) < 1) this.fail(`${where} min_files must be a whole number above 0`, [...at, "min_files"]);
      rule.min_files = value.min_files as number;
    }
    return rule;
  }

  private stage(value: Raw, index: number): StageSpec {
    const id = value.id;
    if (typeof id !== "string" || !PipelineBuilder.isSlug(id)) {
      return this.fail(`stage ${index + 1} needs an id of lowercase words joined by dashes`, ["stages", index, "id"]);
    }
    const at: Path = ["stages", id];
    const where = `stage "${id}"`;
    if (RESERVED_IDS.includes(id)) this.fail(`${where}: "${id}" is reserved`, [...at, "id"]);
    if ((value.task === undefined) === (value.run === undefined)) this.fail(`${where} needs exactly one of task or run!sh`, at);
    if (value.each_line !== undefined && value.each_file !== undefined) this.fail(`${where} can loop over each_line or each_file, not both`, at);

    const when = this.condition(value.when, `${where} when`, [...at, "when"], id);
    const stage: StageSpec = {
      id,
      title: this.plain(value.title, `${where} title`, [...at, "title"]) || PipelineBuilder.titleOf(id),
      emoji: this.plain(value.emoji, `${where} emoji`, [...at, "emoji"]) || PipelineBuilder.emojiOf(id),
      inputs: this.list(value.inputs, `${where} inputs`, [...at, "inputs"]),
      outputs: this.list(value.outputs, `${where} outputs`, [...at, "outputs"]),
      when: when.names,
      stopOn: this.list(value.stopOn, `${where} stopOn`, [...at, "stopOn"]) as StopOn[],
      optional: false,
    };
    if (when.formula !== undefined) stage.condition = when.formula;
    if (value.optional !== undefined) {
      if (typeof value.optional !== "boolean") this.fail(`${where} optional must be true or false`, [...at, "optional"]);
      stage.optional = value.optional;
    }
    // A failed stage stops the pipeline, unless it is optional or says to go on.
    const goesOn = stage.optional || value.continueOn === "fail";
    if (goesOn && stage.stopOn.includes("fail")) this.fail(`${where} cannot both stop and go on after a fail`, [...at, "stopOn"]);
    if (!goesOn && !stage.stopOn.includes("fail")) stage.stopOn = ["fail", ...stage.stopOn];

    if (value.task !== undefined) stage.task = this.written(value.task, `${where} task`, [...at, "task"], "task");
    if (value.run !== undefined) {
      if (!(value.run instanceof ShellMarker)) this.fail(`${where} run is a shell command: run!sh: <command>`, [...at, "run"]);
      stage.run = this.plain(value.run.command, `${where} run!sh`, [...at, "run"]) ?? "";
      this.shell(stage.run, "run");
    }
    if (value.session !== undefined) {
      const session = this.plain(value.session, `${where} session`, [...at, "session"]);
      if (!session || !PipelineBuilder.isSlug(session)) this.fail(`${where} session must be lowercase words joined by dashes`, [...at, "session"]);
      stage.session = session;
    }
    if (value.each_line !== undefined) stage.each_line = this.plain(value.each_line, `${where} each_line`, [...at, "each_line"]);
    if (value.each_file !== undefined) stage.each_file = this.plain(value.each_file, `${where} each_file`, [...at, "each_file"]);
    if (value.timeout !== undefined) {
      if (!Duration.ms(value.timeout)) this.fail(`${where} timeout must look like 90s, 30m or 1h`, [...at, "timeout"]);
      stage.timeout = value.timeout as string | number;
    }
    return stage;
  }

  /** A `when!` formula, and the prerequisites it reads: directly, and through the prerequisites it reads. */
  private condition(value: unknown, what: string, at: Path, stage?: string): { formula?: string; names: string[] } {
    if (value === undefined || value === null) return { names: [] };
    if (!(value instanceof Expression)) return this.fail(`${what} is a formula: when!: prerequisites.a and prerequisites.b`, at);
    const direct: string[] = [];
    const reads = this.reads.length;
    for (const read of value.reads) this.read(read, "when", () => {}, (name) => direct.push(name));
    if (stage !== undefined) for (const read of this.reads.slice(reads)) read.stage = stage;
    const names: string[] = [];
    const add = (name: string) => {
      if (names.includes(name) || !(name in this.prerequisites)) return;
      names.push(name);
      for (const other of this.prerequisites[name]!.needs) add(other);
    };
    for (const name of direct) add(name);
    return { formula: value.source, names };
  }

  /** A formula's read: `vars.NAME` is an input, `prerequisites.name` another prerequisite. */
  private read(read: string, use: InputRead["use"], variable: (name: string) => void, prerequisite: (name: string) => void, within?: string): void {
    const [head, name] = read.split(".");
    if (head === "vars" && name) {
      variable(name);
      this.reads.push(within === undefined ? { name, use } : { name, use, within });
    } else if (head === "prerequisites" && name) {
      prerequisite(name);
    } else if (head && !name && head in this.prerequisites) {
      prerequisite(head);
    }
  }

  private shell(command: string, use: InputRead["use"]): void {
    for (const reference of Variables.shellReferences(command)) this.reads.push({ ...reference, use });
  }

  /** `env` and `packages`: text, or a formula, kept as written. */
  private values(value: unknown, key: "env" | "packages"): Record<string, string> {
    if (value === undefined || value === null) return {};
    if (!PipelineBuilder.isRecord(value)) return this.fail(`${key} must be a mapping`, [key]);
    const map: Record<string, string> = {};
    for (const [name, item] of Object.entries(value)) {
      if (item instanceof Expression) {
        map[name] = item.source;
        for (const read of item.reads) this.read(read, key, () => {}, () => {}, key === "env" ? name : undefined);
      } else if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        map[name] = String(item);
      } else {
        this.fail(`${key}.${name} must be text or a formula`, [key, name]);
      }
    }
    return map;
  }

  /** Text that may hold `{{ }}`, as written. */
  private written(value: unknown, what: string, at: Path, use: InputRead["use"] = "summary"): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (value instanceof Expression) {
      for (const read of value.reads) this.read(read, use, () => {}, () => {});
      return value.source;
    }
    return this.plain(value, what, at);
  }

  private plain(value: unknown, what: string, at: Path): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (value instanceof Expression) return this.fail(`${what} is plain text: no formula, no {{ }}`, at);
    if (typeof value !== "string") return this.fail(`${what} must be text`, at);
    return value;
  }

  private list(value: unknown, what: string, at: Path): string[] {
    if (value === undefined || value === null) return [];
    if (typeof value === "string") return [value];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return this.fail(`${what} must be a list of plain text`, at);
    return value as string[];
  }

  private static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Expression) && !(value instanceof Marked);
  }

  // `browser-testing` reads as "Browser testing".
  private static titleOf(id: string): string {
    const words = id.split("-").join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  // Picked from the id, so a stage keeps its emoji across runs.
  private static emojiOf(id: string): string {
    const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
    return STAGE_EMOJIS[sum % STAGE_EMOJIS.length]!;
  }

  private static isSlug(value: string): boolean {
    if (!value || value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
    return [...value].every((char) => (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-");
  }
}

import { isMap, isScalar, isSeq, LineCounter, parseDocument, stringify, type Document, type Node } from "yaml";

import { UsageError } from "../usage-error.js";
import { Field, Slug, type Path, type Raw, type Scope } from "./field.js";
import { Overlay } from "./overlay.js";
import { PipelineError } from "./pipeline-error.js";
import { GATE, PIPELINE, STAGE, type GateSpec, type PipelineSpec, type StageSpec } from "./spec.js";
import { Variables } from "./variables.js";

/** `pipeline.json` and the summary's own files live beside the stages' files. */
const RESERVED_IDS = ["pipeline", "summary"];
const STAGE_EMOJIS = ["🔹", "🔸", "🧪", "🔍", "🛠️", "📋", "🚀", "🧭", "📦", "🧩", "🎯", "⚙️"];

/** The text of the pipeline `extends` names, or undefined when there is none. */
export type ExtendsResolver = (name: string) => string | undefined;

export interface PipelineSourceOptions {
  /** The default for `name:`. The CLI passes the file's base name. */
  name?: string;
  resolve?: ExtendsResolver;
}

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
    const raw = PipelineSource.valueOf(document);
    if (!Field.isRecord(raw)) return this.fail("a pipeline is a YAML mapping");
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
    const { name = this.options.name ?? "pipeline", description = "", ...top } = PIPELINE.read(raw, this.scope("", [], "pipeline"));
    this.stages = top.stages;

    const prerequisites: Record<string, GateSpec> = {};
    for (const [gate, value] of Object.entries(top.prerequisites)) prerequisites[gate] = this.gate(gate, value);
    const stages = top.stages.map((value, index) => this.stage(value, index));

    const spec: PipelineSpec = { name, description, ...top, prerequisites, stages };
    this.checkReferences(spec);
    this.checkFilters(spec);
    return spec;
  }

  private gate(name: string, value: unknown): GateSpec {
    const at: Path = ["prerequisites", name];
    const where = `prerequisite "${name}"`;
    if (!Field.isRecord(value)) return this.fail(`${where} must be a mapping`, at);
    const { message, ...checks } = GATE.read(value, this.scope(where, at));
    if (!message) return this.fail(`${where} needs a message`, at);
    const gate: GateSpec = { message, ...checks };
    if (!gate.env && !gate.file && !gate.run && !gate.changes) {
      return this.fail(`${where} needs a check: env, file, run or changes`, at);
    }
    if (gate.secret && !gate.env?.length) return this.fail(`${where} secret hides env variables, and it has none`, [...at, "secret"]);
    return gate;
  }

  private stage(value: unknown, index: number): StageSpec {
    const at: Path = ["stages", index];
    if (!Field.isRecord(value)) return this.fail(`stage ${index + 1} must be a mapping`, at);
    const id = value.id;
    if (!Slug.is(id)) return this.fail(`stage ${index + 1} needs an id of lowercase words joined by dashes`, [...at, "id"]);
    const where = `stage "${id}"`;
    const { continueOn, title, emoji, optional = false, ...own } = STAGE.read(value, this.scope(where, at));
    if (RESERVED_IDS.includes(id)) this.fail(`${where}: "${id}" is reserved`, [...at, "id"]);
    if ((value.task === undefined) === (value.run === undefined)) this.fail(`${where} needs exactly one of task or run`, at);
    if (value.each_line !== undefined && value.each_file !== undefined) {
      this.fail(`${where} can loop over each_line or each_file, not both`, at);
    }

    const stage: StageSpec = { ...own, id, title: title || PipelineSource.titleOf(id), emoji: emoji || PipelineSource.emojiOf(id), optional };
    // A failed stage stops the pipeline, unless it is optional or says to go on.
    const goesOn = optional || continueOn.includes("fail");
    if (goesOn && stage.stopOn.includes("fail")) this.fail(`${where} cannot both stop and go on after a fail`, [...at, "stopOn"]);
    if (!goesOn && !stage.stopOn.includes("fail")) stage.stopOn = ["fail", ...stage.stopOn];
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
    const texts = PIPELINE.texts(spec);
    for (const { text, expands, what, at } of texts) {
      if (expands === "shell" && Variables.filtered(text)) {
        this.fail(`${what}: a shell command cannot use filters. Set a variable in env and use that`, at);
      }
    }
    for (const { text, expands, what, at } of texts) {
      if (expands === "shell") continue;
      const problem = Variables.problem(text);
      if (problem) this.fail(`${what}: ${problem}`, at);
    }
  }

  /** Where a `Shape` reads from, and how its mistakes are reported. */
  private scope(where: string, path: Path, named?: string): Scope {
    return { where, path, named, fail: (message, at) => this.fail(message, at) };
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
    const id = Field.isRecord(stage) ? stage.id : undefined;
    if (typeof id !== "string") return this.document?.has("extends") ? undefined : items[index];
    return items.find((item) => isMap(item) && item.get("id") === id);
  }

  // Text that parses can still have no value: an alias to an anchor that is not there.
  private static valueOf(document: Document): unknown {
    try {
      return document.toJS();
    } catch (err) {
      throw new PipelineError(err instanceof Error ? err.message : String(err));
    }
  }

  private static keyOf(at: Path): string {
    return at.map((segment, index) => (typeof segment === "number" ? `[${segment}]` : index ? `.${segment}` : segment)).join("");
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
}

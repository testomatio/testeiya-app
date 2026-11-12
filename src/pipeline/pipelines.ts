import { BUNDLED_PIPELINES } from "./bundled.js";
import { PipelineDocument } from "./pipeline-document.js";
import { PipelineError } from "./pipeline-error.js";
import { PipelineSource } from "./pipeline-source.js";

/** One line of `Pipelines.list()`. */
export interface PipelineSummary {
  /** What `open` and `extends:` take. */
  name: string;
  description: string;
  /** What starts it: one of `PIPELINE_TARGETS`, or free text. */
  target?: string;
  /** It ships with testeiya. False for one of your own, also when it has a bundled pipeline's name. */
  bundled: boolean;
  /** False when it has errors. Its description is then empty. */
  valid: boolean;
}

export interface ParseOptions {
  /** The pipeline's name when the YAML has no `name:`. It is also the name it is saved under in your own pipelines. */
  name?: string;
}

/**
 * The pipelines a pipeline can be opened from and can `extends:`: the ones
 * bundled with testeiya, and your own, as name to YAML. Your own win over a
 * bundled pipeline of the same name. It reads no file, so it works in a Worker
 * and a browser.
 */
export class Pipelines {
  private readonly own: Record<string, string>;

  /** `own` is your saved pipelines, name to YAML. Without it there are only the bundled ones. */
  constructor(own: Record<string, string> = {}) {
    this.own = { ...own };
  }

  /** Every name `open` takes, sorted. */
  names(): string[] {
    return [...new Set([...Object.keys(BUNDLED_PIPELINES), ...Object.keys(this.own)])].sort();
  }

  has(name: string): boolean {
    return this.isOwn(name) || Object.hasOwn(BUNDLED_PIPELINES, name);
  }

  /** Name, description and target of every pipeline, sorted by name. A broken one is listed with `valid: false`. */
  list(): PipelineSummary[] {
    return this.names().map((name) => {
      const pipeline = this.open(name);
      const summary: PipelineSummary = { name, description: "", bundled: !this.isOwn(name), valid: pipeline.isValid() };
      if (!summary.valid) return summary;
      const { description, target } = pipeline.describe();
      summary.description = description;
      if (target !== undefined) summary.target = target;
      return summary;
    });
  }

  /** A bundled pipeline, or one of your own, by name. */
  open(name: string): PipelineDocument {
    if (this.isOwn(name)) return this.parse(this.own[name], { name });
    if (!Object.hasOwn(BUNDLED_PIPELINES, name)) throw new PipelineError(`no pipeline "${name}"`);
    return this.document(BUNDLED_PIPELINES[name], name, [`bundled:${name}`]);
  }

  /** A pipeline from YAML text, such as an editor's. It never throws: ask the pipeline for its `errors()`. */
  parse(yaml: string, options: ParseOptions = {}): PipelineDocument {
    return this.document(yaml, options.name, options.name === undefined ? [] : [`own:${options.name}`]);
  }

  private document(yaml: string, name: string | undefined, chain: string[]): PipelineDocument {
    return new PipelineDocument(yaml, new PipelineSource(yaml, { name, resolve: (parent) => this.parent(parent, name, chain) }));
  }

  /**
   * The YAML that `extends: name` stands for, with its own `extends` applied.
   * `child` is the pipeline asking: its own name means the bundled pipeline,
   * so your `regression` can extend the bundled `regression`.
   */
  private parent(name: string, child: string | undefined, chain: string[]): string | undefined {
    const own = name !== child && this.isOwn(name);
    if (!own && !Object.hasOwn(BUNDLED_PIPELINES, name)) return undefined;
    const key = `${own ? "own" : "bundled"}:${name}`;
    if (chain.includes(key)) throw new PipelineError(`extends ${name} loops back to itself`, { key: "extends" });
    const text = own ? this.own[name] : BUNDLED_PIPELINES[name];
    try {
      // Not validated: a parent can be a partial file that only its children complete.
      return new PipelineSource(text, { resolve: (parent) => this.parent(parent, name, [...chain, key]) }).text();
    } catch (err) {
      // The parent's lines are not the child's.
      if (err instanceof PipelineError) throw new PipelineError(`extends ${name}: ${err.message}`, { key: "extends" });
      throw err;
    }
  }

  private isOwn(name: string): boolean {
    return Object.hasOwn(this.own, name);
  }
}

import { BUNDLED_PIPELINES } from "./bundled.js";
import { Pipeline } from "./pipeline-document.js";
import { PipelineError } from "./pipeline-error.js";
import { PipelineSource } from "./pipeline-source.js";

/** One line of `Pipelines.list()`. */
export interface PipelineSummary {
  /** What `open` and `$extends:` take. */
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
  /**
   * The name it is saved under in your own pipelines. It becomes the pipeline's
   * name when the YAML has no `name:` and the pipeline it extends has none.
   */
  name?: string;
}

/**
 * The pipelines a pipeline can be opened from and can `$extends`: the ones
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
  open(name: string): Pipeline {
    if (this.isOwn(name)) return this.parse(this.own[name], { name });
    if (!Object.hasOwn(BUNDLED_PIPELINES, name)) throw new PipelineError(`no pipeline "${name}"`);
    return this.document(BUNDLED_PIPELINES[name], name, `bundled/${name}.yml`);
  }

  /** A pipeline from YAML text, such as an editor's. It never throws: ask the pipeline for its `errors()`. */
  parse(yaml: string, options: ParseOptions = {}): Pipeline {
    return this.document(yaml, options.name, options.name === undefined ? "(pipeline)" : `own/${options.name}.yml`);
  }

  private document(yaml: string, name: string | undefined, file: string): Pipeline {
    return new Pipeline(yaml, new PipelineSource(yaml, { name, file, read: (path, from) => this.read(path, from) }));
  }

  /**
   * The text that `$extends: name` stands for. A pipeline's own name means the
   * bundled one, so your `regression` can extend the bundled `regression`.
   * scripted-yaml applies the parent's own `$extends` and finds a loop.
   */
  private read(path: string, from: string): { file: string; text: string } | undefined {
    const name = path.replace(/^\.\//, "").replace(/\.ya?ml$/, "");
    const own = this.isOwn(name) && from !== `own/${name}.yml`;
    if (own) return { file: `own/${name}.yml`, text: this.own[name] };
    if (Object.hasOwn(BUNDLED_PIPELINES, name)) return { file: `bundled/${name}.yml`, text: BUNDLED_PIPELINES[name] };
    // There is no disk to look on.
    throw new PipelineError(`no pipeline "${name}" to extend`);
  }

  private isOwn(name: string): boolean {
    return Object.hasOwn(this.own, name);
  }
}

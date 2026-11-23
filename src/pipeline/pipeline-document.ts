import { UsageError } from "../usage-error.js";
import { Override } from "./override.js";
import { PipelineDescriber } from "./pipeline-describer.js";
import { PipelineError, PipelineErrors } from "./pipeline-error.js";
import { PipelineSource } from "./pipeline-source.js";
import type { PipelineDescription, PipelineInput, PipelineSpec, PrerequisiteView, StageView } from "./spec.js";

/** Builds an override from its YAML. It throws when the YAML is not a patch. */
type Change = () => Override;

/** A checked pipeline, or the mistake that stops it. */
type Outcome = { spec: PipelineSpec; description: PipelineDescription; yaml: string } | { error: PipelineError };

/**
 * One pipeline as text, opened or parsed by `Pipelines`. It never throws while
 * it is made: `errors()` and `isValid()` answer for any text, so an editor
 * checks on every keystroke. The methods that read a pipeline throw the
 * `PipelineError` when there is one.
 *
 * This is the `Pipeline` of `testeiya/pipeline`. The CLI's runner in
 * `pipeline.ts` has the same name and is not exported from the package.
 */
export class Pipeline {
  private outcome?: Outcome;

  /** `Pipelines` makes these: call `pipelines.open(name)` or `pipelines.parse(yaml)`. */
  constructor(
    /** The YAML as it was given, before `$extends` and overrides. */
    readonly source: string,
    private readonly parser: PipelineSource,
    private readonly overrides: Change[] = [],
  ) {}

  /** Nothing stops this pipeline from running. */
  isValid(): boolean {
    return this.errors().length === 0;
  }

  /**
   * What is wrong, for an editor: each error has `message`, and `line` and
   * `key` when the problem has a place in the text. It is empty for a valid
   * pipeline. It holds every problem scripted-yaml found; a check of the
   * runner's own, like a duplicate stage id, stops at the first.
   */
  errors(): PipelineError[] {
    const outcome = this.check();
    if (!("error" in outcome)) return [];
    return outcome.error instanceof PipelineErrors ? outcome.error.errors : [outcome.error];
  }

  /** Name, description, target, stages, prerequisites and inputs in one plain object, ready for JSON. */
  describe(): PipelineDescription {
    return this.checked().description;
  }

  /** The stages in the order they run, for a stage view. */
  stages(): StageView[] {
    return this.describe().stages;
  }

  /** Every variable a user can set, for a form: required first, then the ones that unlock stages, then the rest. */
  inputs(): PipelineInput[] {
    return this.describe().inputs;
  }

  /** The named checks, and the stages that need each. */
  prerequisites(): PrerequisiteView[] {
    return this.describe().prerequisites;
  }

  /** One self-contained YAML file, with `$extends` and overrides applied: write it to disk and run it. */
  yaml(): string {
    return this.checked().yaml;
  }

  /** The pipeline key for key, with every default filled in. */
  spec(): PipelineSpec {
    return this.checked().spec;
  }

  /** A copy patched as `--pipeline YAML` does: `$replace`, `$add`, `$before`, `$after`, `$remove`. */
  override(yaml: string): Pipeline {
    return this.with(() => Override.pipeline(yaml));
  }

  /** A copy with one stage patched, as `--stage ID:YAML` does. */
  overrideStage(id: string, yaml: string): Pipeline {
    return this.with(() => Override.stage(`${id}:${yaml}`));
  }

  private with(override: Change): Pipeline {
    return new Pipeline(this.source, this.parser, [...this.overrides, override]);
  }

  private checked(): Exclude<Outcome, { error: PipelineError }> {
    const outcome = this.check();
    if ("error" in outcome) throw outcome.error;
    return outcome;
  }

  private check(): Outcome {
    if (this.outcome) return this.outcome;
    try {
      const definition = this.parser.definition(this.overrides.map((override) => override()));
      const description = new PipelineDescriber(definition).describe();
      this.outcome = { spec: definition.spec, description, yaml: definition.text };
    } catch (err) {
      if (!(err instanceof UsageError)) throw err;
      this.outcome = { error: err instanceof PipelineError ? err : new PipelineError(err.message) };
    }
    return this.outcome;
  }
}

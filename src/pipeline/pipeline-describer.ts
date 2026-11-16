import { PIPELINE, type InputUse, type PipelineDescription, type PipelineInput, type PipelineSpec, type PrerequisiteView, type StageSpec, type StageView } from "./spec.js";
import { BUILTIN_VARIABLES, Variables, type Reference } from "./variables.js";

/** Set by the shell or the machine, never asked of a user. */
const SHELL_VARIABLES = ["HOME", "PATH", "PWD", "USER", "SHELL", "TMPDIR"];

/**
 * A validated pipeline as a UI shows it. The inputs are every variable a user
 * can set, read from the file: prerequisite `env` lists first, then the
 * `${NAME}` the runner expands and the `$NAME` the shell reads.
 */
export class PipelineDescriber {
  private readonly found = new Map<string, PipelineInput>();

  constructor(private readonly spec: PipelineSpec) {}

  describe(): PipelineDescription {
    const { spec } = this;
    const description: PipelineDescription = {
      name: spec.name,
      description: spec.description,
      stages: spec.stages.map((stage) => this.stage(stage)),
      prerequisites: Object.keys(spec.prerequisites).map((name) => this.prerequisite(name)),
      inputs: this.inputs(),
    };
    if (spec.target !== undefined) description.target = spec.target;
    if (spec.summary !== undefined) description.summary = spec.summary;
    return description;
  }

  private stage(spec: StageSpec): StageView {
    const { task, run, each_line, each_file, ...own } = spec;
    const view: StageView = { ...own, kind: run !== undefined ? "run" : "task", text: run ?? task ?? "" };
    if (each_line !== undefined) view.loop = { each_line };
    if (each_file !== undefined) view.loop = { each_file };
    return view;
  }

  private prerequisite(name: string): PrerequisiteView {
    const gate = this.spec.prerequisites[name];
    const stages = this.spec.stages.filter((stage) => stage.when.includes(name)).map((stage) => stage.id);
    let scope: PrerequisiteView["scope"] = "unused";
    if (stages.length) scope = "stages";
    if (this.spec.when.includes(name)) scope = "run";
    const checks: PrerequisiteView["checks"] = [];
    if (gate.file) checks.push("file");
    if (gate.run) checks.push("run");
    if (gate.changes) checks.push("changes");
    return { name, message: gate.message, scope, stages, env: gate.env ?? [], checks, secret: gate.secret ?? false };
  }

  /** Required first, then the ones that unlock stages, in stage order, then the rest by name. */
  private inputs(): PipelineInput[] {
    this.collect();
    const ids = this.spec.stages.map((stage) => stage.id);
    const first = (input: PipelineInput) => ids.indexOf(input.unlocks[0]);
    const inputs = [...this.found.values()];
    return [
      ...inputs.filter((input) => input.required),
      ...inputs.filter((input) => !input.required && input.unlocks.length).sort((a, b) => first(a) - first(b)),
      ...inputs.filter((input) => !input.required && !input.unlocks.length).sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }

  private collect(): void {
    const { spec } = this;
    for (const gate of Object.values(spec.prerequisites)) {
      for (const variable of gate.env ?? []) this.add({ name: variable }, "prerequisite");
    }
    for (const text of PIPELINE.texts(spec)) {
      // The use is the key that holds the text, and each of those keys is an `InputUse`.
      const use = text.use as InputUse;
      const within = use === "env" ? text.key : undefined;
      for (const reference of Variables.referencesIn(text.text, text.expands)) this.add(reference, use, within);
    }
  }

  /** `within` is the `env:` key whose value this is: reading its own name makes it an input. */
  private add(reference: Reference, use: InputUse, within?: string): void {
    const { name } = reference;
    if (!this.isInput(name, within)) return;
    let input = this.found.get(name);
    if (!input) {
      input = this.input(name);
      this.found.set(name, input);
    }
    if (!input.usedIn.includes(use)) input.usedIn.push(use);
    // A default that reads another variable is the shell's to work out.
    const fallback = reference.default;
    if (input.default === undefined && fallback !== undefined && !fallback.includes("$")) input.default = fallback;
  }

  private isInput(name: string, within?: string): boolean {
    if ((BUILTIN_VARIABLES as readonly string[]).includes(name) || SHELL_VARIABLES.includes(name)) return false;
    if (name in this.spec.env) return name === within || this.found.has(name);
    return true;
  }

  private input(name: string): PipelineInput {
    const { spec } = this;
    const asking = Object.entries(spec.prerequisites).filter(([, gate]) => gate.env?.includes(name));
    const required = asking.filter(([gate]) => spec.when.includes(gate));
    const unlocking = asking.filter(([gate]) => !spec.when.includes(gate)).map(([gate]) => gate);
    const unlocks = required.length
      ? []
      : spec.stages.filter((stage) => stage.when.some((gate) => unlocking.includes(gate))).map((stage) => stage.id);
    const input: PipelineInput = {
      name,
      required: required.length > 0,
      prerequisites: asking.map(([gate]) => gate),
      unlocks,
      usedIn: [],
      secret: asking.some(([, gate]) => gate.secret),
    };
    const message = (required[0] ?? asking[0])?.[1].message;
    if (message !== undefined) input.message = message;
    return input;
  }
}

import type { InputUse, PipelineDescription, PipelineInput, PipelineSpec, PrerequisiteView, StageView } from "./spec.js";
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

  private stage(spec: PipelineSpec["stages"][number]): StageView {
    const view: StageView = {
      id: spec.id,
      title: spec.title,
      emoji: spec.emoji,
      kind: spec.run !== undefined ? "run" : "task",
      text: spec.run ?? spec.task ?? "",
      when: spec.when,
      inputs: spec.inputs,
      outputs: spec.outputs,
      stopOn: spec.stopOn,
    };
    if (spec.session !== undefined) view.session = spec.session;
    if (spec.each_line !== undefined) view.loop = { each_line: spec.each_line };
    if (spec.each_file !== undefined) view.loop = { each_file: spec.each_file };
    if (spec.timeout !== undefined) view.timeout = spec.timeout;
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
    for (const [name, gate] of Object.entries(spec.prerequisites)) {
      for (const variable of gate.env ?? []) this.add({ name: variable }, "prerequisite");
    }
    for (const [key, value] of Object.entries(spec.env)) {
      for (const reference of Variables.references(value)) this.add(reference, "env", key);
    }
    for (const version of Object.values(spec.packages)) this.addAll(Variables.references(version), "packages");
    for (const gate of Object.values(spec.prerequisites)) {
      for (const file of gate.file ?? []) this.addAll(Variables.references(file), "file");
      if (gate.run) this.addAll(Variables.shellReferences(gate.run), "run");
    }
    for (const stage of spec.stages) {
      if (stage.task) this.addAll(Variables.references(stage.task), "task");
      if (stage.run) this.addAll(Variables.shellReferences(stage.run), "run");
      for (const output of stage.outputs) this.addAll(Variables.references(output), "outputs");
    }
  }

  private addAll(references: Reference[], use: InputUse): void {
    for (const reference of references) this.add(reference, use);
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

import type { DeclaredVariable, InputRead, PipelineDefinition } from "./pipeline-definition.js";
import type { InputUse, PipelineDescription, PipelineInput, PipelineSpec, PrerequisiteView, StageView } from "./spec.js";
import { BUILTIN_VARIABLES } from "./variables.js";

/** Set by the shell or the machine, never asked of a user. */
const SHELL_VARIABLES = ["HOME", "PATH", "PWD", "USER", "SHELL", "TMPDIR"];

/**
 * A validated pipeline as a UI shows it. The inputs are every variable a user
 * can set: the `vars.NAME` its formulas and `{{ }}` read, the `$NAME` its
 * shell commands read, and what `$vars` declares.
 */
export class PipelineDescriber {
  private readonly found = new Map<string, PipelineInput>();
  private readonly spec: PipelineSpec;
  private readonly declared: Map<string, DeclaredVariable>;

  constructor(private readonly definition: PipelineDefinition) {
    this.spec = definition.spec;
    this.declared = new Map(definition.variables().map((variable) => [variable.name, variable]));
  }

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
      optional: spec.optional,
    };
    if (spec.condition !== undefined) view.condition = spec.condition;
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
    return { name, message: gate.message, scope, stages, env: gate.env, checks, secret: gate.secret };
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
    for (const read of this.definition.reads) this.add(read, read.use, read.within);
    for (const name of this.declared.keys()) this.add({ name }, undefined);
  }

  /** `within` is the `env:` key whose value this is: reading its own name makes it an input. No `use`: declared, not read. */
  private add(read: Pick<InputRead, "name" | "default">, use: InputUse | undefined, within?: string): void {
    const { name } = read;
    if (!this.isInput(name, within)) return;
    let input = this.found.get(name);
    if (!input) {
      input = this.input(name);
      this.found.set(name, input);
    }
    if (use && !input.usedIn.includes(use)) input.usedIn.push(use);
    // A default that reads another variable is the shell's to work out.
    const fallback = read.default;
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
    const whens = this.definition.reads.filter((read) => read.name === name && read.use === "when");
    const unlocking = asking.filter(([gate]) => !spec.when.includes(gate)).map(([gate]) => gate);
    const declared = this.declared.get(name);
    const isRequired = required.length > 0 || whens.some((read) => read.stage === undefined) || Boolean(declared?.required);
    const unlocks = isRequired
      ? []
      : spec.stages
          .filter((stage) => stage.when.some((gate) => unlocking.includes(gate)) || whens.some((read) => read.stage === stage.id))
          .map((stage) => stage.id);
    const input: PipelineInput = {
      name,
      required: isRequired,
      prerequisites: asking.map(([gate]) => gate),
      unlocks,
      usedIn: [],
      secret: declared?.secret ?? false,
    };
    if (declared?.default !== undefined) input.default = declared.default;
    const message = (required[0] ?? asking[0])?.[1].message ?? declared?.about;
    if (message !== undefined) input.message = message;
    return input;
  }
}

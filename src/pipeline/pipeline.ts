import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chalkStderr as c } from "chalk";

import { Git, type Changes } from "../git.js";
import { UsageError } from "../model.js";
import { Decider, type Decision, type DecisionRequest } from "../decision.js";
import { runTask, type TaskRunner } from "../run.js";
import { ExtractFields, type ExtractField } from "../extract-fields.js";
import { CommandStage } from "./command-stage.js";
import { DecideStage } from "./decide-stage.js";
import { CrashGuard } from "./crash-guard.js";
import { Diagram } from "./diagram.js";
import { ExtractStage } from "./extract-stage.js";
import { Gate, type Extractor, type GateContext } from "./gate.js";
import { Launcher } from "./launcher.js";
import { log } from "./log.js";
import { Override } from "./override.js";
import { Packages } from "./packages.js";
import type { PipelineDefinition, PipelineValues } from "./pipeline-definition.js";
import { PipelineFile } from "./pipeline-file.js";
import { InputValues } from "./input-values.js";
import { Report } from "./report.js";
import type { PipelineSpec, StageSpec } from "./spec.js";
import type { Stage, StageContext } from "./stage.js";
import { StageEnv } from "./stage-env.js";
import {
  CHANGES_FILE,
  COPY_FILE,
  LAST_DIR,
  PipelineState,
  type PipelineRecord,
  type StageRecord,
  type Status,
} from "./state.js";
import { SummaryStage } from "./summary-stage.js";
import { TaskStage } from "./task-stage.js";
import { Variables } from "./variables.js";

// A job-level reply, thread or session file belongs to a single task, never to
// every stage of a pipeline.
const JOB_ONLY = ["TESTEIYA_FOLLOW_UP", "TESTEIYA_THREAD", "TESTEIYA_SESSION_FILE"];

/**
 * One run of a pipeline file. It picks the round, makes the checks, computes
 * the formulas, runs the stages in order through one folder, then a summary
 * that is the only report.
 */
export class Pipeline {
  private readonly cwd = process.cwd();
  private readonly git = new Git(this.cwd);
  private readonly launcher = new Launcher(this.cwd);
  private readonly cli: string;
  private readonly runTask: TaskRunner;
  private readonly decide: DecideRunner;
  private readonly deciders = new Map<string, Promise<Decider>>();

  private readonly overrides: Override[];

  constructor(private readonly options: PipelineOptions) {
    this.cli = options.cli ?? fileURLToPath(new URL("../cli.js", import.meta.url));
    this.runTask = options.runTask ?? runTask;
    this.decide = options.decide ?? ((request, model) => this.decider(model).then((decider) => decider.decide(request)));
    // --pipeline first, so --stage can change a stage it adds.
    this.overrides = [...(options.pipelineOverrides ?? []).map(Override.pipeline), ...(options.stageOverrides ?? []).map(Override.stage)];
  }

  static list(json?: boolean): number {
    const pipelines = PipelineFile.bundled();
    if (json) {
      process.stdout.write(`${JSON.stringify({ pipelines }, null, 2)}\n`);
      return 0;
    }
    const targets = [...new Set(pipelines.map((pipeline) => pipeline.target ?? "other"))];
    for (const target of targets) {
      process.stdout.write(`\n  ${c.bold(target)}\n`);
      for (const pipeline of pipelines.filter((item) => (item.target ?? "other") === target)) {
        process.stdout.write(`    ${pipeline.name.padEnd(18)} ${c.dim(pipeline.description)}\n`);
      }
    }
    process.stdout.write('\n  Run one with:  testeiya pipeline <name>, or pass your own .yml\n\n');
    return 0;
  }

  async run(): Promise<number> {
    const { options, cwd } = this;
    const file = PipelineFile.find(options.name);
    const named = file.definition(this.overrides);
    const dir = this.folder(named.spec.name);
    if (dir === cwd || cwd.startsWith(dir + sep)) {
      throw new UsageError("--dir must be a folder of its own, not the checkout or a folder above it");
    }

    const previous = PipelineState.read(dir);
    const commit = await this.git.headCommit();
    const history = previous?.rounds ?? [];
    const retry = Boolean(previous && previous.commit === commit && PipelineState.STOPPED.includes(previous.status));
    const again = Boolean(previous && !retry && previous.status !== "skipped" && previous.commit === commit);

    const definition = this.definition(file, named, dir, retry);
    const { spec } = definition;
    const gates = this.gates(definition);
    const stages = this.stages(spec.stages);

    let round = history.length + 1;
    let since = history.at(-1)?.commit ?? null;
    if (retry || again) {
      round = previous!.round;
      since = previous!.since;
    }

    let aiProblem: string | null = null;
    if (this.needsAi(stages)) aiProblem = await this.aiProblem(stages);
    if (aiProblem && !options.dryRun) throw new UsageError(aiProblem);

    const base = await this.variables(definition, dir, round);
    let vars = this.withEnv(definition, base);
    const input = InputValues.read(options.inputs ?? [], vars.toEnv());
    const changes = await this.git.changes(since, vars.toEnv());
    const used = [...new Set([...spec.when, ...stages.flatMap((stage) => stage.spec.when), ...Object.keys(this.options.gates ?? {}), ...this.extracting(spec)])];
    let extract: Extractor | undefined;
    if (!options.dryRun) extract = this.extractor(vars);
    // The agent finds values only for a run that goes on, unless the top-level when reads them.
    const later = this.extracting(spec).filter((name) => !spec.when.includes(name));
    const made = await this.checkGates(gates, used.filter((name) => !later.includes(name)), { vars, changes, input, extract });
    let values = definition.values(this.withEnv(definition, base).toEnv());
    // In the order the file reads them, a check the runner made or a formula.
    const results = (): Map<string, boolean> => new Map(used.map((name) => [name, made.get(name) ?? values.passes(name)]));
    log.header(spec.name, round, changes, dir);
    if (!retry) log.overrides(this.overrides);

    const reason = this.blocked(spec, values, gates, results());
    if (!reason) {
      for (const [name, passed] of await this.checkGates(gates, later, { vars, changes, input, extract })) made.set(name, passed);
      // `env:` again: it may read what a `$value!extract` found.
      vars = this.withEnv(definition, base);
      values = definition.values(vars.toEnv());
      if (!options.dryRun) for (const name of this.extracting(spec)) log.extracted(name, gates.get(name)!.found, gates.get(name)!.message);
    }
    if (reason) {
      log.skipped(reason);
      if (options.dryRun) return 0;
      const state = new PipelineState(dir, { name: spec.name, round, commit, since, status: "skipped", reason, stages: [], rounds: history });
      state.save();
      if (options.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
      return 0;
    }

    // After the skip: a job gated on a pull request may name one that only exists when the gate passes.
    const report = await Report.prepare(options);
    if (options.dryRun) return this.dryRun(spec, gates, stages, values, results(), aiProblem);

    let created = previous?.created ?? [];
    mkdirSync(dir, { recursive: true });
    const stageVars = await new Packages(values.packages()).install(dir, this.launcher, vars);
    if (!retry) {
      // A new round moves what the last one wrote to .last, and keeps the sessions.
      rmSync(join(dir, LAST_DIR), { recursive: true, force: true });
      mkdirSync(join(dir, LAST_DIR));
      for (const name of created.filter((entry) => existsSync(join(dir, entry)))) renameSync(join(dir, name), join(dir, LAST_DIR, name));
      created = [];
      writeFileSync(join(dir, COPY_FILE), definition.text);
    }
    if (changes.files) writeFileSync(join(dir, CHANGES_FILE), `${changes.files.join("\n")}\n`);
    this.checkInputs(stages, dir);

    let kept: PipelineRecord | null = null;
    if (retry) kept = previous;
    const state = new PipelineState(dir, {
      name: spec.name,
      round,
      commit,
      since,
      status: "running",
      stages: stages.map((stage) => this.keptRecord(stage, kept)),
      rounds: history,
      created,
    });
    state.trackFiles();
    return this.runStages({ definition, spec, stages, values, state, vars: stageVars, report, dir });
  }

  /** Validates the file, then checks every prerequisite it declares. Runs no stage. */
  async check(): Promise<number> {
    const file = PipelineFile.find(this.options.name);
    const named = file.definition(this.overrides);
    const dir = this.folder(named.spec.name, false);
    const definition = this.definition(file, named, dir, false);
    const { spec } = definition;
    const gates = this.gates(definition);
    const stages = this.stages(spec.stages);
    this.checkInputs(stages, dir);
    log.valid(spec.name, file.path);
    log.overrides(this.overrides);
    await this.test(definition);

    let aiProblem: string | null = null;
    if (this.needsAi(stages)) aiProblem = await this.aiProblem(stages);
    const base = await this.variables(definition, dir, 1);
    let vars = this.withEnv(definition, base);
    const input = InputValues.read(this.options.inputs ?? [], vars.toEnv());
    const since = PipelineState.read(dir)?.rounds.at(-1)?.commit ?? null;
    const changes = await this.git.changes(since, vars.toEnv());
    const names = [...Object.keys(spec.prerequisites), ...Object.keys(this.options.gates ?? {})];
    // A check asks no agent: a value the input does not have is reported as not found.
    const made = await this.checkGates(gates, names, { vars, changes, input });
    vars = this.withEnv(definition, base);
    const values = definition.values(vars.toEnv());
    const results = new Map(names.map((name) => [name, made.get(name) ?? values.passes(name)]));

    const checked: Checked[] = names.map((name) => ({ name, passed: results.get(name)!, message: this.message(spec, gates, name) }));
    for (const gate of checked) {
      const pending = gates.get(gate.name)?.pending ?? [];
      if (pending.length) gate.pending = pending;
    }
    if (this.needsAi(stages)) checked.unshift({ name: "ai", passed: !aiProblem, message: aiProblem ?? "" });
    const failed = checked.filter((gate) => !gate.passed).length;
    if (this.options.json) {
      process.stdout.write(`${JSON.stringify({ name: spec.name, file: file.path, gates: checked }, null, 2)}\n`);
    }
    for (const gate of checked) {
      if (gate.pending) log.pending(gate.name, gate.pending);
      else log.gate(gate.name, gate.passed, gate.message);
    }
    if (this.options.diagram) {
      const passed = new Map(checked.map((gate) => [gate.name, gate.passed]));
      const path = resolve(`${spec.name}.diagram.md`);
      writeFileSync(path, new Diagram(spec, stages, passed).toMarkdown());
      log.note(c.dim(`\n  Diagram: ${path}`));
    }
    log.checked(failed);
    if (failed) return 1;
    return 0;
  }

  private async runStages(run: Run): Promise<number> {
    const { stages, state, values } = run;
    this.launcher.watchInterrupt();
    state.save();

    let stopped = false;
    for (const [index, stage] of stages.entries()) {
      const record = state.record.stages[index]!;
      if (record.status === "pass" || record.status === "fail") {
        log.stage(record, "kept from the last attempt");
        continue;
      }
      if (stopped) {
        record.status = "not-run";
        continue;
      }

      if (!values.stageRuns(stage.id)) {
        stage.skip(record, values.reason(stage.spec.when, stage.spec.condition));
        stopped = stage.stopsOn("gate");
        state.save();
        continue;
      }
      if ((stage instanceof CommandStage || stage instanceof DecideStage) && this.inputsSkipped(stage, run)) {
        stage.skip(record, "its inputs come from skipped stages");
        state.save();
        continue;
      }

      await stage.run(this.context(run, stages.length === 1), record);
      state.save();
      const status = record.status as Status;
      if (status === "interrupted") break;
      if ((status === "broken" || status === "timeout") && !stage.spec.optional) stopped = true;
      if (status === "fail" && stage.stopsOn("fail")) stopped = true;
    }

    if (this.launcher.interrupted) return this.interrupted(state);

    state.record.status = PipelineState.verdict(state.record.stages);
    state.save();
    if (stages.length > 1 && state.record.stages.some((record) => record.status !== "skipped" && record.status !== "not-run")) {
      await this.summarize(run);
      if (this.launcher.interrupted) return this.interrupted(state);
    }

    state.finishRound();
    state.save();
    if (this.options.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    if (state.record.status === "pass") return 0;
    if (state.record.status === "fail" && this.options.exitZero) return 0;
    return 1;
  }

  /** The summary reads every stage and writes the one report that is posted. */
  private async summarize(run: Run): Promise<void> {
    const { state } = run;
    const record: StageRecord = { id: "summary", status: "not-run" };
    state.record.stages.push(record);
    const summary = run.definition.values(run.vars.toEnv()).summary();
    await new SummaryStage(run.spec, summary, run.stages, run.state, run.dir).run(this.context(run, true), record);
    // The verdict came from the stages; the summary only explains it.
    if (record.status === "fail") {
      record.status = "pass";
      delete record.reason;
    }
    if (!this.launcher.interrupted) state.record.status = PipelineState.verdict(state.record.stages);
  }

  private context(run: Run, reporter: boolean): StageContext {
    let report: Report | null = null;
    if (reporter) report = run.report;
    return {
      dir: run.dir,
      vars: run.vars,
      launcher: this.launcher,
      cli: this.cli,
      runTask: this.runTask,
      decide: this.decide,
      guard: new CrashGuard((err) => this.crashed(run.state, err)),
      model: this.options.model,
      report,
      missing: (input) => this.whyMissing(input, run),
      task: (stage, vars) => run.definition.values(vars.toEnv()).task(stage.id),
      locate: (input, reader) => this.locate(input, reader, run),
    };
  }

  /** One decider per model, made the first time a stage asks. */
  private decider(model?: string): Promise<Decider> {
    const key = model ?? "";
    let decider = this.deciders.get(key);
    if (!decider) {
      decider = Decider.create(model);
      this.deciders.set(key, decider);
    }
    return decider;
  }

  /** The process is in an unknown state after an uncaught error: save what ran, stop. */
  private crashed(state: PipelineState, err: unknown): void {
    let message = String(err);
    if (err instanceof Error) message = err.message;
    for (const record of state.record.stages) {
      if (record.status !== "running") continue;
      record.status = "broken";
      record.reason = `crashed: ${message}`;
      log.stage(record);
    }
    state.record.status = "broken";
    state.save();
    process.exit(1);
  }

  private interrupted(state: PipelineState): number {
    state.record.status = "interrupted";
    for (const record of state.record.stages) if (record.status === "running") record.status = "interrupted";
    state.save();
    log.interrupted();
    return 130;
  }

  /** A retry finishes the round it started, so a file edited since cannot reorder the stages half-way through. */
  private definition(file: PipelineFile, named: PipelineDefinition, dir: string, retry: boolean): PipelineDefinition {
    let definition = named;
    const copy = join(dir, COPY_FILE);
    if (retry && existsSync(copy)) {
      definition = file.parse(readFileSync(copy, "utf8"));
      if (definition.spec.name !== named.spec.name) throw new UsageError(`${dir} holds a run of "${definition.spec.name}", not "${named.spec.name}"`);
    }
    // Gates passed with --gate are checked with the top-level when: the CI job decides if the run happens at all.
    for (const name of Object.keys(this.options.gates ?? {})) {
      if (definition.spec.prerequisites[name]) throw new UsageError(`--gate ${name}: the pipeline already defines this prerequisite`);
    }
    return definition;
  }

  /** The checks the runner makes itself: each prerequisite's marker, and every --gate. */
  private gates(definition: PipelineDefinition): Map<string, Gate> {
    const { prerequisites } = definition.spec;
    const gates = new Map<string, Gate>();
    for (const [name, check] of definition.checks()) gates.set(name, new Gate(name, prerequisites[name]!.message, check, prerequisites[name]));
    for (const [name, run] of Object.entries(this.options.gates ?? {})) gates.set(name, Gate.command(name, run));
    return gates;
  }

  /** The file's `$tests`, before any check is made. One that fails makes the file wrong: bad usage. */
  private async test(definition: PipelineDefinition): Promise<void> {
    const results = await definition.test();
    for (const result of results) log.test(result.about, result.failures);
    const failed = results.filter((result) => result.failures.length > 0).length;
    if (failed) throw new UsageError(`${failed} of the pipeline's $tests ${failed === 1 ? "fails" : "fail"}`);
  }

  /** Why nothing runs: the top-level when, then a --gate. Null when the run goes on. */
  private blocked(spec: PipelineSpec, values: PipelineValues, gates: Map<string, Gate>, results: Map<string, boolean>): string | null {
    if (!values.runs()) return values.reason(spec.when, spec.condition);
    const gate = Object.keys(this.options.gates ?? {}).find((name) => !results.get(name));
    return gate ? gates.get(gate)!.message : null;
  }

  /** A check's own message, which knows what it did not find; else the prerequisite's. */
  private message(spec: PipelineSpec, gates: Map<string, Gate>, name: string): string {
    return gates.get(name)?.message ?? spec.prerequisites[name]!.message;
  }

  /**
   * Each stage gets a numbered folder, padded so they sort in order. An output may
   * not take the stage's own file names, nor be one of its inputs: those are links
   * to another stage's files.
   */
  private stages(specs: StageSpec[]): Stage[] {
    const width = String(specs.length).length;
    const stages = specs.map((spec, index) => {
      const folder = `${String(index + 1).padStart(width, "0")}-${spec.id}`;
      if (spec.run !== undefined) return new CommandStage(spec, folder);
      if (spec.decide !== undefined) return new DecideStage(spec, folder);
      if (spec.extract !== undefined) return new ExtractStage(spec, folder);
      return new TaskStage(spec, folder);
    });
    for (const stage of stages) {
      for (const output of stage.spec.outputs) {
        if (stage.files().includes(output)) throw new UsageError(`stage "${stage.id}" output ${output} is a file the stage writes itself`);
        if (stage.inputs().includes(output)) throw new UsageError(`stage "${stage.id}" reads and writes ${output}. Write a new file`);
      }
    }
    return stages;
  }

  /** The job's environment, `--set`, the runner's own, then the `$vars` defaults no one set. */
  private async variables(definition: PipelineDefinition, dir: string, round: number): Promise<Variables> {
    const sets = this.options.sets ?? {};
    const branch = await this.git.branch({ ...process.env, ...sets });
    let vars = new Variables({ ...process.env }).with({
      ...sets,
      ...Variables.builtins({ GIT_BRANCH: branch ?? "", PIPELINE_DIR: dir, PIPELINE_NAME: definition.spec.name, PIPELINE_ROUND: String(round) }),
    });
    const unset = Object.entries(definition.defaults()).filter(([name]) => !vars.get(name));
    return vars.with(Object.fromEntries(unset));
  }

  /** The variables with `env:` computed from them. `--set` wins over `env:`. */
  private withEnv(definition: PipelineDefinition, vars: Variables): Variables {
    return vars.with(definition.values(vars.toEnv()).env()).with(this.options.sets ?? {}).without(JOB_ONLY);
  }

  /** The `$value!extract` prerequisites: checked on every run, as a stage may read their values with no `when`. */
  private extracting(spec: PipelineSpec): string[] {
    return Object.keys(spec.prerequisites).filter((name) => spec.prerequisites[name]!.extract);
  }

  /** Asks the agent, in this process, for the values the input does not have. A failed call finds nothing. */
  private extractor(vars: Variables): Extractor {
    return async (prerequisite: string, fields: ExtractField[]) => {
      const prompt = ExtractFields.prompt(fields);
      log.task(`prerequisites.${prerequisite}`, this.options.model, null, prompt);
      const controller = new AbortController();
      this.launcher.track(controller);
      try {
        const request = { prompt, outputs: [], extract: fields, noSession: true, noThread: true, noDefaultFooter: true, model: this.options.model };
        const outcome = await new StageEnv(vars.toEnv()).run(() => this.runTask(request, { signal: controller.signal }));
        return outcome.envelope.values ?? {};
      } catch (err) {
        log.note(c.yellow(`  prerequisites.${prerequisite}: ${err instanceof Error ? err.message : String(err)}`));
        return {};
      } finally {
        this.launcher.untrack();
      }
    };
  }

  /** Each check once. A shallow clone cannot say what changed, and a silent skip would look like a quiet pull request. */
  private async checkGates(gates: Map<string, Gate>, names: string[], context: Omit<GateContext, "cwd">): Promise<Map<string, boolean>> {
    const used = [...new Set(names)].filter((name) => gates.has(name));
    const { changes } = context;
    if (!changes.files && used.some((name) => gates.get(name)!.readsChanges)) {
      throw new UsageError(`cannot read the changes: ${changes.error}. Check out with full history (fetch-depth: 0)`);
    }
    const results = new Map<string, boolean>();
    for (const name of used) results.set(name, await gates.get(name)!.passes({ ...context, cwd: this.cwd }));
    return results;
  }

  /** Every input comes from an earlier stage, the runner, or the folder itself. */
  private checkInputs(stages: Stage[], dir: string): void {
    for (const [index, stage] of stages.entries()) {
      for (const input of stage.inputs()) {
        if (input === CHANGES_FILE || existsSync(join(dir, input))) continue;
        if (stages.slice(0, index).some((earlier) => earlier.produces(input))) continue;
        throw new UsageError(`stage "${stage.id}" reads ${input}, which no earlier stage writes`);
      }
    }
  }

  // A shell command or a decision model cannot reason about a missing file; an agent stage is told instead.
  private inputsSkipped(stage: Stage, run: Run): boolean {
    const inputs = stage.inputs();
    if (inputs.length === 0) return false;
    return inputs.every((input) => {
      const producer = run.stages.find((entry) => entry.produces(input));
      if (!producer) return false;
      return run.state.stage(producer.id)?.status === "skipped";
    });
  }

  /** The last stage before the reader that wrote the input, else the top of the folder. */
  private locate(input: string, reader: Stage, run: Run): string | null {
    let before = run.stages;
    const index = run.stages.indexOf(reader);
    if (index >= 0) before = run.stages.slice(0, index);
    const producer = before.filter((stage) => stage.produces(input) && existsSync(join(run.dir, stage.folder, input))).at(-1);
    if (producer) return producer.folder;
    if (existsSync(join(run.dir, input))) return ".";
    return null;
  }

  private whyMissing(input: string, run: Run): string {
    const producer = run.stages.find((stage) => stage.produces(input));
    if (!producer) return "not found";
    const record = run.state.stage(producer.id);
    if (record?.status === "skipped") return `stage ${producer.id} skipped: ${record.reason}`;
    return `stage ${producer.id} did not write it`;
  }

  private keptRecord(stage: Stage, previous: PipelineRecord | null): StageRecord {
    const record = previous?.stages.find((entry) => entry.id === stage.id);
    let kept: StageRecord = { id: stage.id, status: "not-run" };
    if (record?.status === "pass" || record?.status === "fail") kept = record;
    else if (record) kept = { id: stage.id, status: record.status, items: record.items };
    if (stage.spec.optional) kept.optional = true;
    return kept;
  }

  /** The summary is an agent, so a pipeline with one needs a model. */
  private needsAi(stages: Stage[]): boolean {
    return this.needsChat(stages) || this.needsDecider(stages);
  }

  private needsChat(stages: Stage[]): boolean {
    return stages.length > 1 || stages.some((stage) => stage instanceof TaskStage);
  }

  private needsDecider(stages: Stage[]): boolean {
    return stages.some((stage) => stage instanceof DecideStage);
  }

  private async aiProblem(stages: Stage[]): Promise<string | null> {
    try {
      if (this.needsChat(stages)) await this.options.checkAi?.(this.options.model);
      if (this.needsDecider(stages)) await this.options.checkDecider?.(this.options.sets?.TESTEIYA_DECISION_MODEL);
      return null;
    } catch (err) {
      if (err instanceof UsageError) return err.message;
      throw err;
    }
  }

  private folder(name: string, create = !this.options.dryRun): string {
    if (this.options.dir) return resolve(this.options.dir);
    if (!create) return join(tmpdir(), `testeiya-${name}`);
    return mkdtempSync(join(tmpdir(), `testeiya-${name}-`));
  }

  private dryRun(spec: PipelineSpec, gates: Map<string, Gate>, stages: Stage[], values: PipelineValues, results: Map<string, boolean>, aiProblem: string | null): number {
    if (this.needsAi(stages)) log.aiGate(aiProblem);
    for (const [name, passed] of results) {
      if (gates.get(name)?.pending.length) log.pending(name, gates.get(name)!.pending);
      else log.gate(name, passed, this.message(spec, gates, name));
    }
    log.note("");
    let stopped = false;
    for (const stage of stages) {
      if (stopped) {
        log.plan(stage.id, "not-run", "not run");
        continue;
      }
      if (!values.stageRuns(stage.id)) {
        log.plan(stage.id, "skipped", `skipped: ${values.reason(stage.spec.when, stage.spec.condition)}`);
        stopped = stage.stopsOn("gate");
        continue;
      }
      log.plan(stage.id, "runs", "runs");
    }
    if (stages.length > 1) log.plan("summary", "runs", "runs, and reports");
    return 0;
  }
}

export interface PipelineOptions {
  name: string;
  dir?: string;
  dryRun?: boolean;
  /** pipeline-check also writes a Mermaid diagram to the current folder. */
  diagram?: boolean;
  sets?: Record<string, string>;
  /** Gate name to a shell check, from --gate. */
  gates?: Record<string, string>;
  /** A patch of the pipeline, from --pipeline. */
  pipelineOverrides?: string[];
  /** ID:YAML, a patch of one stage, from --stage. */
  stageOverrides?: string[];
  /** JSON files of values a `$value!extract` prerequisite takes before asking the agent, from --input. */
  inputs?: string[];
  outputs?: string[];
  thread?: string;
  header?: string;
  footer?: string;
  noDefaultFooter?: boolean;
  model?: string;
  exitZero?: boolean;
  json?: boolean;
  /** The CLI a stage spawns under TESTEIYA_PIPELINE_SPAWN=1. Tests swap in a fake. */
  cli?: string;
  /** Runs an agent stage. Tests swap in a fake. */
  runTask?: TaskRunner;
  /** Throws when no model or key resolves. */
  checkAi?: (model?: string) => Promise<void>;
  /** Throws when a decide stage has no decision model or key. */
  checkDecider?: (model?: string) => Promise<void>;
  /** Asks the decision model of a decide stage. Tests swap in a fake. */
  decide?: DecideRunner;
}

type DecideRunner = (request: DecisionRequest, model?: string) => Promise<Decision>;

/** A prerequisite as `pipeline-check` reports it. `pending`: values only the agent of a run would find. */
interface Checked {
  name: string;
  passed: boolean;
  message: string;
  pending?: string[];
}

interface Run {
  definition: PipelineDefinition;
  spec: PipelineSpec;
  stages: Stage[];
  values: PipelineValues;
  state: PipelineState;
  vars: Variables;
  report: Report;
  dir: string;
}

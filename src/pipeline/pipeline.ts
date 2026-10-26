import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chalkStderr as c } from "chalk";

import { Git, type Changes } from "../git.js";
import { UsageError } from "../model.js";
import { CommandStage } from "./command-stage.js";
import { Diagram } from "./diagram.js";
import { Gate } from "./gate.js";
import { Launcher } from "./launcher.js";
import { log } from "./log.js";
import { PipelineFile } from "./pipeline-file.js";
import { Report } from "./report.js";
import type { PipelineSpec, StageSpec } from "./spec.js";
import type { Stage, StageContext } from "./stage.js";
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
 * One run of a pipeline file. It picks the round, checks the gates, runs the
 * stages in order through one folder, then a summary that is the only report.
 */
export class Pipeline {
  private readonly cwd = process.cwd();
  private readonly git = new Git(this.cwd);
  private readonly launcher = new Launcher(this.cwd);
  private readonly cli: string;

  constructor(private readonly options: PipelineOptions) {
    this.cli = options.cli ?? fileURLToPath(new URL("../cli.js", import.meta.url));
  }

  static list(json?: boolean): number {
    const pipelines = PipelineFile.bundled();
    if (json) {
      process.stdout.write(`${JSON.stringify({ pipelines }, null, 2)}\n`);
      return 0;
    }
    process.stdout.write("\n");
    for (const pipeline of pipelines) {
      process.stdout.write(`  ${pipeline.name.padEnd(14)} ${c.dim(pipeline.description)}\n`);
    }
    process.stdout.write('\n  Run one with:  testeiya pipeline <name>, or pass your own .yml\n\n');
    return 0;
  }

  async run(): Promise<number> {
    const { options, cwd } = this;
    const file = PipelineFile.find(options.name);
    const named = file.read();
    const dir = this.folder(named.name);
    if (dir === cwd || cwd.startsWith(dir + sep)) {
      throw new UsageError("--dir must be a folder of its own, not the checkout or a folder above it");
    }

    const previous = PipelineState.read(dir);
    const commit = await this.git.headCommit();
    const history = previous?.rounds ?? [];
    const retry = Boolean(previous && previous.commit === commit && PipelineState.STOPPED.includes(previous.status));
    const again = Boolean(previous && !retry && previous.status !== "skipped" && previous.commit === commit);

    const spec = this.spec(file, named, dir, retry);
    const gates = this.gates(spec);
    const stages = this.stages(spec.stages);

    let round = history.length + 1;
    let since = history.at(-1)?.commit ?? null;
    if (retry || again) {
      round = previous!.round;
      since = previous!.since;
    }

    let aiProblem: string | null = null;
    if (this.needsAi(stages)) aiProblem = await this.aiProblem();
    if (aiProblem && !options.dryRun) throw new UsageError(aiProblem);

    const vars = this.variables(spec, dir, round);
    const changes = await this.git.changes(since, vars.toEnv());
    const results = await this.checkGates(gates, [spec.when, ...stages.map((stage) => stage.spec.when)].flat(), vars, changes);
    log.header(spec.name, round, changes, dir);

    const blocked = spec.when.find((name) => !results.get(name));
    if (blocked) {
      const reason = gates.get(blocked)!.message;
      log.skipped(reason);
      if (options.dryRun) return 0;
      const state = new PipelineState(dir, { name: spec.name, round, commit, since, status: "skipped", reason, stages: [], rounds: history });
      state.save();
      if (options.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
      return 0;
    }

    // After the skip: a job gated on a pull request may name one that only exists when the gate passes.
    const report = await Report.prepare(options);
    if (options.dryRun) return this.dryRun(stages, gates, results, aiProblem);

    let created = previous?.created ?? [];
    mkdirSync(dir, { recursive: true });
    if (!retry) {
      // A new round moves what the last one wrote to .last, and keeps the sessions.
      rmSync(join(dir, LAST_DIR), { recursive: true, force: true });
      mkdirSync(join(dir, LAST_DIR));
      for (const name of created.filter((entry) => existsSync(join(dir, entry)))) renameSync(join(dir, name), join(dir, LAST_DIR, name));
      created = [];
      writeFileSync(join(dir, COPY_FILE), file.text());
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
    return this.runStages({ spec, stages, gates, results, state, vars, report, dir });
  }

  /** Validates the file, then checks every gate it declares. Runs no stage. */
  async check(): Promise<number> {
    const file = PipelineFile.find(this.options.name);
    const named = file.read();
    const dir = this.folder(named.name, false);
    const spec = this.spec(file, named, dir, false);
    const gates = this.gates(spec);
    const stages = this.stages(spec.stages);
    this.checkInputs(stages, dir);
    log.valid(spec.name, file.path);

    let aiProblem: string | null = null;
    if (this.needsAi(stages)) aiProblem = await this.aiProblem();
    const vars = this.variables(spec, dir, 1);
    const since = PipelineState.read(dir)?.rounds.at(-1)?.commit ?? null;
    const changes = await this.git.changes(since, vars.toEnv());
    const results = await this.checkGates(gates, [...gates.keys()], vars, changes);

    const checked = [...results].map(([name, passed]) => ({ name, passed, message: gates.get(name)!.message }));
    if (this.needsAi(stages)) checked.unshift({ name: "ai", passed: !aiProblem, message: aiProblem ?? "" });
    const failed = checked.filter((gate) => !gate.passed).length;
    if (this.options.json) {
      process.stdout.write(`${JSON.stringify({ name: spec.name, file: file.path, gates: checked }, null, 2)}\n`);
    }
    for (const gate of checked) log.gate(gate.name, gate.passed, gate.message);
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
    const { stages, state, results, gates } = run;
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

      const closed = stage.closedGate(results);
      if (closed) {
        stage.skip(record, gates.get(closed)!.message);
        stopped = stage.stopsOn("gate");
        state.save();
        continue;
      }
      if (stage instanceof CommandStage && this.inputsSkipped(stage, run)) {
        stage.skip(record, "its inputs come from skipped stages");
        state.save();
        continue;
      }

      await stage.run(this.context(run, stages.length === 1), record);
      state.save();
      const status = record.status as Status;
      if (status === "interrupted") break;
      if (status === "broken" || status === "timeout") stopped = true;
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
    await new SummaryStage(run.spec, run.stages, run.state, run.dir).run(this.context(run, true), record);
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
      model: this.options.model,
      report,
      missing: (input) => this.whyMissing(input, run),
      locate: (input, reader) => this.locate(input, reader, run),
    };
  }

  private interrupted(state: PipelineState): number {
    state.record.status = "interrupted";
    for (const record of state.record.stages) if (record.status === "running") record.status = "interrupted";
    state.save();
    log.interrupted();
    return 130;
  }

  /** A retry finishes the round it started, so a file edited since cannot reorder the stages half-way through. */
  private spec(file: PipelineFile, named: PipelineSpec, dir: string, retry: boolean): PipelineSpec {
    let spec = named;
    const copy = join(dir, COPY_FILE);
    if (retry && existsSync(copy)) {
      spec = file.parse(readFileSync(copy, "utf8"));
      if (spec.name !== named.name) throw new UsageError(`${dir} holds a run of "${spec.name}", not "${named.name}"`);
    }
    // Gates passed with --gate join `when`: the CI job decides if the run happens at all.
    for (const name of Object.keys(this.options.gates ?? {})) {
      if (spec.gates[name]) throw new UsageError(`--gate ${name}: the pipeline already defines this gate`);
    }
    return { ...spec, when: [...spec.when, ...Object.keys(this.options.gates ?? {})] };
  }

  private gates(spec: PipelineSpec): Map<string, Gate> {
    const gates = new Map<string, Gate>();
    for (const [name, gate] of Object.entries(spec.gates)) gates.set(name, new Gate(name, gate));
    for (const [name, run] of Object.entries(this.options.gates ?? {})) gates.set(name, Gate.command(name, run));
    return gates;
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

  private variables(spec: PipelineSpec, dir: string, round: number): Variables {
    const sets = this.options.sets ?? {};
    return new Variables({ ...process.env })
      .with({ ...sets, PIPELINE_DIR: dir, PIPELINE_NAME: spec.name, PIPELINE_ROUND: String(round) })
      .withExpanded(spec.env)
      .with(sets)
      .without(JOB_ONLY);
  }

  /** Each gate once. A shallow clone cannot say what changed, and a silent skip would look like a quiet pull request. */
  private async checkGates(gates: Map<string, Gate>, names: string[], vars: Variables, changes: Changes): Promise<Map<string, boolean>> {
    const used = [...new Set(names)];
    if (!changes.files && used.some((name) => gates.get(name)!.readsChanges)) {
      throw new UsageError(`cannot read the changes: ${changes.error}. Check out with full history (fetch-depth: 0)`);
    }
    const results = new Map<string, boolean>();
    for (const name of used) results.set(name, await gates.get(name)!.passes({ cwd: this.cwd, vars, changes }));
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

  // A shell command cannot reason about a missing file; an agent stage is told instead.
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
    if (!record) return { id: stage.id, status: "not-run" };
    if (record.status === "pass" || record.status === "fail") return record;
    return { id: stage.id, status: record.status, items: record.items };
  }

  /** The summary is an agent, so a pipeline with one needs a model. */
  private needsAi(stages: Stage[]): boolean {
    return stages.length > 1 || stages.some((stage) => stage instanceof TaskStage);
  }

  private async aiProblem(): Promise<string | null> {
    if (!this.options.checkAi) return null;
    try {
      await this.options.checkAi(this.options.model);
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

  private dryRun(stages: Stage[], gates: Map<string, Gate>, results: Map<string, boolean>, aiProblem: string | null): number {
    if (this.needsAi(stages)) log.aiGate(aiProblem);
    for (const [name, passed] of results) log.gate(name, passed, gates.get(name)!.message);
    log.note("");
    let stopped = false;
    for (const stage of stages) {
      if (stopped) {
        log.plan(stage.id, "not-run", "not run");
        continue;
      }
      const closed = stage.closedGate(results);
      if (closed) {
        log.plan(stage.id, "skipped", `skipped: ${gates.get(closed)!.message}`);
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
  outputs?: string[];
  thread?: string;
  header?: string;
  footer?: string;
  noDefaultFooter?: boolean;
  model?: string;
  exitZero?: boolean;
  json?: boolean;
  /** The CLI a stage runs. Tests swap in a fake. */
  cli?: string;
  /** Throws when no model or key resolves. */
  checkAi?: (model?: string) => Promise<void>;
}

interface Run {
  spec: PipelineSpec;
  stages: Stage[];
  gates: Map<string, Gate>;
  results: Map<string, boolean>;
  state: PipelineState;
  vars: Variables;
  report: Report;
  dir: string;
}

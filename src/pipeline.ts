import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chalkStderr as c } from "chalk";

import { Gates, expand } from "./gates.js";
import { Git, type Changes } from "./git.js";
import { UsageError } from "./model.js";
import { parseDestinations, preflight } from "./output.js";
import {
  listBundled,
  parsePipeline,
  resolvePipelinePath,
  stageFiles,
  type PipelineConfig,
  type Stage,
} from "./pipeline-file.js";

const STATE = "pipeline.json";
const COPY = "pipeline.yml";
const SESSIONS = ".sessions";
const CHANGES = "changes.txt";
const OWN = [STATE, COPY, SESSIONS];
const STOPPED: Status[] = ["broken", "timeout", "interrupted", "running"];
const KILL_GRACE_MS = 5_000;
// A job-level reply, thread or session file belongs to a single task, never to
// every stage of a pipeline.
const JOB_ONLY = ["TESTEIYA_FOLLOW_UP", "TESTEIYA_THREAD", "TESTEIYA_SESSION_FILE"];
const RETRY_NOTE =
  "This stage stopped before it finished. Go on from where you stopped. Files you already wrote are in the pipeline folder.";

/** One pipeline run: picks the round, checks the gates, then runs the stages. */
export class Pipeline {
  private readonly cwd = process.cwd();
  private readonly git = new Git(this.cwd);

  constructor(private readonly options: PipelineOptions) {}

  static list(json?: boolean): number {
    const pipelines = listBundled();
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
    const source = resolvePipelinePath(options.name);
    const named = parsePipeline(readFileSync(source, "utf8"), source);
    const dir = this.folder(named.name);
    if (dir === cwd || cwd.startsWith(dir + sep)) {
      throw new UsageError("--dir must be a folder of its own, not the checkout or a folder above it");
    }

    const previous = readJson<PipelineState>(join(dir, STATE));
    const commit = await this.git.headCommit();
    const history = previous?.rounds ?? [];
    const retry = Boolean(previous && previous.commit === commit && STOPPED.includes(previous.status));
    const again = Boolean(previous && !retry && previous.status !== "skipped" && previous.commit === commit);

    // A retry finishes the round it started, so a file edited since cannot
    // reorder the stages half-way through.
    let pipeline = named;
    if (retry && existsSync(join(dir, COPY))) {
      // Parsed under the original path, so a pipeline without a name keeps its own.
      pipeline = parsePipeline(readFileSync(join(dir, COPY), "utf8"), source);
      if (pipeline.name !== named.name) {
        throw new UsageError(`${dir} holds a run of "${pipeline.name}", not "${named.name}"`);
      }
    }
    pipeline = this.withJobGates(pipeline);

    let round = history.length + 1;
    let since = history.at(-1)?.commit ?? null;
    if (retry || again) {
      round = previous!.round;
      since = previous!.since;
    }

    const aiProblem = needsAi(pipeline) ? await this.aiProblem() : null;
    if (aiProblem && !options.dryRun) throw new UsageError(aiProblem);

    const env = this.stageEnv(pipeline, dir, round);
    const changes = await this.git.changes(since, env);
    const used = [...pipeline.when, ...pipeline.stages.flatMap((stage) => stage.when)];
    // A shallow clone cannot say what changed, and a silent skip would look like a quiet pull request.
    if (!changes.files && used.some((name) => pipeline.gates[name]!.changes)) {
      throw new UsageError(`cannot read the changes: ${changes.error}. Check out with full history (fetch-depth: 0)`);
    }
    const gates = await new Gates(pipeline.gates, { cwd, env, changes }).check(used);

    note(`  Pipeline ${c.bold(pipeline.name)} ${c.dim("·")} round ${round} ${c.dim("·")} ${describeChanges(changes)}`);
    note(c.dim(`  ${dir}`));

    const blocked = pipeline.when.find((name) => !gates.get(name));
    if (blocked) {
      const reason = pipeline.gates[blocked]!.message;
      note(`  ${c.yellow("⨯")} skipped: ${reason}`);
      if (options.dryRun) return 0;
      saveState(dir, { name: pipeline.name, round, commit, since, status: "skipped", reason, stages: [], rounds: history });
      if (options.json) process.stdout.write(`${JSON.stringify(readJson(join(dir, STATE)), null, 2)}\n`);
      return 0;
    }

    // After the skip: a job gated on a pull request may name one that only exists when the gate passes.
    const reporting = await this.destinations();
    if (options.dryRun) return this.dryRun(pipeline, gates, aiProblem);

    mkdirSync(dir, { recursive: true });
    let created = previous?.created ?? [];
    if (!retry) {
      // A new round clears what the last one wrote and keeps the sessions.
      for (const name of created) rmSync(join(dir, name), { recursive: true, force: true });
      created = [];
      writeFileSync(join(dir, COPY), readFileSync(source, "utf8"));
    }
    if (changes.files) writeFileSync(join(dir, CHANGES), `${changes.files.join("\n")}\n`);
    this.checkInputs(pipeline, dir);

    const state: PipelineState = {
      name: pipeline.name,
      round,
      commit,
      since,
      status: "running",
      stages: pipeline.stages.map((stage) => keptRecord(stage, retry ? previous : null)),
      rounds: history,
      created,
    };
    const runner = new StageRunner({ pipeline, dir, state, gates, env, reporting, options, cwd });
    return runner.run();
  }

  private folder(name: string): string {
    if (this.options.dir) return resolve(this.options.dir);
    if (this.options.dryRun) return join(tmpdir(), `testeiya-${name}`);
    return mkdtempSync(join(tmpdir(), `testeiya-${name}-`));
  }

  /** Gates passed with --gate join `when`: the CI job decides if the run happens at all. */
  private withJobGates(pipeline: PipelineConfig): PipelineConfig {
    const gates = { ...pipeline.gates };
    const when = [...pipeline.when];
    for (const [name, run] of Object.entries(this.options.gates ?? {})) {
      if (gates[name]) throw new UsageError(`--gate ${name}: the pipeline already defines this gate`);
      gates[name] = { run, message: `The ${name} gate did not pass.` };
      when.push(name);
    }
    return { ...pipeline, gates, when };
  }

  private stageEnv(pipeline: PipelineConfig, dir: string, round: number): Env {
    const sets = this.options.sets ?? {};
    const env: Env = {
      ...process.env,
      ...sets,
      PIPELINE_DIR: dir,
      PIPELINE_NAME: pipeline.name,
      PIPELINE_ROUND: String(round),
    };
    for (const [key, value] of Object.entries(pipeline.env)) env[key] = expand(value, env);
    Object.assign(env, sets);
    for (const key of JOB_ONLY) delete env[key];
    return env;
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

  // Checked before the first stage, like any task: a run that cannot post spends nothing.
  private async destinations(): Promise<Reporting> {
    const outputs = this.options.outputs ?? [];
    const parsed = parseDestinations(outputs);
    if (typeof parsed === "string") throw new UsageError(parsed);
    const unreachable = await preflight(parsed);
    if (unreachable) throw new UsageError(unreachable);
    const reporting: Reporting = { passed: [], copies: [] };
    for (const output of outputs) {
      const kind = parseDestinations([output]);
      if (typeof kind !== "string" && kind[0]?.kind === "markdown") reporting.copies.push(output);
      else reporting.passed.push(output);
    }
    return reporting;
  }

  /** Every input comes from an earlier stage, the runner, or the folder itself. */
  private checkInputs(pipeline: PipelineConfig, dir: string): void {
    for (const [index, stage] of pipeline.stages.entries()) {
      for (const input of stageInputs(stage)) {
        if (input === CHANGES || existsSync(join(dir, input))) continue;
        if (pipeline.stages.slice(0, index).some((earlier) => produces(earlier, input))) continue;
        throw new UsageError(`stage "${stage.id}" reads ${input}, which no earlier stage writes`);
      }
    }
  }

  private dryRun(pipeline: PipelineConfig, gates: Map<string, boolean>, aiProblem: string | null): number {
    if (needsAi(pipeline)) note(`  ${aiProblem ? c.red("✗") : c.green("✓")} gate ai${c.dim(aiProblem ? `  ${aiProblem}` : "")}`);
    for (const [name, passed] of gates) {
      const mark = passed ? c.green("✓") : c.yellow("✗");
      note(`  ${mark} gate ${name}${passed ? "" : c.dim(`  ${pipeline.gates[name]!.message}`)}`);
    }
    note("");
    let stopped = false;
    for (const stage of pipeline.stages) {
      if (stopped) {
        note(`  ${c.dim("·")} ${stage.id.padEnd(14)} ${c.dim("not run")}`);
        continue;
      }
      const closed = stage.when.find((name) => !gates.get(name));
      if (closed) {
        note(`  ${c.yellow("⨯")} ${stage.id.padEnd(14)} ${c.dim(`skipped: ${pipeline.gates[closed]!.message}`)}`);
        stopped = stage.stopOn.includes("gate");
        continue;
      }
      note(`  ${c.green("▸")} ${stage.id.padEnd(14)} ${c.dim("runs")}`);
    }
    if (pipeline.stages.length > 1) note(`  ${c.green("▸")} ${"summary".padEnd(14)} ${c.dim("runs, and reports")}`);
    return 0;
  }
}

/** Runs the planned stages one after another, then the summary, and owns the child process. */
class StageRunner {
  private readonly pipeline: PipelineConfig;
  private readonly dir: string;
  private readonly state: PipelineState;
  private readonly gates: Map<string, boolean>;
  private readonly env: Env;
  private readonly reporting: Reporting;
  private readonly options: PipelineOptions;
  private readonly cwd: string;
  private readonly cli: string;
  private readonly created: string[];
  private readonly existing: Set<string>;
  private current: ChildProcess | null = null;
  private interrupted = false;

  constructor(plan: Plan) {
    this.pipeline = plan.pipeline;
    this.dir = plan.dir;
    this.state = plan.state;
    this.gates = plan.gates;
    this.env = plan.env;
    this.reporting = plan.reporting;
    this.options = plan.options;
    this.cwd = plan.cwd;
    this.cli = plan.options.cli ?? fileURLToPath(new URL("./cli.js", import.meta.url));
    this.created = plan.state.created ?? [];
    this.existing = new Set(readdirSync(plan.dir));
  }

  async run(): Promise<number> {
    const { pipeline, state } = this;
    process.on("SIGINT", () => {
      this.interrupted = true;
      if (this.current) killGroup(this.current, "SIGINT");
    });
    this.save();

    let stopped = false;
    for (const [index, stage] of pipeline.stages.entries()) {
      const record = state.stages[index]!;
      if (record.status === "pass" || record.status === "fail") {
        line(record, "kept from the last attempt");
        continue;
      }
      if (stopped) {
        record.status = "not-run";
        continue;
      }

      const closed = stage.when.find((name) => !this.gates.get(name));
      if (closed) {
        skip(record, pipeline.gates[closed]!.message);
        stopped = stage.stopOn.includes("gate");
        this.save();
        continue;
      }
      if (stage.run && this.inputsSkipped(stage)) {
        skip(record, "its inputs come from skipped stages");
        this.save();
        continue;
      }

      await this.runStage(stage, record, pipeline.stages.length === 1);
      this.save();
      const status = record.status as Status;
      if (status === "interrupted") break;
      if (status === "broken" || status === "timeout") stopped = true;
      if (status === "fail" && stage.stopOn.includes("fail")) stopped = true;
    }

    if (this.interrupted) {
      state.status = "interrupted";
      for (const record of state.stages) if (record.status === "running") record.status = "interrupted";
      this.save();
      note(c.yellow("\n  ⨯ interrupted"));
      return 130;
    }

    state.status = verdict(state.stages);
    this.save();
    if (pipeline.stages.length > 1 && state.stages.some(ran)) {
      const record: StageRecord = { id: "summary", status: "not-run" };
      state.stages.push(record);
      await this.runStage(this.summaryStage(), record, true);
      // The verdict came from the stages; the summary only explains it.
      if (record.status === "fail") {
        record.status = "pass";
        delete record.reason;
      }
      if (this.interrupted) {
        state.status = "interrupted";
        this.save();
        return 130;
      }
      state.status = verdict(state.stages);
    }

    state.rounds = [...state.rounds.filter((entry) => entry.round !== state.round), { round: state.round, commit: state.commit, status: state.status }];
    this.save();
    if (this.options.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return exitCode(state.status, this.options.exitZero);
  }

  private async runStage(stage: Stage, record: StageRecord, reporter: boolean): Promise<void> {
    const resumed = STOPPED.includes(record.status);
    const items = this.loopItems(stage);
    if (items && items.length === 0) {
      skip(record, emptyLoop(stage));
      return;
    }

    const started = Date.now();
    record.status = "running";
    if (!items) {
      Object.assign(record, await this.runOnce(stage, { suffix: "", resumed, reporter }));
    } else {
      const previous = record.items ?? [];
      record.items = [];
      for (const [index, item] of items.entries()) {
        const done = previous.find((entry) => entry.item === item && (entry.status === "pass" || entry.status === "fail"));
        if (done) {
          record.items.push(done);
          continue;
        }
        const again = previous.some((entry) => entry.item === item);
        const result = await this.runOnce(stage, { suffix: `.${index + 1}`, item, resumed: again, reporter });
        record.items.push({ item, ...result });
        if (result.status === "broken" || result.status === "timeout" || result.status === "interrupted") break;
      }
      record.status = verdict(record.items);
      this.joinItems(stage, record);
    }
    record.seconds = Math.round((Date.now() - started) / 1000);

    if (record.status === "pass" || record.status === "fail") {
      const missing = stage.outputs.filter((output) => !this.has(output));
      if (missing.length > 0) {
        record.status = "broken";
        record.reason = `did not write ${missing.join(", ")}`;
      }
    }
    line(record);
  }

  private async runOnce(stage: Stage, once: Once): Promise<StageResult> {
    const env: Env = { ...this.env };
    if (once.item !== undefined) {
      env.ITEM = once.item;
      env.ITEM_NAME = basename(once.item, extname(once.item));
    }
    if (once.resumed) env.PIPELINE_RESUME = "1";
    const base = `${stage.id}${once.suffix}`;
    note(c.dim(`\n  ▸ ${base}${once.item !== undefined ? `  ${once.item}` : ""}`));

    if (stage.run !== undefined) {
      const log = `${base}.log`;
      note(c.dim(`  $ ${stage.run.trim().split("\n")[0]}`));
      const done = await this.launch(stage.run, null, env, this.path(log), stage.timeout);
      return { ...outcome(done, done.code === 0 ? "pass" : "fail", `exit ${done.code}`), log };
    }

    const report = `${base}.md`;
    const envelope = `${base}.json`;
    rmSync(this.path(report), { force: true });
    rmSync(this.path(envelope), { force: true });

    const args = [this.cli, "task"];
    if (!once.reporter) args.push("--no-thread");
    args.push("-o", this.path(report), "-o", this.path(envelope));
    if (once.reporter) args.push(...this.reporterArgs());
    if (stage.session) args.push("--session-file", join(this.dir, SESSIONS, `${stage.session}.jsonl`));
    if (!stage.session) args.push("--no-session");
    if (this.options.model) args.push("--model", this.options.model);
    if (once.resumed && stage.session) args.push("--followup", RETRY_NOTE);
    const task = this.composeTask(stage, env);
    args.push("--", task);
    note(c.dim(`  $ testeiya ${args.slice(1, -1).join(" ")} "${task.split("\n")[0]}…"`));

    const done = await this.launch(process.execPath, args, env, null, stage.timeout);
    const result = readJson<{ status?: string; reason?: string | null }>(this.path(envelope));
    if (once.reporter) this.copyReport(this.path(report));
    if (done.code === 2) return { ...outcome(done, "broken", "bad usage, see the log above"), report };
    if (!result) return { ...outcome(done, "broken", "it wrote no result"), report };
    return { ...outcome(done, result.status === "fail" ? "fail" : "pass", result.reason), report };
  }

  /** The task, then where its files are, so the model never guesses a path. */
  private composeTask(stage: Stage, env: Env): string {
    const lines = [`Pipeline folder: ${this.dir}`];
    const wanted = stageInputs(stage);
    const present = wanted.filter((input) => this.has(input));
    const absent = wanted.filter((input) => !present.includes(input));
    if (present.length > 0) lines.push(`Read these first: ${present.join(", ")}`);
    if (stage.outputs.length > 0) lines.push(`Write these files: ${stage.outputs.map((output) => expand(output, env)).join(", ")}`);
    for (const input of absent) lines.push(`Not available: ${input} (${this.whyMissing(input)})`);
    return `${expand(stage.task ?? "", env).trim()}\n\n${lines.join("\n")}`;
  }

  private whyMissing(input: string): string {
    const producer = this.producer(input);
    if (!producer) return "not found";
    const record = this.record(producer.id);
    if (record?.status === "skipped") return `stage ${producer.id} skipped: ${record.reason}`;
    return `stage ${producer.id} did not write it`;
  }

  private inputsSkipped(stage: Stage): boolean {
    const inputs = stageInputs(stage);
    if (inputs.length === 0) return false;
    return inputs.every((input) => {
      const producer = this.producer(input);
      if (!producer) return false;
      return this.record(producer.id)?.status === "skipped";
    });
  }

  private producer(file: string): Stage | undefined {
    return this.pipeline.stages.find((stage) => produces(stage, file));
  }

  private record(id: string): StageRecord | undefined {
    return this.state.stages.find((entry) => entry.id === id);
  }

  private summaryStage(): Stage {
    const { pipeline, state } = this;
    const files = state.stages.flatMap((record) => {
      const stage = pipeline.stages.find((entry) => entry.id === record.id);
      const own = [record.report, record.log, ...(stage?.outputs ?? [])];
      return own.filter((file): file is string => Boolean(file));
    });
    const lines = [
      "/pipeline-report",
      "",
      `Write the final report of the "${pipeline.name}" pipeline, round ${state.round}.`,
    ];
    if (pipeline.summary) lines.push("", pipeline.summary.trim());
    lines.push(
      "",
      `Read pipeline.json first. The verdict is ${state.status}. Explain it, never change it.`,
      `Stage files: ${files.join(", ") || "none"}`
    );
    return {
      id: "summary",
      task: lines.join("\n"),
      session: "summary",
      inputs: [STATE],
      outputs: [],
      when: [],
      stopOn: [],
    };
  }

  private reporterArgs(): string[] {
    const { options } = this;
    const args: string[] = [];
    for (const output of this.reporting.passed) args.push("-o", output);
    if (options.thread) args.push("--thread", options.thread);
    if (options.header !== undefined) args.push("--header", options.header);
    if (options.footer !== undefined) args.push("--footer", options.footer);
    if (options.noDefaultFooter) args.push("--no-default-footer");
    return args;
  }

  // The stage already writes its own markdown report, and a task takes only one.
  private copyReport(report: string): void {
    if (!existsSync(report)) return;
    for (const path of this.reporting.copies) {
      mkdirSync(dirname(resolve(path)), { recursive: true });
      copyFileSync(report, path);
    }
  }

  private loopItems(stage: Stage): string[] | null {
    if (stage.eachLine) {
      if (!this.has(stage.eachLine)) return [];
      return readFileSync(this.path(stage.eachLine), "utf8")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (stage.eachFile) return globSync(stage.eachFile, { cwd: this.dir }).sort();
    return null;
  }

  // A loop's items read as one stage to whoever comes next.
  private joinItems(stage: Stage, record: StageRecord): void {
    const items = record.items ?? [];
    const field = stage.run !== undefined ? "log" : "report";
    const parts = items
      .filter((item) => item[field] && this.has(item[field]!))
      .map((item) => `## ${item.item}\n\n${readFileSync(this.path(item[field]!), "utf8").trim()}\n`);
    const file = `${stage.id}.${field === "log" ? "log" : "md"}`;
    writeFileSync(this.path(file), parts.join("\n"));
    record[field] = file;
  }

  private launch(command: string, args: string[] | null, env: Env, log: string | null, timeout?: number): Promise<Launched> {
    return new Promise((done) => {
      const options: SpawnOptions = { cwd: this.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] };
      let child: ChildProcess;
      if (args) child = spawn(command, args, options);
      else child = spawn(command, { ...options, shell: true });
      this.current = child;

      const file = log ? createWriteStream(log) : null;
      const forward = (chunk: Buffer) => {
        process.stderr.write(chunk);
        file?.write(chunk);
      };
      child.stdout?.on("data", forward);
      child.stderr?.on("data", forward);

      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;
      if (timeout) {
        timer = setTimeout(() => {
          timedOut = true;
          killGroup(child, "SIGTERM");
          setTimeout(() => killGroup(child, "SIGKILL"), KILL_GRACE_MS).unref();
        }, timeout);
      }
      const finish = (code: number) => {
        clearTimeout(timer);
        this.current = null;
        file?.end();
        done({ code, timedOut, interrupted: this.interrupted });
      };
      child.on("error", (err) => {
        forward(Buffer.from(`${err.message}\n`));
        finish(127);
      });
      child.on("close", (code) => finish(code ?? 1));
    });
  }

  private save(): void {
    // What this round wrote, for the next round to clear.
    const made = readdirSync(this.dir).filter((name) => !this.existing.has(name) && !OWN.includes(name));
    this.state.created = [...new Set([...this.created, ...made, CHANGES])];
    saveState(this.dir, this.state);
  }

  private path(name: string): string {
    return join(this.dir, name);
  }

  private has(name: string): boolean {
    return existsSync(this.path(name));
  }
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function outcome(done: Launched, status: Status, reason?: string | null): StageResult {
  if (done.interrupted) return { status: "interrupted" };
  if (done.timedOut) return { status: "timeout", reason: "ran past its timeout" };
  const result: StageResult = { status };
  if (status !== "pass" && reason) result.reason = reason;
  return result;
}

function stageInputs(stage: Stage): string[] {
  if (stage.eachLine) return [...stage.inputs, stage.eachLine];
  return stage.inputs;
}

function produces(stage: Stage, file: string): boolean {
  return stageFiles(stage).includes(file) || stage.outputs.includes(file);
}

function emptyLoop(stage: Stage): string {
  if (stage.eachLine) return `${stage.eachLine} is empty`;
  return `no files match ${stage.eachFile}`;
}

function keptRecord(stage: Stage, previous: PipelineState | null): StageRecord {
  const record = previous?.stages.find((entry) => entry.id === stage.id);
  if (!record) return { id: stage.id, status: "not-run" };
  if (record.status === "pass" || record.status === "fail") return record;
  return { id: stage.id, status: record.status, items: record.items };
}

function needsAi(pipeline: PipelineConfig): boolean {
  return pipeline.stages.length > 1 || pipeline.stages.some((stage) => stage.task !== undefined);
}

function describeChanges(changes: Changes): string {
  if (!changes.files) return c.dim(`changes unknown: ${changes.error}`);
  return `${changes.files.length} files changed since ${changes.from.slice(0, 12)}`;
}

function skip(record: StageRecord, reason: string): void {
  record.status = "skipped";
  record.reason = reason;
  line(record);
}

function line(record: StageRecord, detail?: string): void {
  const marks: Record<string, string> = {
    pass: c.green("✓"),
    fail: c.red("✗"),
    broken: c.red("✗"),
    timeout: c.red("✗"),
    skipped: c.yellow("⨯"),
  };
  const time = record.seconds !== undefined ? `${record.seconds}s` : "";
  const text = detail ?? [record.status, record.reason].filter(Boolean).join(": ");
  note(`  ${marks[record.status] ?? c.dim("·")} ${record.id.padEnd(14)} ${time.padEnd(6)} ${text}`);
}

function verdict(records: Array<{ status: Status }>): Status {
  const statuses = records.map((record) => record.status);
  for (const status of ["interrupted", "broken", "timeout", "fail"] as Status[]) {
    if (statuses.includes(status)) return status;
  }
  return "pass";
}

function ran(record: StageRecord): boolean {
  return record.status !== "skipped" && record.status !== "not-run";
}

function exitCode(status: Status, exitZero?: boolean): number {
  if (status === "pass") return 0;
  if (status === "fail" && exitZero) return 0;
  return 1;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function saveState(dir: string, state: PipelineState): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, STATE), `${JSON.stringify(state, null, 2)}\n`);
}

function note(message: string): void {
  process.stderr.write(`${message}\n`);
}

type Env = Record<string, string | undefined>;

export type Status = "pass" | "fail" | "broken" | "timeout" | "skipped" | "interrupted" | "not-run" | "running";

export interface PipelineOptions {
  name: string;
  dir?: string;
  dryRun?: boolean;
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

/** What `pipeline.json` holds: the round, each stage's result, and the rounds before. */
export interface PipelineState {
  name: string;
  round: number;
  commit: string | null;
  since: string | null;
  status: Status;
  reason?: string;
  stages: StageRecord[];
  rounds: Array<{ round: number; commit: string | null; status: Status }>;
  /** What this round wrote into the folder, cleared when the next round starts. */
  created?: string[];
}

export interface StageRecord extends StageResult {
  id: string;
  seconds?: number;
  items?: Array<StageResult & { item: string }>;
}

interface StageResult {
  status: Status;
  reason?: string;
  report?: string;
  log?: string;
}

interface Plan {
  pipeline: PipelineConfig;
  dir: string;
  state: PipelineState;
  gates: Map<string, boolean>;
  env: Env;
  reporting: Reporting;
  options: PipelineOptions;
  cwd: string;
}

interface Once {
  suffix: string;
  item?: string;
  resumed: boolean;
  reporter: boolean;
}

interface Launched {
  code: number;
  timedOut: boolean;
  interrupted: boolean;
}

interface Reporting {
  /** Destinations the reporting stage takes as they are. */
  passed: string[];
  /** Markdown paths: the stage writes its own report, copied there after. */
  copies: string[];
}

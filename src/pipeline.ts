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

import { headCommit, readChanges, type Changes } from "./changes.js";
import { checkGates, expand } from "./gates.js";
import { UsageError } from "./model.js";
import { parseDestinations, preflight } from "./output.js";
import {
  listBundled,
  parsePipeline,
  resolvePipelinePath,
  stageFiles,
  type Pipeline,
  type Stage,
} from "./pipeline-file.js";

const STATE = "pipeline.json";
const COPY = "pipeline.yml";
const SESSIONS = ".sessions";
const CHANGES = "changes.txt";
const OWN = [STATE, COPY, SESSIONS];
const STOPPED = ["broken", "timeout", "interrupted", "running"];
const KILL_GRACE_MS = 5_000;
// A job-level reply, thread or session file belongs to a single task, never to
// every stage of a pipeline.
const JOB_ONLY = ["TESTEIYA_FOLLOW_UP", "TESTEIYA_THREAD", "TESTEIYA_SESSION_FILE"];
const RETRY_NOTE =
  "This stage stopped before it finished. Go on from where you stopped. Files you already wrote are in the pipeline folder.";

export function runPipelineList(json?: boolean): number {
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

export async function runPipeline(options: PipelineOptions): Promise<number> {
  const cwd = process.cwd();
  const source = resolvePipelinePath(options.name);
  const named = parsePipeline(readFileSync(source, "utf8"), source);
  const dir = folder(options, named.name);
  if (dir === cwd || cwd.startsWith(dir + sep)) {
    throw new UsageError("--dir must be a folder of its own, not the checkout or a folder above it");
  }

  const previous = readState(dir);
  const commit = await headCommit(cwd);
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

  pipeline = withJobGates(pipeline, options.gates ?? {});

  let round = history.length + 1;
  let since = history.at(-1)?.commit ?? null;
  if (retry || again) {
    round = previous!.round;
    since = previous!.since;
  }

  const aiProblem = needsAi(pipeline) ? await aiReady(options) : null;
  if (aiProblem && !options.dryRun) throw new UsageError(aiProblem);

  const env = stageEnv(pipeline, options.sets ?? {}, { dir, round });
  const changes = await readChanges(cwd, since, env);
  const used = [...pipeline.when, ...pipeline.stages.flatMap((stage) => stage.when)];
  // A shallow clone cannot say what changed, and a silent skip would look like a quiet pull request.
  if (!changes.files && used.some((name) => pipeline.gates[name]!.changes)) {
    throw new UsageError(`cannot read the changes: ${changes.error}. Check out with full history (fetch-depth: 0)`);
  }
  const gates = await checkGates(pipeline.gates, used, { cwd, env, changes });

  note(`  Pipeline ${c.bold(pipeline.name)} ${c.dim("·")} round ${round} ${c.dim("·")} ${describeChanges(changes)}`);
  note(c.dim(`  ${dir}`));

  const blocked = pipeline.when.find((name) => !gates.get(name));
  if (blocked) {
    const reason = pipeline.gates[blocked]!.message;
    note(`  ${c.yellow("⨯")} skipped: ${reason}`);
    if (options.dryRun) return 0;
    saveState(dir, { name: pipeline.name, round, commit, since, status: "skipped", reason, stages: [], rounds: history });
    if (options.json) process.stdout.write(`${JSON.stringify(readState(dir), null, 2)}\n`);
    return 0;
  }

  // After the skip: a job gated on a pull request may name one that only exists when the gate passes.
  const reporting = await splitDestinations(options.outputs ?? []);
  if (options.dryRun) return dryRun(pipeline, gates, aiProblem);

  mkdirSync(dir, { recursive: true });
  let created: string[] = previous?.created ?? [];
  if (!retry) {
    for (const name of created) rmSync(join(dir, name), { recursive: true, force: true });
    created = [];
    writeFileSync(join(dir, COPY), readFileSync(source, "utf8"));
  }
  if (changes.files) writeFileSync(join(dir, CHANGES), `${changes.files.join("\n")}\n`);
  checkInputs(pipeline, dir);

  const run: RunContext = {
    dir,
    cwd,
    env,
    options,
    reporting,
    cli: options.cli ?? fileURLToPath(new URL("./cli.js", import.meta.url)),
    current: null,
    interrupted: false,
  };
  process.on("SIGINT", () => {
    run.interrupted = true;
    if (run.current) killGroup(run.current, "SIGINT");
  });

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
  const existing = new Set(readdirSync(dir));
  const save = () => {
    const made = readdirSync(dir).filter((name) => !existing.has(name) && !OWN.includes(name));
    state.created = [...new Set([...created, ...made, CHANGES])];
    saveState(dir, state);
  };
  save();

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

    const closed = stage.when.find((name) => !gates.get(name));
    if (closed) {
      skip(record, pipeline.gates[closed]!.message);
      stopped = stage.stopOn.includes("gate");
      save();
      continue;
    }
    if (stage.run && inputsSkipped(stage, pipeline, state)) {
      skip(record, "its inputs come from skipped stages");
      save();
      continue;
    }

    const reporter = pipeline.stages.length === 1;
    await runStage(run, stage, record, state, pipeline, reporter);
    save();
    const status = record.status as Status;
    if (status === "interrupted") break;
    if (status === "broken" || status === "timeout") stopped = true;
    if (status === "fail" && stage.stopOn.includes("fail")) stopped = true;
  }

  if (run.interrupted) {
    state.status = "interrupted";
    for (const record of state.stages) if (record.status === "running") record.status = "interrupted";
    save();
    note(c.yellow("\n  ⨯ interrupted"));
    return 130;
  }

  state.status = verdict(state.stages);
  save();
  if (pipeline.stages.length > 1 && state.stages.some(ran)) {
    const record: StageRecord = { id: "summary", status: "not-run" };
    state.stages.push(record);
    await runStage(run, summaryStage(pipeline, state), record, state, pipeline, true);
    // The verdict came from the stages; the summary only explains it.
    if (record.status === "fail") {
      record.status = "pass";
      delete record.reason;
    }
    if (run.interrupted) {
      state.status = "interrupted";
      save();
      return 130;
    }
    state.status = verdict(state.stages);
  }

  state.rounds = [...history.filter((entry) => entry.round !== round), { round, commit, status: state.status }];
  save();
  if (options.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  return exitCode(state.status, options.exitZero);
}

async function runStage(
  run: RunContext,
  stage: Stage,
  record: StageRecord,
  state: PipelineState,
  pipeline: Pipeline,
  reporter: boolean
): Promise<void> {
  const resumed = STOPPED.includes(record.status);
  const items = loopItems(stage, run.dir);
  if (items && items.length === 0) {
    skip(record, emptyLoop(stage));
    return;
  }

  const started = Date.now();
  record.status = "running";
  if (!items) {
    const result = await runOnce(run, stage, { suffix: "", resumed, state, pipeline, reporter });
    Object.assign(record, result);
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
      const result = await runOnce(run, stage, {
        suffix: `.${index + 1}`,
        item,
        resumed: again,
        state,
        pipeline,
        reporter,
      });
      record.items.push({ item, ...result });
      if (result.status === "broken" || result.status === "timeout" || result.status === "interrupted") break;
    }
    record.status = verdict(record.items);
    joinItems(run.dir, stage, record);
  }
  record.seconds = Math.round((Date.now() - started) / 1000);

  if (record.status === "pass" || record.status === "fail") {
    const missing = stage.outputs.filter((output) => !existsSync(join(run.dir, output)));
    if (missing.length > 0) {
      record.status = "broken";
      record.reason = `did not write ${missing.join(", ")}`;
    }
  }
  line(record);
}

async function runOnce(run: RunContext, stage: Stage, once: Once): Promise<StageResult> {
  const env: Env = { ...run.env };
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
    const done = await launch(run, stage.run, null, env, join(run.dir, log), stage.timeout);
    return { ...outcome(done, done.code === 0 ? "pass" : "fail", `exit ${done.code}`), log };
  }

  const report = `${base}.md`;
  const envelope = `${base}.json`;
  rmSync(join(run.dir, report), { force: true });
  rmSync(join(run.dir, envelope), { force: true });

  const args = [run.cli, "task"];
  if (!once.reporter) args.push("--no-thread");
  args.push("-o", join(run.dir, report), "-o", join(run.dir, envelope));
  if (once.reporter) args.push(...reporterArgs(run));
  if (stage.session) args.push("--session-file", join(run.dir, SESSIONS, `${stage.session}.jsonl`));
  if (!stage.session) args.push("--no-session");
  if (run.options.model) args.push("--model", run.options.model);
  if (once.resumed && stage.session) args.push("--followup", RETRY_NOTE);
  const task = composeTask(stage, env, run.dir, once);
  args.push("--", task);
  note(c.dim(`  $ testeiya ${args.slice(1, -1).join(" ")} "${task.split("\n")[0]}…"`));

  const done = await launch(run, process.execPath, args, env, null, stage.timeout);
  const result = readEnvelope(join(run.dir, envelope));
  if (once.reporter) copyReport(run, join(run.dir, report));
  if (done.code === 2) return { ...outcome(done, "broken", "bad usage, see the log above"), report };
  if (!result) return { ...outcome(done, "broken", "it wrote no result"), report };
  return { ...outcome(done, result.status === "fail" ? "fail" : "pass", result.reason), report };
}

function outcome(done: Launched, status: Status, reason?: string | null): StageResult {
  if (done.interrupted) return { status: "interrupted" };
  if (done.timedOut) return { status: "timeout", reason: "ran past its timeout" };
  const result: StageResult = { status };
  if (status !== "pass" && reason) result.reason = reason;
  return result;
}

/** The task, then where its files are, so the model never guesses a path. */
function composeTask(stage: Stage, env: Env, dir: string, once: Once): string {
  const lines = [`Pipeline folder: ${dir}`];
  const wanted = [...stage.inputs];
  if (stage.eachLine) wanted.push(stage.eachLine);
  const present = wanted.filter((input) => existsSync(join(dir, input)));
  const absent = wanted.filter((input) => !present.includes(input));
  if (present.length > 0) lines.push(`Read these first: ${present.join(", ")}`);
  if (stage.outputs.length > 0) lines.push(`Write these files: ${stage.outputs.map((output) => expand(output, env)).join(", ")}`);
  for (const input of absent) lines.push(`Not available: ${input} (${whyMissing(input, once.pipeline, once.state)})`);
  return `${expand(stage.task ?? "", env).trim()}\n\n${lines.join("\n")}`;
}

function whyMissing(input: string, pipeline: Pipeline, state: PipelineState): string {
  const producer = pipeline.stages.find((stage) => produces(stage, input));
  if (!producer) return "not found";
  const record = state.stages.find((entry) => entry.id === producer.id);
  if (record?.status === "skipped") return `stage ${producer.id} skipped: ${record.reason}`;
  return `stage ${producer.id} did not write it`;
}

function summaryStage(pipeline: Pipeline, state: PipelineState): Stage {
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

function reporterArgs(run: RunContext): string[] {
  const args: string[] = [];
  for (const output of run.reporting.passed) args.push("-o", output);
  if (run.options.thread) args.push("--thread", run.options.thread);
  if (run.options.header !== undefined) args.push("--header", run.options.header);
  if (run.options.footer !== undefined) args.push("--footer", run.options.footer);
  if (run.options.noDefaultFooter) args.push("--no-default-footer");
  return args;
}

// The stage already writes its own markdown report, and a task takes only one.
function copyReport(run: RunContext, report: string): void {
  if (!existsSync(report)) return;
  for (const path of run.reporting.copies) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    copyFileSync(report, path);
  }
}

/** Gates passed with --gate join `when`: the CI job decides if the run happens at all. */
function withJobGates(pipeline: Pipeline, extra: Record<string, string>): Pipeline {
  const gates = { ...pipeline.gates };
  const when = [...pipeline.when];
  for (const [name, run] of Object.entries(extra)) {
    if (gates[name]) throw new UsageError(`--gate ${name}: the pipeline already defines this gate`);
    gates[name] = { run, message: `The ${name} gate did not pass.` };
    when.push(name);
  }
  return { ...pipeline, gates, when };
}

// Checked before the first stage, like any task: a run that cannot post spends nothing.
async function splitDestinations(outputs: string[]): Promise<Reporting> {
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

function launch(
  run: RunContext,
  command: string,
  args: string[] | null,
  env: Env,
  log: string | null,
  timeout?: number
): Promise<Launched> {
  return new Promise((done) => {
    const options: SpawnOptions = { cwd: run.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] };
    let child: ChildProcess;
    if (args) child = spawn(command, args, options);
    else child = spawn(command, { ...options, shell: true });
    run.current = child;

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
      run.current = null;
      file?.end();
      done({ code, timedOut, interrupted: run.interrupted });
    };
    child.on("error", (err) => {
      forward(Buffer.from(`${err.message}\n`));
      finish(127);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function loopItems(stage: Stage, dir: string): string[] | null {
  if (stage.eachLine) {
    const path = join(dir, stage.eachLine);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (stage.eachFile) return globSync(stage.eachFile, { cwd: dir }).sort();
  return null;
}

function emptyLoop(stage: Stage): string {
  if (stage.eachLine) return `${stage.eachLine} is empty`;
  return `no files match ${stage.eachFile}`;
}

// A loop's items read as one stage to whoever comes next.
function joinItems(dir: string, stage: Stage, record: StageRecord): void {
  const items = record.items ?? [];
  const field = stage.run !== undefined ? "log" : "report";
  const parts = items
    .filter((item) => item[field] && existsSync(join(dir, item[field]!)))
    .map((item) => `## ${item.item}\n\n${readFileSync(join(dir, item[field]!), "utf8").trim()}\n`);
  const file = `${stage.id}.${field === "log" ? "log" : "md"}`;
  writeFileSync(join(dir, file), parts.join("\n"));
  record[field] = file;
}

function inputsSkipped(stage: Stage, pipeline: Pipeline, state: PipelineState): boolean {
  const inputs = [...stage.inputs];
  if (stage.eachLine) inputs.push(stage.eachLine);
  if (inputs.length === 0) return false;
  return inputs.every((input) => {
    const producer = pipeline.stages.find((entry) => produces(entry, input));
    if (!producer) return false;
    return state.stages.find((record) => record.id === producer.id)?.status === "skipped";
  });
}

function produces(stage: Stage, file: string): boolean {
  return stageFiles(stage).includes(file) || stage.outputs.includes(file);
}

/** Every input comes from an earlier stage, the runner, or the folder itself. */
function checkInputs(pipeline: Pipeline, dir: string): void {
  for (const [index, stage] of pipeline.stages.entries()) {
    const inputs = [...stage.inputs];
    if (stage.eachLine) inputs.push(stage.eachLine);
    for (const input of inputs) {
      if (input === CHANGES || existsSync(join(dir, input))) continue;
      if (pipeline.stages.slice(0, index).some((earlier) => produces(earlier, input))) continue;
      throw new UsageError(`stage "${stage.id}" reads ${input}, which no earlier stage writes`);
    }
  }
}

function keptRecord(stage: Stage, previous: PipelineState | null): StageRecord {
  const record = previous?.stages.find((entry) => entry.id === stage.id);
  if (!record) return { id: stage.id, status: "not-run" };
  if (record.status === "pass" || record.status === "fail") return record;
  return { id: stage.id, status: record.status, items: record.items };
}

function stageEnv(pipeline: Pipeline, sets: Record<string, string>, at: { dir: string; round: number }): Env {
  const env: Env = {
    ...process.env,
    ...sets,
    PIPELINE_DIR: at.dir,
    PIPELINE_NAME: pipeline.name,
    PIPELINE_ROUND: String(at.round),
  };
  for (const [key, value] of Object.entries(pipeline.env)) env[key] = expand(value, env);
  Object.assign(env, sets);
  for (const key of JOB_ONLY) delete env[key];
  return env;
}

async function aiReady(options: PipelineOptions): Promise<string | null> {
  if (!options.checkAi) return null;
  try {
    await options.checkAi(options.model);
    return null;
  } catch (err) {
    if (err instanceof UsageError) return err.message;
    throw err;
  }
}

function needsAi(pipeline: Pipeline): boolean {
  return pipeline.stages.length > 1 || pipeline.stages.some((stage) => stage.task !== undefined);
}

function folder(options: PipelineOptions, name: string): string {
  if (options.dir) return resolve(options.dir);
  if (options.dryRun) return join(tmpdir(), `testeiya-${name}`);
  return mkdtempSync(join(tmpdir(), `testeiya-${name}-`));
}

function dryRun(pipeline: Pipeline, gates: Map<string, boolean>, aiProblem: string | null): number {
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

function describeChanges(changes: Changes): string {
  if (!changes.files) return c.dim(`changes unknown: ${changes.error}`);
  return `${changes.files.length} files changed since ${changes.from.slice(0, 12)}`;
}

function skip(record: StageRecord, reason: string): void {
  record.status = "skipped";
  record.reason = reason;
  line(record);
}

function line(record: StageRecord, note_?: string): void {
  const marks: Record<string, string> = {
    pass: c.green("✓"),
    fail: c.red("✗"),
    broken: c.red("✗"),
    timeout: c.red("✗"),
    skipped: c.yellow("⨯"),
  };
  const time = record.seconds !== undefined ? `${record.seconds}s` : "";
  const detail = note_ ?? [record.status, record.reason].filter(Boolean).join(": ");
  note(`  ${marks[record.status] ?? c.dim("·")} ${record.id.padEnd(14)} ${time.padEnd(6)} ${detail}`);
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

function readEnvelope(path: string): { status?: string; reason?: string | null } | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readState(dir: string): PipelineState | null {
  const path = join(dir, STATE);
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

export interface PipelineState {
  name: string;
  round: number;
  commit: string | null;
  since: string | null;
  status: Status | "skipped";
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

interface Once {
  suffix: string;
  item?: string;
  resumed: boolean;
  state: PipelineState;
  pipeline: Pipeline;
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

interface RunContext {
  dir: string;
  cwd: string;
  env: Env;
  options: PipelineOptions;
  reporting: Reporting;
  cli: string;
  current: ChildProcess | null;
  interrupted: boolean;
}

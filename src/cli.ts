#!/usr/bin/env node
import { chalkStderr as c } from "chalk";
import { HELP, parseCliArgs, USAGE, WELCOME, type CliArgs } from "./args.js";
import { Decider, DecisionError } from "./decision.js";
import { runDoctor } from "./doctor.js";
import { runInstallApp } from "./install-app.js";
import { loadEnvFiles, VERSION } from "./env.js";
import { resolveModel, UsageError } from "./model.js";
import { runModels } from "./models.js";
import { runSkills } from "./skills.js";
import { Pipeline } from "./pipeline/pipeline.js";
import { ExtractFields } from "./result.js";
import { runTask } from "./run.js";
import { createRuntime } from "./session.js";
import { runSessions } from "./sessions.js";

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`${err?.message ?? err}\n`);
  process.exit(1);
});

async function main(argv: string[]): Promise<void> {
  process.title = "testeiya";

  const args = parseCliArgs(argv);
  if (args.error) {
    process.stderr.write(`${args.error}\n\n${USAGE}\n`);
    process.exit(2);
  }
  if (args.command === "welcome") {
    process.stdout.write(`${WELCOME}\n`);
    return;
  }
  if (args.command === "usage") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.command === "help") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (args.command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const envSources = loadEnvFiles();
  // --project is a spelling of the env var the MCP server needs, so the rest of
  // the CLI only ever reads the environment.
  if (args.project) process.env.TESTOMATIO_PROJECT_ID = args.project;
  // --mcp the same way, so a pipeline's stages inherit the servers with the env.
  if (args.mcp) process.env.TESTEIYA_MCP_SERVERS = args.mcp;

  try {
    if (args.command === "models") process.exit(await runModels(args.pattern, args.json));
    if (args.command === "skills") process.exit(await runSkills(args.pattern, args.json));
    if (args.command === "doctor") {
      process.exit(await runDoctor({ envSources, json: args.json, probe: args.probe, model: args.model }));
    }
    if (args.command === "sessions") process.exit(await runSessions(process.cwd(), args.json));
    if (args.command === "install-app") process.exit(await runInstallApp({ force: args.force, json: args.json }));
    if (args.command === "decide") process.exit(await decide(args));
    if (args.command === "extract") process.exit(await extract(args));
    if (args.command === "pipeline") process.exit(await pipeline(args));
    if (args.command === "pipeline-check") process.exit(await pipelineCheck(args));
    process.exit(await task(args));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`  ${err.message}\n`);
    process.exit(2);
  }
}

async function task(args: CliArgs): Promise<number> {
  const followUp = args.followUp ?? process.env.TESTEIYA_FOLLOW_UP;
  const prompt = args.prompt ?? (await readStdin());
  if (!prompt.trim() && !followUp?.trim()) {
    process.stderr.write(`  ${args.command} needs something to work on\n\n${USAGE}\n`);
    process.exit(2);
  }

  const controller = new AbortController();
  process.on("SIGINT", () => {
    process.stderr.write(`${c.yellow("\n  ⨯ interrupted")}\n`);
    controller.abort("interrupted");
  });

  const { envelope, code, undelivered } = await runTask(
    {
      prompt,
      followUp,
      outputs: args.outputs ?? [],
      json: args.json,
      brief: args.command === "ask",
      continueLast: args.continueLast,
      resume: args.resume,
      session: args.session,
      sessionFile: args.sessionFile,
      noSession: args.noSession,
      name: args.name,
      model: args.model,
      thread: args.thread,
      header: args.header,
      footer: args.footer,
      noDefaultFooter: args.noDefaultFooter,
      noThread: args.noThread,
      exitZero: args.exitZero,
    },
    { signal: controller.signal }
  );
  // The report is worth more than the destination: never lose it.
  if (undelivered && envelope.report) process.stdout.write(envelope.report);
  if (controller.signal.aborted) return 130;
  return code;
}

/** Exit 0 for yes, 1 for no. A call that failed exits 1 too, so a gate fails closed. */
async function decide(args: CliArgs): Promise<number> {
  const question = args.prompt?.trim();
  if (!question) throw new UsageError('decide needs a yes or no question, e.g. testeiya decide "Can we release?"');
  const threshold = Decider.threshold(args.threshold);
  // Stdin is read when nothing else is given, or named with `--context -`: a
  // job's stdin is often open and empty, and waiting on it would hang the run.
  const contexts = args.contexts ?? [];
  const files = contexts.filter((context) => context !== "-");
  const input = files.length === 0 || contexts.includes("-") ? await readStdin() : "";
  const state = Decider.state(files, input);
  if (Object.keys(state).length === 0) {
    process.stderr.write(c.yellow("  no --context and nothing on stdin: the model judges the question alone\n"));
  }
  const decider = await Decider.create(args.model);
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort("interrupted"));
  try {
    const decision = await decider.decide({ question, state, threshold, signal: controller.signal });
    if (args.json) process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    else process.stdout.write(`${decision.answer}\n`);
    const mark = decision.answer === "yes" ? c.green("✓ yes") : c.red("✗ no");
    process.stderr.write(`  ${mark} ${c.dim(`· p=${decision.probability.toFixed(2)} · ${decision.model}`)}\n`);
    return decision.answer === "yes" ? 0 : 1;
  } catch (err) {
    if (controller.signal.aborted) return 130;
    if (!(err instanceof DecisionError)) throw err;
    process.stderr.write(`  ${c.red(`✗ no answer: ${err.message}`)}\n`);
    if (args.json) process.stdout.write(`${JSON.stringify({ answer: null, error: err.message, question }, null, 2)}\n`);
    return 1;
  }
}

/** The agent finds the values; stdout gets them and nothing else. */
async function extract(args: CliArgs): Promise<number> {
  const prompt = args.prompt ?? (await readStdin());
  if (!prompt.trim()) throw new UsageError('extract needs something to find, e.g. testeiya extract "the deployment url" -o "url: public url"');
  const fields = ExtractFields.parse(args.formats ?? []);
  if (typeof fields === "string") throw new UsageError(fields);

  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort("interrupted"));
  const { envelope, code } = await runTask(
    { prompt, outputs: [], extract: fields, noSession: true, model: args.model },
    { signal: controller.signal }
  );
  if (controller.signal.aborted) return 130;
  const values = envelope.values;
  if (args.json) {
    process.stdout.write(`${JSON.stringify(values ?? null, null, 2)}\n`);
  } else if (values) {
    const unnamed = fields.length === 1 && fields[0]!.name === "value";
    for (const field of fields) process.stdout.write(unnamed ? `${values.value}\n` : `${field.name}: ${values[field.name]}\n`);
  }
  return code;
}

async function pipeline(args: CliArgs): Promise<number> {
  if (!args.pipeline) return Pipeline.list(args.json);
  return new Pipeline({
    name: args.pipeline,
    dir: args.dir,
    dryRun: args.dryRun,
    sets: args.sets,
    gates: args.gates,
    pipelineOverrides: args.pipelineOverrides,
    stageOverrides: args.stageOverrides,
    outputs: args.outputs,
    thread: args.thread,
    header: args.header,
    footer: args.footer,
    noDefaultFooter: args.noDefaultFooter,
    model: args.model,
    exitZero: args.exitZero,
    json: args.json,
    checkAi,
    checkDecider,
  }).run();
}

async function pipelineCheck(args: CliArgs): Promise<number> {
  const { dir, sets, gates, pipelineOverrides, stageOverrides, model, json, diagram } = args;
  return new Pipeline({ name: args.pipeline!, dir, sets, gates, pipelineOverrides, stageOverrides, model, json, diagram, checkAi, checkDecider }).check();
}

async function checkAi(model?: string): Promise<void> {
  try {
    resolveModel(await createRuntime(), model);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    throw new UsageError(`No AI provider: ${err.message}. Run testeiya doctor.`);
  }
}

async function checkDecider(model?: string): Promise<void> {
  try {
    await Decider.create(model);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    throw new UsageError(`No decision model: ${err.message}`);
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

#!/usr/bin/env node
import { HELP, parseCliArgs, USAGE, WELCOME, type CliArgs } from "./args.js";
import { runDoctor } from "./doctor.js";
import { loadEnvFiles, VERSION } from "./env.js";
import { UsageError } from "./model.js";
import { runModels } from "./models.js";
import { runSkills } from "./skills.js";
import { parseDestinations, preflight } from "./output.js";
import { runPrint } from "./run.js";
import { openSessionManager, runSessions } from "./sessions.js";

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

  try {
    if (args.command === "models") process.exit(await runModels(args.pattern, args.json));
    if (args.command === "skills") process.exit(await runSkills(args.pattern, args.json));
    if (args.command === "doctor") {
      process.exit(await runDoctor({ envSources, json: args.json, probe: args.probe, model: args.model }));
    }
    if (args.command === "sessions") process.exit(await runSessions(process.cwd(), args.json));
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

  const destinations = parseDestinations(args.outputs ?? [], args.json);
  if (typeof destinations === "string") throw new UsageError(destinations);
  // Everything a destination needs is checked before a single token is spent.
  const unreachable = await preflight(destinations);
  if (unreachable) throw new UsageError(unreachable);

  // A job-level TESTEIYA_SESSION_FILE must not quietly redirect a run that named
  // its own session on the command line.
  if (!args.session && !args.resume && !args.continueLast) {
    args.sessionFile ??= process.env.TESTEIYA_SESSION_FILE;
  }
  const sessionManager = await openSessionManager(process.cwd(), args);
  if (typeof sessionManager === "string") throw new UsageError(sessionManager);
  if (args.name) sessionManager.appendSessionInfo(args.name);

  let sessionId: string | null = null;
  if (!args.noSession) sessionId = sessionManager.getSessionId();

  const brief = args.command === "ask";
  return runPrint({
    prompt,
    followUp,
    destinations,
    sessionManager,
    sessionId,
    brief,
    model: args.model,
    exitZero: args.exitZero,
    header: args.header,
    footer: args.footer,
    noDefaultFooter: args.noDefaultFooter,
  });
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

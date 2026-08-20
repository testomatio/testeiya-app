#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCliArgs, USAGE, type CliArgs } from "./args.js";
import { runDoctor } from "./doctor.js";
import { loadEnvFiles } from "./env.js";
import { UsageError } from "./model.js";
import { runModels } from "./models.js";
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
  if (args.command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.command === "version") {
    process.stdout.write(`${version()}\n`);
    return;
  }

  const envSources = loadEnvFiles();
  // --project is a spelling of the env var the MCP server needs, so the rest of
  // the CLI only ever reads the environment.
  if (args.project) process.env.TESTOMATIO_PROJECT_ID = args.project;

  try {
    if (args.command === "models") process.exit(await runModels(args.pattern, args.json));
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
  const prompt = args.prompt ?? (await readStdin());
  if (!prompt.trim()) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }

  const destinations = parseDestinations(args.outputs ?? [], args.json);
  if (typeof destinations === "string") throw new UsageError(destinations);

  // Everything a destination needs is checked before a single token is spent.
  const unreachable = await preflight(destinations);
  if (unreachable) throw new UsageError(unreachable);

  const sessionManager = await openSessionManager(process.cwd(), args);
  if (typeof sessionManager === "string") throw new UsageError(sessionManager);
  if (args.name) sessionManager.appendSessionInfo(args.name);

  let sessionId: string | null = null;
  if (!args.noSession) sessionId = sessionManager.getSessionId();

  return runPrint({ prompt, destinations, sessionManager, sessionId, model: args.model });
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function version(): string {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8")
  );
  return pkg.version;
}

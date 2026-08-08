#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCliArgs, USAGE } from "./args.js";
import { loadEnvFiles } from "./env.js";
import { UsageError } from "./model.js";
import { runPrint } from "./run.js";

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
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.version) {
    process.stdout.write(`${version()}\n`);
    return;
  }

  loadEnvFiles();
  // --project is a spelling of the env var the MCP server needs, so the rest of
  // the CLI only ever reads the environment.
  if (args.project) process.env.TESTOMATIO_PROJECT_ID = args.project;

  // No task and nothing piped in: there is no interactive mode, so this is a
  // usage error rather than a prompt.
  const prompt = args.prompt ?? (await readStdin());
  if (!prompt.trim()) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }

  try {
    process.exit(await runPrint({ prompt, outputFile: args.output, model: args.model }));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`  ${err.message}\n`);
    process.exit(2);
  }
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

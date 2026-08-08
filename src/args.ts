import { parseArgs } from "node:util";

export const USAGE = `testeiya — AI testing agent

Usage:
  testeiya "<task>" [--output <file>]   run one task and exit
  cat task.md | testeiya [--output <file>]

Options:
  -o, --output <file.md>   file the agent must write its report to
  -p, --print <task>       same as passing the task positionally
      --model <id>         provider/model to use (e.g. openrouter/anthropic/claude-sonnet-4.5)
      --project <id>       Testomat.io project id (same as TESTOMATIO_PROJECT_ID)
  -h, --help               show this help
  -v, --version            show version

Runs show progress and errors on stderr; the result is the report file.
Without --output the agent's final answer is printed to stdout instead.

The model is taken from --model, then TESTEIYA_MODEL, then ~/.testeiya/config.json,
then a built-in default. The provider API key comes from the environment,
~/.testeiya/.env, or ~/.testeiya/auth.json.

Set TESTOMATIO to a project API key to work with that Testomat.io project. Add
the project id (--project or TESTOMATIO_PROJECT_ID) and the agent also gets the
Testomat.io tools; with the token alone it uses check-tests and the REST API.

A task starting with "-" must follow "--":  testeiya -- "-weird task"

Exit codes: 0 pass · 1 failed run or verdict · 2 bad usage · 130 interrupted.`;

export function parseCliArgs(argv: string[]): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        output: { type: "string", short: "o" },
        print: { type: "string", short: "p" },
        model: { type: "string" },
        project: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }

  const { values, positionals } = parsed;
  if (values.help) return { help: true };
  if (values.version) return { version: true };

  const parts = [...positionals];
  if (values.print) parts.unshift(values.print);
  const prompt = parts.join(" ").trim();

  const args: CliArgs = {};
  if (prompt) args.prompt = prompt;
  if (values.output) args.output = values.output;
  if (values.model) args.model = values.model;
  if (values.project) args.project = values.project;
  return args;
}

export interface CliArgs {
  prompt?: string;
  output?: string;
  model?: string;
  project?: string;
  help?: boolean;
  version?: boolean;
  /** Set when argv was malformed; the caller prints USAGE and exits 2. */
  error?: string;
}

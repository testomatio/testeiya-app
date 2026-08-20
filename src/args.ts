import { parseArgs, type ParseArgsConfig } from "node:util";

export const USAGE = `testeiya — AI testing agent

Usage:
  testeiya task "<task>" [options]
  testeiya models [pattern]
  testeiya doctor
  testeiya sessions

Task options:
  -o, --output <dest>      where the report goes; repeatable
                             report.md       the agent writes the report there
                             report.json     the run envelope
                             gh:pr-comment   post to this branch's pull request
                             gh:pr#123       post to that pull request
      --model <id>         provider/model, e.g. openrouter/anthropic/claude-sonnet-5
      --project <id>       Testomat.io project id (same as TESTOMATIO_PROJECT_ID)
  -c, --continue           continue the last session in this folder
      --resume <id>        continue that session
      --name <label>       name the session
      --no-session         do not save the session

Other options:
      --json               machine-readable output, on every command
      --probe              doctor only: spend one tiny request to test the key
  -h, --help               show this help
  -v, --version            show version

Progress and errors go to stderr. Without --output the report goes to stdout.

Pass a model with --model or TESTEIYA_MODEL; a resumed run reuses its session's
model. The provider key comes from the environment, ~/.testeiya/.env, or
~/.testeiya/auth.json.

Set TESTOMATIO to a project API key to work with that Testomat.io project. Add
the project id (--project or TESTOMATIO_PROJECT_ID) and the agent also gets the
Testomat.io tools; with the token alone it uses check-tests and the REST API.

A task starting with "-" must follow "--":  testeiya task -- "-weird task"

Exit codes: 0 pass · 1 failed run or verdict · 2 bad usage · 130 interrupted.`;

export const COMMANDS = ["task", "models", "doctor", "sessions"] as const;

export function parseCliArgs(argv: string[]): CliArgs {
  const first = argv[0];
  if (!first || first === "-h" || first === "--help") return { command: "help" };
  if (first === "-v" || first === "--version") return { command: "version" };
  if (!isCommand(first)) return { error: unknownCommand(first) };

  const options = OPTIONS[first];
  let parsed;
  try {
    parsed = parseArgs({ args: argv.slice(1), options, allowPositionals: true, strict: true });
  } catch (err) {
    if (err instanceof Error) return { error: err.message };
    return { error: String(err) };
  }

  const values = parsed.values as Record<string, unknown>;
  if (values.help) return { command: "help" };

  const args: CliArgs = { command: first };
  const text = parsed.positionals.join(" ").trim();
  if (first === "task" && text) args.prompt = text;
  if (first === "models" && text) args.pattern = text;
  if (Array.isArray(values.output)) args.outputs = values.output as string[];
  if (values.json) args.json = true;
  if (values.probe) args.probe = true;
  if (typeof values.model === "string") args.model = values.model;
  if (typeof values.project === "string") args.project = values.project;
  if (values.continue) args.continueLast = true;
  if (typeof values.resume === "string") args.resume = values.resume;
  if (typeof values.name === "string") args.name = values.name;
  if (values["no-session"]) args.noSession = true;
  return args;
}

const HELP = { type: "boolean", short: "h" } as const;
const JSON_FLAG = { type: "boolean" } as const;

const OPTIONS: Record<Command, ParseArgsConfig["options"]> = {
  task: {
    output: { type: "string", short: "o", multiple: true },
    json: JSON_FLAG,
    model: { type: "string" },
    project: { type: "string" },
    continue: { type: "boolean", short: "c" },
    resume: { type: "string" },
    name: { type: "string" },
    "no-session": { type: "boolean" },
    help: HELP,
  },
  models: { json: JSON_FLAG, help: HELP },
  doctor: { json: JSON_FLAG, probe: { type: "boolean" }, model: { type: "string" }, help: HELP },
  sessions: { json: JSON_FLAG, help: HELP },
};

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

// The task used to be the first positional, so a bare prompt is the mistake to
// expect. Name the fix rather than printing the whole usage at them.
function unknownCommand(value: string): string {
  if (value.startsWith("-")) return `unknown option "${value}"`;
  return `unknown command "${value}" — did you mean:  testeiya task "${value}"`;
}

export type Command = (typeof COMMANDS)[number];

export interface CliArgs {
  command?: Command | "help" | "version";
  prompt?: string;
  pattern?: string;
  outputs?: string[];
  json?: boolean;
  probe?: boolean;
  model?: string;
  project?: string;
  continueLast?: boolean;
  resume?: string;
  name?: string;
  noSession?: boolean;
  /** Set when argv was malformed; the caller prints the message and exits 2. */
  error?: string;
}

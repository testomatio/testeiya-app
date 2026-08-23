import { parseArgs, type ParseArgsConfig } from "node:util";

export const WELCOME = `
  Testeiya, an AI testing agent.

  testeiya task "analyze this pr and find inconsistencies"
  testeiya ask "is this feature ready"

  testeiya doctor    check your setup
  testeiya --help    options and environment
  testeiya help      the full guide
`;

export const USAGE = `testeiya, an AI testing agent

Usage:
  testeiya task "<task>"      run one task and write a report
  testeiya ask "<question>"   answer a question
  testeiya doctor             check what a run would resolve
  testeiya models [pattern]   list the models your key can reach
  testeiya skills [pattern]   list the skills bundled with this package
  testeiya sessions           list saved sessions for this folder

Options:
  -o, --output <dest>   report destination, repeatable: file.md, file.json, gh:pr-comment
      --model <id>      provider/model to run
      --project <id>    Testomat.io project id
  -c, --continue        continue the last session in this folder
      --resume <id>     continue that session
      --session <label> continue the session with that name, or start it
      --name <label>    name the session
      --no-session      do not save the session
      --exit-zero       a negative verdict exits 0
      --footer <text>   line added under a posted comment
      --json            machine-readable output
      --probe           doctor only: test the key with one request
  -h, --help            show this
  -v, --version         show version

Environment:
  TESTEIYA_MODEL          model to run, e.g. openrouter/anthropic/claude-sonnet-5
  OPENROUTER_API_KEY      provider key, also ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
  TESTOMATIO              Testomat.io project API key
  TESTOMATIO_PROJECT_ID   Testomat.io project id, same as --project
  TESTOMATIO_URL          Testomat.io base url, for self-hosted

Run "testeiya help" for the full guide.`;

export const HELP = `${USAGE}

Running a task

  The agent runs one task and exits. There is no interactive mode. Progress and
  errors go to stderr, so a run drops into CI as-is.

  A task can also come from stdin:  cat task.md | testeiya task
  A task starting with "-" must follow "--":  testeiya task -- "-weird task"

  Exit codes: 0 pass, 1 failed run or negative verdict, 2 bad usage, 130 interrupted.

  --exit-zero keeps a negative verdict from failing the command: a broken run
  still exits 1 and bad usage still exits 2. The verdict is still in the report
  and in the run envelope, so a pipeline can gate on it when it wants to.

Where the report goes

  --output names a destination and can repeat. Without one the report goes to
  stdout. --json prints the run envelope to stdout instead.

  report.md       the agent writes the report there
  run.json        the run envelope: verdict, reason, report, tokens, session id
  gh:pr-comment   posted on this branch's pull request, through the GitHub CLI
  gh:pr#123       posted on that pull request

  --footer adds a line under a posted comment, and nowhere else. Use it to say
  how to answer the comment, e.g. --footer "> Reply with /testeiya to continue."

  Every destination is checked before the run starts, so a missing gh costs no
  tokens.

Models and keys

  There is no default model. Pass --model or set TESTEIYA_MODEL. A resumed run
  reuses its session's model. "testeiya models" lists what your key can reach.

  The provider key comes from the environment, from ~/.testeiya/.env, or from
  ~/.testeiya/auth.json, which is the file the desktop app's Settings dialog
  writes.

Sessions

  Runs are saved under ~/.testeiya, so a follow-up picks up where the last one
  stopped. -c continues the last session in this folder, --resume <id> picks
  another, --name labels one, and --no-session saves nothing.

  --session <label> is the one for a job that runs again and again: it continues
  the session with that name, and starts it the first time. Give each thread its
  own label and they never mix.

Skills

  The package ships the skills the agent reads, and only those: skills found in
  the folder it runs in are ignored, so a checkout cannot hand it its own.
  "testeiya skills" lists them. Name one in the task to use it, e.g. a task
  ending in "/qa-thinking".

Testomat.io

  Set TESTOMATIO to a project API key and the agent reads and writes that
  project's tests, suites, runs and plans through check-tests and the REST API.
  Add the project id, with --project or TESTOMATIO_PROJECT_ID, and it also gets
  the Testomat.io tools. The MCP server needs the id: a token alone does not say
  which project to talk to.`;

export const COMMANDS = ["task", "ask", "models", "skills", "doctor", "sessions", "help"] as const;

export function parseCliArgs(argv: string[]): CliArgs {
  const first = argv[0];
  if (!first) return { command: "welcome" };
  if (first === "-h" || first === "--help") return { command: "usage" };
  if (first === "-v" || first === "--version") return { command: "version" };
  if (!isCommand(first)) return { error: unknownCommand(first) };
  if (first === "help") return { command: "help" };

  const options = OPTIONS[first];
  let parsed;
  try {
    parsed = parseArgs({ args: argv.slice(1), options, allowPositionals: true, strict: true });
  } catch (err) {
    if (err instanceof Error) return { error: err.message };
    return { error: String(err) };
  }

  const values = parsed.values as Record<string, unknown>;
  if (values.help) return { command: "usage" };

  const args: CliArgs = { command: first };
  const text = parsed.positionals.join(" ").trim();
  if ((first === "task" || first === "ask") && text) args.prompt = text;
  if ((first === "models" || first === "skills") && text) args.pattern = text;
  if (Array.isArray(values.output)) args.outputs = values.output as string[];
  if (values.json) args.json = true;
  if (values.probe) args.probe = true;
  if (typeof values.model === "string") args.model = values.model;
  if (typeof values.project === "string") args.project = values.project;
  if (values.continue) args.continueLast = true;
  if (typeof values.resume === "string") args.resume = values.resume;
  if (typeof values.session === "string") args.session = values.session;
  if (typeof values.name === "string") args.name = values.name;
  if (values["no-session"]) args.noSession = true;
  if (values["exit-zero"]) args.exitZero = true;
  if (typeof values.footer === "string") args.footer = values.footer;
  if (args.session && (args.continueLast || args.resume || args.name || args.noSession)) {
    return { error: "--session already names and continues a session" };
  }
  return args;
}

const HELP_FLAG = { type: "boolean", short: "h" } as const;
const JSON_FLAG = { type: "boolean" } as const;

const RUN_OPTIONS: ParseArgsConfig["options"] = {
  output: { type: "string", short: "o", multiple: true },
  json: JSON_FLAG,
  model: { type: "string" },
  project: { type: "string" },
  continue: { type: "boolean", short: "c" },
  resume: { type: "string" },
  session: { type: "string" },
  name: { type: "string" },
  "no-session": { type: "boolean" },
  "exit-zero": { type: "boolean" },
  footer: { type: "string" },
  help: HELP_FLAG,
};

const OPTIONS: Record<Command, ParseArgsConfig["options"]> = {
  task: RUN_OPTIONS,
  ask: RUN_OPTIONS,
  models: { json: JSON_FLAG, help: HELP_FLAG },
  skills: { json: JSON_FLAG, help: HELP_FLAG },
  doctor: { json: JSON_FLAG, probe: { type: "boolean" }, model: { type: "string" }, help: HELP_FLAG },
  sessions: { json: JSON_FLAG, help: HELP_FLAG },
  help: {},
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
  command?: Command | "welcome" | "usage" | "version";
  prompt?: string;
  pattern?: string;
  outputs?: string[];
  json?: boolean;
  probe?: boolean;
  model?: string;
  project?: string;
  continueLast?: boolean;
  resume?: string;
  session?: string;
  name?: string;
  noSession?: boolean;
  exitZero?: boolean;
  footer?: string;
  /** Set when argv was malformed; the caller prints the message and exits 2. */
  error?: string;
}

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
  -o, --output <dest>        report destination, repeatable: file.md, file.json, gh:pr-comment
      --model <id>           provider/model to run
      --project <id>         Testomat.io project id
      --followup <text>      the user's reply, added to the task as a new message
  -c, --continue             continue the last session in this folder
      --resume <id>          continue that session
      --session <label>      continue the session with that name, or start it
      --session-file <path>  keep the session in that file, for CI caches
      --name <label>         name the session
      --no-session           do not save the session
      --exit-zero            a negative verdict exits 0
      --header <text>        line added above the report
      --footer <text>        line added under the report
      --no-default-footer    do not sign the report
      --json                 machine-readable output
      --probe                doctor only: test the key with one request
  -h, --help                 show this
  -v, --version              show version

Environment:
  TESTEIYA_MODEL              model to run, e.g. openrouter/anthropic/claude-sonnet-5
  TESTEIYA_FOLLOW_UP          the user's reply, same as --followup
  TESTEIYA_SESSION_FILE       where to keep the session, same as --session-file
  TESTEIYA_NO_DEFAULT_FOOTER  do not sign the report
  OPENROUTER_API_KEY          provider key, also ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
  TESTOMATIO                  Testomat.io project API key
  TESTOMATIO_PROJECT_ID       Testomat.io project id, same as --project
  TESTOMATIO_URL              Testomat.io base url, for self-hosted

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

  --footer adds a line under the report and --header adds one above. Both go
  wherever the report goes: stdout, the file, the posted comment. Use --footer
  to say how to answer a comment, e.g. --footer "> Reply with /testeiya".

  The report is signed, unless you write your own footer:

    *🧚🏻‍♀️ Provided by [Testeiya QA Agent](https://testomat.ai/testeiya) & <model>*

  --no-default-footer drops the signature, so does TESTEIYA_NO_DEFAULT_FOOTER.

  Every destination is checked before the run starts, so a missing gh costs no
  tokens.

Models and keys

  There is no default model. Pass --model or set TESTEIYA_MODEL. A resumed run
  reuses its session's model. "testeiya models" lists what your key can reach.

  The provider key comes from the environment, from ~/.testeiya/.env, or from
  ~/.testeiya/auth.json, which is the file the desktop app's Settings dialog
  writes.

Answering a reply

  --followup carries what the user said back to the agent. The task stays the
  standing instruction and the reply is added under it as a new user message,
  so one command serves both the first round and every answer after it.

  Set TESTEIYA_FOLLOW_UP instead when the text is a comment body: an empty
  value is ignored, so the same job runs unchanged when nobody replied.

    TESTEIYA_FOLLOW_UP="\${{ github.event.comment.body || '' }}" \\
      testeiya task "Review this pull request" --session pr-42 -o gh:pr-comment

  Pair it with --session <label> and the agent answers with its earlier work in
  front of it. Without a session the reply is still delivered, just without the
  thread behind it.

Sessions

  Runs are saved under ~/.testeiya, so a follow-up picks up where the last one
  stopped. -c continues the last session in this folder, --resume <id> picks
  another, --name labels one, and --no-session saves nothing.

  --session <label> is for a job that runs again and again on the same machine:
  it continues the session with that name, and starts it the first time. Give
  each thread its own label and they never mix.

  --session-file <path> is the one for CI. The whole session is that one file,
  so a runner that keeps nothing carries it between rounds as a cache or an
  artifact. It is written the first time and continued after that, with no
  "does it exist yet" branch. Keep it out of the working tree, or ignore it
  there, so the agent does not read its own transcript back as a file.

    testeiya task "Review this pull request" --session-file .cache/pr-42.jsonl

  A saved session also records the commit it ran on, its branch and origin, and
  the pull request it posted to. When the next round opens it on a newer commit,
  the agent is told the range it has not read and reads that first. On a pull
  request it is also told to read the comments added since. A round that broke
  records nothing, so the one after it still catches up from where work stopped.
  That history rides inside the session, so restoring it is all a round needs.
  The checkout still needs enough history to reach the commit it stopped on.

Skills

  The package ships the skills the agent reads, and only those: skills found in
  the folder it runs in are ignored, so a checkout cannot hand it its own.
  "testeiya skills" lists them. Name one in the task with a slash and it is
  loaded before the run, e.g. "/qa-thinking". A name we do not ship is left
  alone, so a stray "/word" in the task is just a word.

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
  if (typeof values.followup === "string") args.followUp = values.followup;
  if (values.continue) args.continueLast = true;
  if (typeof values.resume === "string") args.resume = values.resume;
  if (typeof values.session === "string") args.session = values.session;
  if (typeof values["session-file"] === "string") args.sessionFile = values["session-file"];
  if (typeof values.name === "string") args.name = values.name;
  if (values["no-session"]) args.noSession = true;
  if (values["exit-zero"]) args.exitZero = true;
  if (typeof values.header === "string") args.header = values.header;
  if (typeof values.footer === "string") args.footer = values.footer;
  if (values["no-default-footer"]) args.noDefaultFooter = true;
  if (args.session && (args.continueLast || args.resume || args.name || args.noSession)) {
    return { error: "--session already names and continues a session" };
  }
  if (args.sessionFile && (args.session || args.continueLast || args.resume || args.noSession)) {
    return { error: "--session-file already says which session to continue" };
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
  followup: { type: "string" },
  continue: { type: "boolean", short: "c" },
  resume: { type: "string" },
  session: { type: "string" },
  "session-file": { type: "string" },
  name: { type: "string" },
  "no-session": { type: "boolean" },
  "exit-zero": { type: "boolean" },
  header: { type: "string" },
  footer: { type: "string" },
  "no-default-footer": { type: "boolean" },
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
  followUp?: string;
  continueLast?: boolean;
  resume?: string;
  session?: string;
  sessionFile?: string;
  name?: string;
  noSession?: boolean;
  exitZero?: boolean;
  header?: string;
  footer?: string;
  noDefaultFooter?: boolean;
  /** Set when argv was malformed; the caller prints the message and exits 2. */
  error?: string;
}

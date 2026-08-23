import { spawn } from "node:child_process";
import { access, constants, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const GH_SCHEME = "gh:";

/**
 * Where the report goes. Only known schemes are recognised: a generic
 * `<word>:` test would swallow `C:\reports\out.md` on Windows.
 */
export function parseDestinations(values: string[], json?: boolean): Destination[] | string {
  const destinations: Destination[] = [];
  for (const value of values) {
    const destination = parseOne(value.trim());
    if (typeof destination === "string") return destination;
    destinations.push(destination);
  }
  if (destinations.filter((d) => d.kind === "markdown").length > 1) {
    return "only one markdown --output — the agent writes that file itself";
  }
  if (json) destinations.push({ kind: "json" });
  if (destinations.length === 0) destinations.push({ kind: "stdout" });
  return destinations;
}

/** The file the agent is told to write, if any. */
export function markdownPath(destinations: Destination[]): string | undefined {
  for (const destination of destinations) {
    if (destination.kind === "markdown") return destination.path;
  }
  return undefined;
}

/**
 * Check every destination before the run starts. A ten-minute run that then
 * cannot post is the worst outcome, so this spends no tokens to find out.
 */
export async function preflight(destinations: Destination[]): Promise<string | null> {
  for (const destination of destinations) {
    const path = filePath(destination);
    if (path) {
      const dir = dirname(resolve(path));
      const writable = await access(dir, constants.W_OK).then(pass, fail);
      if (!writable) return `cannot write to ${dir}`;
    }
    if (destination.kind !== "gh") continue;
    const gh = await run("gh", ["--version"]);
    if (gh.code !== 0) return "gh is not installed — see https://cli.github.com";
    const pr = await resolvePullRequest(destination.pr);
    if (!pr) return "no pull request for this branch — pass gh:pr#<number>";
    destination.pr = pr;
  }
  return null;
}

/** Route the finished report. Returns a message when a destination failed. */
export async function deliver(
  destinations: Destination[],
  envelope: RunEnvelope,
  footer?: string
): Promise<string | null> {
  for (const destination of destinations) {
    const failure = await deliverOne(destination, envelope, footer);
    if (failure) return failure;
  }
  return null;
}

/**
 * The comment as posted. The footer is how a thread stays a thread: it tells
 * the reader what to type to answer this comment.
 */
export function commentBody(report: string, footer?: string): string {
  if (!footer?.trim()) return report;
  return `${report.trimEnd()}\n\n${footer.trim()}\n`;
}

async function deliverOne(
  destination: Destination,
  envelope: RunEnvelope,
  footer?: string
): Promise<string | null> {
  if (destination.kind === "markdown") return null;

  if (destination.kind === "json") {
    const body = `${JSON.stringify(envelope, null, 2)}\n`;
    if (!destination.path) {
      process.stdout.write(body);
      return null;
    }
    const written = await writeFile(destination.path, body, "utf8").then(pass, fail);
    if (!written) return `could not write ${destination.path}`;
    return null;
  }

  if (!envelope.report) return null;

  if (destination.kind === "stdout") {
    process.stdout.write(envelope.report);
    return null;
  }

  const result = await run("gh", ["pr", "comment", String(destination.pr), "--body-file", "-"], {
    stdin: commentBody(envelope.report, footer),
  });
  if (result.code !== 0) return `gh pr comment failed: ${result.stderr.trim() || result.code}`;
  return null;
}

function parseOne(value: string): Destination | string {
  if (!value) return "empty --output";
  if (value.startsWith(GH_SCHEME)) return parseGithub(value.slice(GH_SCHEME.length));
  if (value.endsWith(".json")) return { kind: "json", path: value };
  return { kind: "markdown", path: value };
}

function parseGithub(target: string): Destination | string {
  if (target === "pr" || target === "pr-comment") return { kind: "gh" };
  if (target.startsWith("pr#")) {
    const number = Number(target.slice(3));
    if (Number.isInteger(number) && number > 0) return { kind: "gh", pr: number };
  }
  return `unknown output "gh:${target}" — use gh:pr-comment or gh:pr#123`;
}

function filePath(destination: Destination): string | undefined {
  if (destination.kind === "markdown") return destination.path;
  if (destination.kind === "json") return destination.path;
  return undefined;
}

async function resolvePullRequest(explicit?: number): Promise<number | null> {
  if (explicit) return explicit;

  const fromEvent = await pullRequestFromEvent();
  if (fromEvent) return fromEvent;

  const fromRef = pullRequestFromRef();
  if (fromRef) return fromRef;

  const view = await run("gh", ["pr", "view", "--json", "number", "-q", ".number"]);
  if (view.code !== 0) return null;
  return positive(view.stdout.trim());
}

// GitHub Actions describes the event it triggered on in a file, and that is the
// only place a `pull_request_target` run states its number.
async function pullRequestFromEvent(): Promise<number | null> {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return null;
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw) return null;
  let event: { pull_request?: { number?: number }; issue?: { number?: number } };
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  return event.pull_request?.number ?? event.issue?.number ?? null;
}

function pullRequestFromRef(): number | null {
  const ref = process.env.GITHUB_REF ?? "";
  if (!ref.startsWith("refs/pull/")) return null;
  return positive(ref.split("/")[2] ?? "");
}

function positive(value: string): number | null {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0) return number;
  return null;
}

function run(command: string, args: string[], options?: { stdin?: string }): Promise<Executed> {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => done({ code: 127, stdout, stderr: err.message }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
    if (options?.stdin) child.stdin.write(options.stdin);
    child.stdin.end();
  });
}

function pass(): true {
  return true;
}

function fail(): false {
  return false;
}

export type Destination =
  | { kind: "stdout" }
  | { kind: "markdown"; path: string }
  | { kind: "json"; path?: string }
  | { kind: "gh"; pr?: number };

export interface RunEnvelope {
  status: "pass" | "fail";
  reason: string | null;
  report: string | null;
  reportPath: string | null;
  model: string;
  steps: number;
  tokens: { input: number; output: number };
  durationMs: number;
  sessionId: string | null;
}

interface Executed {
  code: number;
  stdout: string;
  stderr: string;
}

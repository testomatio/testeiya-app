import { access, constants, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { run } from "./exec.js";

const GH_SCHEME = "gh:";
const MARKER = "<!-- testeiya";

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
  envelope: RunEnvelope
): Promise<string | null> {
  for (const destination of destinations) {
    const failure = await deliverOne(destination, envelope);
    if (failure) return failure;
  }
  return null;
}

/**
 * The report as delivered, marker on top, header above it and footer under it.
 * A footer is how a thread stays a thread: it tells the reader what to type to
 * answer a posted comment.
 */
export function decorate(report: string, decoration?: Decoration): string {
  const header = decoration?.header?.trim();
  const footer = decoration?.footer?.trim();
  let body = report.trimEnd();
  if (header) body = `${header}\n\n${body}`;
  if (footer) body = `${body}\n\n${footer}`;
  if (!body.startsWith(MARKER)) body = `${marker(decoration?.session)}\n${body}`;
  return `${body}\n`;
}

/**
 * What signs the text as ours. An HTML comment is invisible wherever markdown
 * renders, and a later round reading the thread back knows which comments it
 * wrote and must not post again.
 */
export function marker(session?: string): string {
  if (!session) return `${MARKER} -->`;
  return `${MARKER} ${session} -->`;
}

/** What signs the report when the caller writes no footer of their own. */
export function defaultFooter(model: string): string {
  return `*🧚🏻‍♀️ Provided by [Testeiya QA Agent](https://testomat.ai/testeiya) & ${modelName(model)}*`;
}

/** The pull request `preflight` resolved, when the report is posted to one. */
export function pullRequestNumber(destinations: Destination[]): number | undefined {
  for (const destination of destinations) {
    if (destination.kind === "gh") return destination.pr;
  }
  return undefined;
}

/** The model name you would recognise, without the provider namespace. */
export function modelName(model: string): string {
  return model.slice(model.lastIndexOf("/") + 1);
}

async function deliverOne(
  destination: Destination,
  envelope: RunEnvelope
): Promise<string | null> {
  // The agent wrote this file, so it is rewritten rather than written: what
  // lands on disk is the same body every other destination gets.
  if (destination.kind === "markdown") {
    if (!envelope.report) return null;
    const written = await writeFile(destination.path, envelope.report, "utf8").then(pass, fail);
    if (!written) return `could not write ${destination.path}`;
    return null;
  }

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
    stdin: envelope.report,
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

function pass(): true {
  return true;
}

function fail(): false {
  return false;
}

export interface Decoration {
  header?: string;
  footer?: string;
  /** Short session id for the marker line. Omitted on an unsaved run. */
  session?: string;
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

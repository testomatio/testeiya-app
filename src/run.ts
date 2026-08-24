import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { chalkStderr as c } from "chalk";
import type { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

import { VERSION } from "./env.js";
import { hasTestomatio } from "./mcp.js";
import { UsageError } from "./model.js";
import {
  decorate,
  defaultFooter,
  deliver,
  markdownPath,
  modelName,
  type Destination,
  type RunEnvelope,
} from "./output.js";
import { shortId } from "./sessions.js";
import { createTesteiyaSession } from "./session.js";
import { expandSkills } from "./skills.js";
import type { RunResult } from "./result.js";

export async function runPrint(options: PrintOptions): Promise<number> {
  const started = Date.now();
  const result: RunResult = {};
  const outputPath = markdownPath(options.destinations);
  const stampBefore = fileStamp(outputPath);
  const cwd = process.cwd();

  let created;
  try {
    created = await createTesteiyaSession({
      cwd,
      result,
      sessionManager: options.sessionManager,
      model: options.model,
      outputFile: outputPath,
      brief: options.brief,
      ...connectionOptions(),
    });
  } catch (err) {
    // A misconfigured model or missing key is bad usage (exit 2), not a failed
    // run — cli.ts turns it into that. Everything else is a failed run.
    if (err instanceof UsageError) throw err;
    note(c.red(`  ✗ ${errorText(err)}`));
    return 1;
  }

  const { session, model, skills } = created;
  const task = expandSkills(options.prompt, skills);
  process.on("SIGINT", () => {
    note(c.yellow("\n  ⨯ interrupted"));
    void session.abort().finally(() => process.exit(130));
  });

  // With nothing but stdout to write to, the answer is the output: one line of
  // run info on stderr, no banner in front of it.
  const verbose = options.destinations.some((destination) => destination.kind !== "stdout");
  if (verbose) {
    note(`  Testeiya ${c.dim(`v${VERSION}`)} ${c.dim("·")} ${model} ${c.dim("·")} ${cwd}`);
    note(c.dim(`  ${skills.length} skills`));
    if (task.loaded.length > 0) note(c.dim(`  ↳ ${task.loaded.join(", ")}`));
    for (const line of describe(options.destinations)) note(c.dim(`  → ${line}`));
    note("");
  }

  const run = watchRun(session);
  await promptOnce(session, task.prompt, run);
  const written = await collectReport(session, run, outputPath, stampBefore, result.status);
  const report = sign(written, options, model);

  run.unsubscribe();
  if (verbose) note("");

  let code = exitCode(run.error, result.status, Boolean(outputPath), report, options.exitZero);
  const envelope: RunEnvelope = {
    status: result.status ?? (code === 0 ? "pass" : "fail"),
    reason: result.reason ?? run.error,
    report,
    reportPath: outputPath ?? null,
    model,
    steps: run.steps,
    tokens: { input: run.input, output: run.output },
    durationMs: Date.now() - started,
    sessionId: options.sessionId ?? null,
  };

  // Nobody is watching this run, so the status goes above the answer rather
  // than after it: the last thing on screen should be the agent's output.
  summarize({ run, result, envelope, started });
  if (willPrint(options.destinations, report)) {
    note(c.dim(`  ${"─".repeat(rule())}`));
    note("");
  }

  const failure = await deliver(options.destinations, envelope);
  if (failure) {
    note(`  ${c.red(`✗ ${failure}`)}`);
    // The report is worth more than the destination: never lose it.
    if (report) process.stdout.write(report);
    code = 1;
  }

  await session.dispose();
  return code;
}

export function exitCode(
  error: string | null,
  status: "pass" | "fail" | undefined,
  wantsReport: boolean,
  report: string | null,
  exitZero?: boolean
): number {
  if (error) return 1;
  // --exit-zero only forgives the verdict. A run that broke still broke, and a
  // pipeline that reads the envelope still sees status "fail".
  if (exitZero) return 0;
  if (status === "fail") return 1;
  if (wantsReport && !report) return 1;
  return 0;
}

// The header and footer go wherever the report goes, so they are added once,
// before anything is delivered.
function sign(report: string | null, options: PrintOptions, model: string): string | null {
  if (!report) return report;
  return decorate(report, { header: options.header, footer: footerFor(options, model) });
}

// Every report says what wrote it, until someone says otherwise.
function footerFor(options: PrintOptions, model: string): string | undefined {
  if (options.footer !== undefined) return options.footer;
  if (options.noDefaultFooter) return undefined;
  if (process.env.TESTEIYA_NO_DEFAULT_FOOTER) return undefined;
  return defaultFooter(model);
}

// A tool name alone says the run is alive and nothing else. The command or the
// path is what a watcher actually reads.
function target(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const values = args as Record<string, unknown>;
  const raw = text(values.command) || text(values.pattern) || text(values.path);
  if (!raw) return "";
  let line = raw.split("\n")[0]!.trim();
  const cwd = `${process.cwd()}/`;
  if (line.startsWith(cwd)) line = line.slice(cwd.length);
  if (line.length <= 64) return line;
  return `${line.slice(0, 63)}…`;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  return "";
}

function pad(name: string): string {
  return name.padEnd(6);
}

function rule(): number {
  const width = process.stderr.columns ?? 60;
  return Math.max(20, Math.min(width - 4, 68));
}

// Only rule off the status when something actually follows it on stdout.
function willPrint(destinations: Destination[], report: string | null): boolean {
  return destinations.some((destination) => {
    if (destination.kind === "json" && !destination.path) return true;
    return destination.kind === "stdout" && Boolean(report);
  });
}

function describe(destinations: Destination[]): string[] {
  const lines: string[] = [];
  for (const destination of destinations) {
    if (destination.kind === "markdown") lines.push(destination.path);
    if (destination.kind === "json") lines.push(destination.path ?? "stdout (json)");
    if (destination.kind === "gh") lines.push(`pull request #${destination.pr}`);
  }
  return lines;
}

// A project token in the environment is the CLI's whole notion of a connection:
// no slugs, nothing pulled per project. `tokenAvailable` renders the section
// that says exactly that, and the TMS rules alongside it.
function connectionOptions(): { connection?: { tokenAvailable: boolean }; backendUrl?: string } {
  if (!hasTestomatio()) return {};
  return {
    connection: { tokenAvailable: true },
    backendUrl: process.env.TESTOMATIO_URL,
  };
}

function watchRun(session: AgentSession): RunState {
  const run: RunState = { steps: 0, input: 0, output: 0, error: null, unsubscribe: () => {} };
  run.unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      run.steps++;
      note(`  ${c.dim("▸")} ${c.cyan(pad(event.toolName))}  ${c.dim(target(event.args))}`);
    }
    if (event.type === "tool_execution_end" && event.isError) {
      note(`  ${c.red("✗")} ${c.red(pad(event.toolName))}`);
    }
    if (event.type === "turn_end" && event.message.role === "assistant") {
      run.input += event.message.usage.input;
      run.output += event.message.usage.output;
      run.error = null;
      if (event.message.stopReason === "error") {
        run.error = event.message.errorMessage || "The model request failed.";
      }
    }
    if (event.type === "agent_end" && event.willRetry) {
      run.error = null;
    }
  });
  return run;
}

async function promptOnce(session: AgentSession, text: string, run: RunState): Promise<void> {
  try {
    await session.prompt(text, { expandPromptTemplates: false });
  } catch (err) {
    run.error = errorText(err);
  }
}

async function collectReport(
  session: AgentSession,
  run: RunState,
  path: string | undefined,
  before: string | null,
  status: "pass" | "fail" | undefined
): Promise<string | null> {
  if (run.error) return null;
  if (!path) return lastAssistantText(session);
  const report = await readIfFresh(path, before);
  if (report) return report;
  if (status === "fail") return null;
  return nudgeForReport(session, run, path, before);
}

async function nudgeForReport(
  session: AgentSession,
  run: RunState,
  path: string,
  before: string | null
): Promise<string | null> {
  note(c.yellow("  ⟳ report missing, asking once more"));
  await promptOnce(
    session,
    `You have not written the report to ${path} yet. Write it now with the write tool: ` +
      `the complete report in markdown, nothing else.`,
    run
  );
  if (run.error) return null;
  const report = await readIfFresh(path, before);
  if (report) return report;
  run.error = `no report written to ${path}`;
  return null;
}

function summarize(s: Summary): void {
  const parts = [elapsed(s.started), modelName(s.envelope.model)];
  if (s.run.steps === 1) parts.push("1 step");
  if (s.run.steps > 1) parts.push(`${s.run.steps} steps`);
  parts.push(`tokens ${tokens(s.run.input)} in / ${tokens(s.run.output)} out`);
  if (s.envelope.sessionId) parts.push(`--resume ${shortId(s.envelope.sessionId)}`);
  const stats = parts.join(` ${c.dim("·")} `);

  if (s.run.error) {
    note(`  ${c.red("✗ failed")} ${c.dim("·")} ${stats}`);
    note(`  ${c.red(s.run.error)}`);
    return;
  }
  if (s.result.status === "fail") {
    note(`  ${c.red("✗ fail")} ${c.dim("·")} ${stats}`);
    if (s.result.reason) note(`  ${c.red(s.result.reason)}`);
    return;
  }
  note(`  ${c.green("✓")} ${stats}`);
}

async function readIfFresh(path: string, before: string | null): Promise<string | null> {
  if (fileStamp(path) === before) return null;
  const text = await readFile(path, "utf8").catch(() => "");
  if (!text.trim()) return null;
  if (text.endsWith("\n")) return text;
  return `${text}\n`;
}

function fileStamp(path: string | undefined): string | null {
  if (!path || !existsSync(path)) return null;
  const stat = statSync(path);
  return `${stat.mtimeMs}:${stat.size}`;
}

function lastAssistantText(session: AgentSession): string | null {
  const messages = session.state.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const parts: string[] = [];
    for (const part of message.content) {
      if (part.type === "text") parts.push(part.text);
    }
    const text = parts.join("").trim();
    if (text) return `${text}\n`;
  }
  return null;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function note(line: string): void {
  process.stderr.write(`${line}\n`);
}

function elapsed(started: number): string {
  const seconds = Math.round((Date.now() - started) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function tokens(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1)}k`;
}

export interface PrintOptions {
  prompt: string;
  destinations: Destination[];
  sessionManager: SessionManager;
  sessionId?: string | null;
  model?: string;
  brief?: boolean;
  exitZero?: boolean;
  header?: string;
  footer?: string;
  noDefaultFooter?: boolean;
}

interface Summary {
  run: RunState;
  result: RunResult;
  envelope: RunEnvelope;
  started: number;
}

interface RunState {
  steps: number;
  input: number;
  output: number;
  error: string | null;
  unsubscribe: () => void;
}

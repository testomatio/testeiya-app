import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { chalkStderr as c } from "chalk";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

import { hasTestomatio } from "./mcp.js";
import { UsageError } from "./model.js";
import { createTesteiyaSession } from "./session.js";
import type { RunResult } from "./result.js";

export async function runPrint(options: PrintOptions): Promise<number> {
  const started = Date.now();
  const result: RunResult = {};
  const outputPath = options.outputFile;
  const stampBefore = fileStamp(outputPath);
  const cwd = process.cwd();

  let created;
  try {
    created = await createTesteiyaSession({
      cwd,
      result,
      model: options.model,
      outputFile: outputPath,
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
  process.on("SIGINT", () => {
    note(c.yellow("\n  ⨯ interrupted"));
    void session.abort().finally(() => process.exit(130));
  });

  note(`  Testeiya ${c.dim("·")} ${model} ${c.dim("·")} ${cwd}`);
  note(c.dim(`  ${skills} skills`));
  if (outputPath) note(c.dim(`  → ${outputPath}`));
  note("");

  const run = watchRun(session);
  await promptOnce(session, options.prompt, run);
  const report = await collectReport(session, run, outputPath, stampBefore, result.status);

  run.unsubscribe();
  note("");
  summarize(run, result, started, outputPath, report);

  const code = exitCode(run.error, result.status, Boolean(outputPath), report);
  if (report && !outputPath) process.stdout.write(report);

  await session.dispose();
  return code;
}

export function exitCode(
  error: string | null,
  status: "pass" | "fail" | undefined,
  wantsReport: boolean,
  report: string | null
): number {
  if (error) return 1;
  if (status === "fail") return 1;
  if (wantsReport && !report) return 1;
  return 0;
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
      note(`  ${c.dim("▸")} ${c.cyan(event.toolName)}`);
    }
    if (event.type === "tool_execution_end" && event.isError) {
      note(`  ${c.red("✗")} ${c.red(event.toolName)}`);
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

function summarize(
  run: RunState,
  result: RunResult,
  started: number,
  outputPath: string | undefined,
  report: string | null
): void {
  const stats = `${elapsed(started)} ${c.dim("·")} ${run.steps} steps ${c.dim("·")} ${tokens(run.input)} in / ${tokens(run.output)} out`;
  if (run.error) {
    note(`  ${c.red("✗ failed")} ${c.dim("·")} ${stats}`);
    note(`  ${c.red(run.error)}`);
    return;
  }
  if (result.status === "fail") {
    note(`  ${c.red("✗ fail")} ${c.dim("·")} ${stats}`);
    if (result.reason) note(`  ${c.red(result.reason)}`);
    return;
  }
  let target = "";
  if (report && outputPath) target = ` ${c.dim("→")} ${outputPath}`;
  note(`  ${c.green("✓ done")} ${c.dim("·")} ${stats}${target}`);
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
  outputFile?: string;
  model?: string;
}

interface RunState {
  steps: number;
  input: number;
  output: number;
  error: string | null;
  unsubscribe: () => void;
}

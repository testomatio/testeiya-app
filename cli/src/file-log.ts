/**
 * Persistent, crash-durable structured app log under `~/.testeiya/logs/`.
 *
 * Shared by every runnable surface (desktop shell, web `serve:app`, the
 * `next dev` agent half, and the terminal CLI). `initFileLog(mode)` boots the
 * evlog pipeline once per process: every structured event (`log.*` and the
 * wide events emitted across `cli/src/`) fans out to an NDJSON file drain
 * (`<date>.jsonl`, 7 files kept), an in-memory ring buffer (the debug
 * snapshot's source), and the Debug-panel SSE drain in `debug-bus.ts`. evlog
 * runs `silent` — the terminal keeps the app's own `console.*` lines, and a
 * console tee forwards those (plus anything third-party deps print) into the
 * same file + memory sinks so a crash leaves a trace on disk. Deep per-session
 * detail (prompts, tool IO, generations) lives in Langfuse, not on disk.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";
import { initLogger, log, type WideEvent } from "evlog";
import { createFsDrain, writeToFs, type FsConfig } from "evlog/fs";
import { createMemoryDrain, writeToMemory } from "evlog/memory";
import { HOME_DIR } from "./project-dir.js";
import { loadConfig } from "./config.js";
import { panelDrain } from "./debug-bus.js";

export const LOGS_DIR = join(HOME_DIR, "logs");

const FS_LOG: FsConfig = { dir: LOGS_DIR, pretty: false, maxFiles: 7 };
const MEMORY_LOG = { store: "default", maxEvents: 500 };
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONSOLE_TEXT = 16000;
const LITERAL_ENV = ["PORT", "HOST", "TESTEIYA_WORKSPACE", "TESTOMATIO_URL", "TESTEIYA_DEBUG"];
const PRESENCE_ENV = [
  "OPENROUTER_API_KEY",
  "TESTOMATIO",
  "TESTEIYA_AUTH_TOKEN",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
];

let initialized = false;
let appMode = "app";

export function initFileLog(mode: string): void {
  if (initialized) return;
  initialized = true;
  appMode = mode;
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
  } catch {}
  pruneLegacyLogs();
  const fsDrain = createFsDrain(FS_LOG);
  const memoryDrain = createMemoryDrain(MEMORY_LOG);
  initLogger({
    env: { service: "testeiya", environment: mode },
    silent: true,
    redact: { builtins: ["jwt", "bearer"] },
    drain: (ctx) => {
      void fsDrain(ctx).catch(() => {});
      void memoryDrain(ctx).catch(() => {});
      try {
        panelDrain(ctx.event);
      } catch {}
    },
  });
  log.info({
    tag: "start",
    pid: process.pid,
    mode,
    runtime: runtimeVersion(),
    platform: `${process.platform}/${process.arch}`,
    cwd: process.cwd(),
    argv: process.argv.slice(2).join(" "),
  });
  patchConsole("log", "info");
  patchConsole("info", "info");
  patchConsole("warn", "warn");
  patchConsole("error", "error");
  patchConsole("debug", "debug");
  process.on("uncaughtException", (err) =>
    log.error({ tag: "error", message: `uncaughtException ${formatOne(err)}` })
  );
  process.on("unhandledRejection", (reason) =>
    log.error({ tag: "error", message: `unhandledRejection ${formatOne(reason)}` })
  );
}

export function appLogPath(): string | null {
  if (!initialized) return null;
  return join(LOGS_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
}

export function logStartupConfig(): void {
  if (!initialized) return;
  log.info({ tag: "config", config: loadConfig(), env: envSummary() });
}

function envSummary(): string {
  const parts: string[] = [];
  for (const key of LITERAL_ENV) {
    if (isSecretName(key)) {
      parts.push(`${key}=${presenceOf(key)}`);
      continue;
    }
    const value = process.env[key];
    if (!value) continue;
    parts.push(`${key}=${value}`);
  }
  for (const key of PRESENCE_ENV) {
    parts.push(`${key}=${presenceOf(key)}`);
  }
  return parts.join(" ");
}

function presenceOf(key: string): string {
  if (process.env[key]) return "set";
  return "unset";
}

function isSecretName(name: string): boolean {
  return /KEY|TOKEN|SECRET/i.test(name);
}

function pruneLegacyLogs(): void {
  let names: string[];
  try {
    names = readdirSync(LOGS_DIR);
  } catch {
    return;
  }
  const cutoff = Date.now() - MAX_LOG_AGE_MS;
  for (const name of names) {
    if (!/^(app|session)-.*\.log$/.test(name)) continue;
    let mtime = 0;
    try {
      mtime = statSync(join(LOGS_DIR, name)).mtimeMs;
    } catch {
      continue;
    }
    if (mtime >= cutoff) continue;
    try {
      rmSync(join(LOGS_DIR, name), { force: true });
    } catch {}
  }
}

/*
 * Tee every `console.*` call — the app's own terminal lines plus anything the
 * SDK or other deps print — into the file + memory sinks directly, bypassing
 * evlog's pipeline so the (still forwarded) original console output can't be
 * re-captured into a loop.
 */
function patchConsole(
  method: "log" | "info" | "warn" | "error" | "debug",
  level: "info" | "warn" | "error" | "debug"
): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    recordConsole(level, args);
    original(...args);
  };
}

function recordConsole(level: "info" | "warn" | "error" | "debug", args: unknown[]): void {
  const event: WideEvent = {
    timestamp: new Date().toISOString(),
    level,
    service: "testeiya",
    environment: appMode,
    tag: "console",
    message: truncate(formatArgs(args)),
  };
  void writeToFs(event, FS_LOG).catch(() => {});
  try {
    writeToMemory([event], MEMORY_LOG);
  } catch {}
}

function truncate(text: string): string {
  if (text.length <= MAX_CONSOLE_TEXT) return text;
  return `${text.slice(0, MAX_CONSOLE_TEXT)}… (+${text.length - MAX_CONSOLE_TEXT} more chars)`;
}

function formatArgs(args: unknown[]): string {
  return args.map(formatOne).join(" ");
}

function formatOne(value: unknown): string {
  if (typeof value === "string") return value;
  return inspect(value, { depth: 4, colors: false });
}

function runtimeVersion(): string {
  const bun = (globalThis as { Bun?: { version: string } }).Bun;
  if (bun) return `bun=${bun.version}`;
  return `node=${process.version}`;
}

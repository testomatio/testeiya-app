/**
 * Persistent, crash-durable app log under `~/.testeiya/logs/`.
 *
 * Shared by every runnable surface (desktop shell, web `serve:app`, the
 * `next dev` agent half, and the terminal CLI). `initFileLog(mode)` opens one
 * app log per process start (`app-<ts>-<pid>.log`), tees every `console.*` call
 * to it, records uncaught exceptions, and prunes logs older than 7 days so a
 * crash or a hung session leaves a trace on disk. It captures the *basic*
 * interactions needed to debug LLM connection/usage and API issues (the teed
 * `[session]`, `[api]`, `[ai]`, and error lines); the deep per-session detail
 * (prompts, tool IO, generations) lives in Langfuse, not on disk.
 *
 * This is an ADDITIONAL sink: the in-memory debug bus + `/api/debug/snapshot`
 * flow is untouched.
 */
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { EOL } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { HOME_DIR } from "./project-dir.js";
import { loadConfig } from "./config.js";

export const LOGS_DIR = join(HOME_DIR, "logs");

const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_APP_LOGS = 30;
const LITERAL_ENV = ["PORT", "HOST", "TESTEIYA_WORKSPACE", "TESTOMATIO_URL", "TESTEIYA_DEBUG"];
const PRESENCE_ENV = [
  "OPENROUTER_API_KEY",
  "TESTOMATIO",
  "TESTEIYA_AUTH_TOKEN",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
];

let initialized = false;
let appLogFile: string | null = null;

export function initFileLog(mode: string): void {
  if (initialized) return;
  initialized = true;
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
  } catch {}
  pruneOldLogs();
  appLogFile = join(LOGS_DIR, `app-${timestampForFile()}-${process.pid}.log`);
  const header = `pid=${process.pid} mode=${mode} ${runtimeVersion()} platform=${process.platform}/${process.arch} cwd=${process.cwd()} argv=${process.argv.slice(2).join(" ")}`;
  writeLine(appLogFile, "[start]", header);
  patchConsole("log", "info");
  patchConsole("info", "info");
  patchConsole("warn", "warn");
  patchConsole("error", "error");
  patchConsole("debug", "debug");
  process.on("uncaughtException", (err) =>
    writeLine(appLogFile, "[error]", `uncaughtException ${formatOne(err)}`)
  );
  process.on("unhandledRejection", (reason) =>
    writeLine(appLogFile, "[error]", `unhandledRejection ${formatOne(reason)}`)
  );
}

export function appLogPath(): string | null {
  return appLogFile;
}

export function logStartupConfig(): void {
  if (!appLogFile) return;
  writeLine(appLogFile, "[config]", safeStringify(loadConfig()));
  writeLine(appLogFile, "[config]", `env ${envSummary()}`);
}

export function logApp(scope: string, text: string): void {
  writeLine(appLogFile, `[${scope}]`, text);
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

function pruneOldLogs(): void {
  let names: string[];
  try {
    names = readdirSync(LOGS_DIR);
  } catch {
    return;
  }
  const cutoff = Date.now() - MAX_LOG_AGE_MS;
  const appLogs: { name: string; mtime: number }[] = [];
  for (const name of names) {
    if (/^session-.*\.log$/.test(name)) {
      remove(name);
      continue;
    }
    if (!/^app-.*\.log$/.test(name)) continue;
    let mtime: number;
    try {
      mtime = statSync(join(LOGS_DIR, name)).mtimeMs;
    } catch {
      continue;
    }
    if (mtime < cutoff) {
      remove(name);
      continue;
    }
    appLogs.push({ name, mtime });
  }
  appLogs.sort((a, b) => b.mtime - a.mtime);
  for (const log of appLogs.slice(MAX_APP_LOGS)) remove(log.name);
}

function remove(name: string): void {
  try {
    rmSync(join(LOGS_DIR, name), { force: true });
  } catch {}
}

function patchConsole(
  method: "log" | "info" | "warn" | "error" | "debug",
  level: string
): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    writeLine(appLogFile, `[${level}]`, formatArgs(args));
    original(...args);
  };
}

function writeLine(path: string | null, prefix: string, text: string): void {
  if (!path) return;
  try {
    appendFileSync(path, `${new Date().toISOString()} ${prefix} ${text}${EOL}`);
  } catch {}
}

function formatArgs(args: unknown[]): string {
  return args.map(formatOne).join(" ");
}

function formatOne(value: unknown): string {
  if (typeof value === "string") return value;
  return inspect(value, { depth: 4, colors: false });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function timestampForFile(): string {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10).replace(/-/g, "");
  const time = iso.slice(11, 19).replace(/:/g, "");
  return `${date}-${time}`;
}

function runtimeVersion(): string {
  const bun = (globalThis as { Bun?: { version: string } }).Bun;
  if (bun) return `bun=${bun.version}`;
  return `node=${process.version}`;
}

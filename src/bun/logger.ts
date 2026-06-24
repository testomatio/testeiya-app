/**
 * Persistent file logging for the desktop shell.
 *
 * Importing this module (it must be the FIRST import in the Electrobun main
 * entry) tees every `console.*` call to `~/.testeiya/testeiya.log` and records
 * uncaught exceptions / unhandled rejections — so a packaged app that crashes on
 * launch leaves a trace on disk instead of dying silently behind the window.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir, EOL } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";

const logDir = join(homedir(), ".testeiya");
const logPath = join(logDir, "testeiya.log");

mkdirSync(logDir, { recursive: true });
writeLine("info", [`--- session start ${new Date().toISOString()} (pid ${process.pid}) ---`]);

patchConsole("log", "info");
patchConsole("info", "info");
patchConsole("warn", "warn");
patchConsole("error", "error");
patchConsole("debug", "debug");

process.on("uncaughtException", (err) => {
  writeLine("error", ["uncaughtException", err]);
});
process.on("unhandledRejection", (reason) => {
  writeLine("error", ["unhandledRejection", reason]);
});

export { logPath };

function patchConsole(method: "log" | "info" | "warn" | "error" | "debug", level: string): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    writeLine(level, args);
    original(...args);
  };
}

function writeLine(level: string, args: unknown[]): void {
  const ts = new Date().toISOString();
  const body = args
    .map((a) => (typeof a === "string" ? a : inspect(a, { depth: 4, colors: false })))
    .join(" ");
  try {
    appendFileSync(logPath, `${ts} [${level}] ${body}${EOL}`);
  } catch {}
}

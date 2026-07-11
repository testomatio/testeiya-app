import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME_DIR } from "./project-dir.js";

/*
 * Publishes where the running app-server is reachable so an out-of-band tool
 * (the `testeiya-debug` skill, `scripts/debug-snapshot.ts`) can find it — the
 * desktop app binds a random free port (`port: 0`) that is otherwise written
 * nowhere. `writeServerInfo` is called once the port is known; the file is
 * best-effort removed on exit. Only the latest instance is recorded.
 */

export const SERVER_INFO_FILE = join(HOME_DIR, "server.json");

export function writeServerInfo(info: ServerInfo): void {
  try {
    if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true });
    writeFileSync(SERVER_INFO_FILE, JSON.stringify(info, null, 2));
  } catch {}
  for (const signal of ["exit", "SIGINT", "SIGTERM"] as const) {
    process.once(signal, clearServerInfo);
  }
}

export function readServerInfo(): ServerInfo | null {
  try {
    if (!existsSync(SERVER_INFO_FILE)) return null;
    return JSON.parse(readFileSync(SERVER_INFO_FILE, "utf8")) as ServerInfo;
  } catch {
    return null;
  }
}

function clearServerInfo(): void {
  try {
    rmSync(SERVER_INFO_FILE, { force: true });
  } catch {}
}

export interface ServerInfo {
  port: number;
  pid: number;
  url: string;
  mode: string;
  startedAt: string;
  logFile?: string | null;
}

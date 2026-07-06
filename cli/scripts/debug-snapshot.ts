#!/usr/bin/env bun
// Pull a full debug snapshot from the running app-server and dump it to
// `cli/log/` so a debugging session can read the whole stack at once: server
// Testomat.io REST calls, LLM events, server stdout, plus the browser's report
// (its `/api/*` + agent-WS log, console, and MobX store).
//
//   bun scripts/debug-snapshot.ts                 # auto-discovers the server
//   bun scripts/debug-snapshot.ts <session-id>    # include that session's meta
//   TESTEIYA_PORT=3211 bun scripts/debug-snapshot.ts
//
// The server is found via ~/.testeiya/server.json (written on start), else
// $TESTEIYA_PORT / $PORT, else 3050.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readServerInfo } from "../src/server-info.js";

const LOG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "log");
const sessionId = process.argv[2];
const base = resolveBase();

const url = `${base}/api/debug/snapshot${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`;
console.log(`Fetching ${url}`);

const res = await fetch(url).catch((e) => {
  console.error(`Could not reach the app-server at ${base}: ${e instanceof Error ? e.message : e}`);
  console.error("Is it running? (npm run dev / desktop / bun run serve:app)");
  process.exit(1);
});
if (!res.ok) {
  console.error(`Snapshot request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const snap = await res.json();
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const outPath = join(LOG_DIR, `debug-snapshot-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(snap, null, 2));

const client = snap.client;
const errors = countErrors(snap);
console.log("");
console.log(`server:  ${snap.server.requests.length} REST · ${snap.server.ai.length} LLM · ${snap.server.checkTests?.length ?? 0} check-tests · ${snap.server.console.length} console lines`);
console.log(`client:  ${client ? `${client.entries.length} log entries (reported ${client.reportedAt}, reason: ${client.reason})` : "no report yet — open the app / turn on the Debug panel"}`);
console.log(`session: ${snap.session ? JSON.stringify(snap.session) : "none"}`);
console.log(`errors:  ${errors} failing request(s) / error event(s)`);
console.log(`hint:    ${snap.langfuseHint}`);
console.log(`\nSaved to: ${outPath}`);

function resolveBase(): string {
  const info = readServerInfo();
  if (info?.url) return info.url;
  const port = process.env.TESTEIYA_PORT || process.env.PORT || "3050";
  return `http://127.0.0.1:${port}`;
}

function countErrors(snap: any): number {
  let n = 0;
  for (const r of snap.server.requests) if (!r.ok) n++;
  for (const a of snap.server.ai) if (!a.ok) n++;
  for (const c of snap.server.checkTests ?? []) if (!c.ok) n++;
  for (const e of snap.client?.entries ?? []) {
    if (e.kind === "event" && e.ok === false) n++;
    if (e.kind === "request" && (e.ok === false || (e.status && e.status >= 400))) n++;
  }
  return n;
}

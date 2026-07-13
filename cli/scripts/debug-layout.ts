#!/usr/bin/env bun
// Pull the browser's last-reported UI layout map from the running app-server and
// print it as an indented tree (big components only — wider or taller than
// 100px — with coordinates + sizes, container → child). Lets a debugging session
// understand the rendered UI without driving a browser.
//
//   bun scripts/debug-layout.ts                 # auto-discovers the server
//   bun scripts/debug-layout.ts <session-id>    # that session's browser
//   TESTEIYA_PORT=3211 bun scripts/debug-layout.ts
//
// The map is only as fresh as the last client report (page load, panel-open, or
// every 15s while the Debug panel is on). The server is found via
// ~/.testeiya/server.json (written on start), else $TESTEIYA_PORT / $PORT / 3050.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readServerInfo } from "../src/server-info.js";

const LOG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "log");
const sessionId = process.argv[2];
const base = resolveBase();

const url = `${base}/api/debug/layout${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`;
console.log(`Fetching ${url}`);

const res = await fetch(url).catch((e) => {
  console.error(`Could not reach the app-server at ${base}: ${e instanceof Error ? e.message : e}`);
  console.error("Is it running? (npm run dev / desktop / bun run serve:app)");
  process.exit(1);
});
if (!res.ok) {
  console.error(`Layout request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
if (!data.layout) {
  console.log(data.note ?? "No layout reported yet.");
  process.exit(0);
}

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const outPath = join(LOG_DIR, `debug-layout-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(data, null, 2));

console.log(`\n${data.url ?? ""} (reported ${data.reportedAt})\n`);
console.log(data.text);
console.log(`\nSaved to: ${outPath}`);

function resolveBase(): string {
  const info = readServerInfo();
  if (info?.url) return info.url;
  const port = process.env.TESTEIYA_PORT || process.env.PORT || "3050";
  return `http://127.0.0.1:${port}`;
}

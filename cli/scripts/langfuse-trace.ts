#!/usr/bin/env bun
// Fetch a Langfuse trace (or a session's traces, or a recent time range) and
// dump the full tree — prompts, tool calls, usage, cost — to a JSON file under
// `cli/log/` so a debugging session can read what the agent actually saw.
//
//   bun scripts/langfuse-trace.ts <trace-id>          # one trace + observations
//   bun scripts/langfuse-trace.ts session:<id>        # every trace in a session
//   bun scripts/langfuse-trace.ts 30m | 1h | today    # recent traces by range
//
// Prefix with trace:/session:/range: to disambiguate. Keys are read from the
// env, gap-filled from ~/.testeiya/.env (same file `setup:env` seeds).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadHomeEnv();

const BASE_URL = process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com";
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error("Missing LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY — run `bun run setup:env` and fill them in ~/.testeiya/.env");
  process.exit(1);
}

const AUTH = `Basic ${btoa(`${PUBLIC_KEY}:${SECRET_KEY}`)}`;
const LOG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "log");

const input = process.argv[2] || "1h";
const { mode, value } = classify(input);

let result: any[];

if (mode === "trace") {
  console.log(`Fetching trace: ${value}`);
  result = [await withObservations(await api(`/api/public/traces/${value}`))];
} else if (mode === "session") {
  console.log(`Fetching session: ${value}`);
  const { data } = await api(`/api/public/traces?${new URLSearchParams({ sessionId: value, limit: "100" })}`);
  if (!data.length) {
    console.log("No traces found for this session.");
    process.exit(0);
  }
  console.log(`Found ${data.length} trace(s)`);
  result = await withEachObservations(data);
} else {
  const { from, to } = parseTimeRange(value);
  console.log(`Fetching traces from ${from} to ${to}`);
  const { data } = await api(`/api/public/traces?${new URLSearchParams({ limit: "50", fromTimestamp: from, toTimestamp: to })}`);
  if (!data.length) {
    console.log("No traces found in this time range.");
    process.exit(0);
  }
  console.log(`Found ${data.length} trace(s)`);
  result = await withEachObservations(data);
}

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const outPath = process.argv[3] || join(LOG_DIR, `langfuse-trace-${mode}-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nSaved ${result.length} trace(s) to: ${outPath}`);

async function api(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error(`Langfuse API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchObservations(traceId: string) {
  let all: any[] = [];
  let page = 1;
  while (true) {
    const { data } = await api(`/api/public/observations?${new URLSearchParams({ traceId, limit: "100", page: String(page) })}`);
    all = all.concat(data);
    if (data.length < 100) break;
    page++;
  }
  return all;
}

async function withObservations(trace: any) {
  const observations = await fetchObservations(trace.id);
  console.log(`  ${trace.timestamp} | ${trace.name || "(unnamed)"} | ${observations.length} observations`);
  return { ...trace, observations };
}

async function withEachObservations(traces: any[]) {
  const out: any[] = [];
  for (const t of traces) out.push(await withObservations(t));
  return out;
}

function classify(arg: string): { mode: "trace" | "session" | "range"; value: string } {
  if (arg.startsWith("trace:")) return { mode: "trace", value: arg.slice(6) };
  if (arg.startsWith("session:")) return { mode: "session", value: arg.slice(8) };
  if (arg.startsWith("range:")) return { mode: "range", value: arg.slice(6) };
  if (/^(\d+)[mhd]$/.test(arg) || arg === "today") return { mode: "range", value: arg };
  if (/^[a-f0-9]{16,}$/i.test(arg) && !arg.includes("-")) return { mode: "trace", value: arg };
  return { mode: "session", value: arg };
}

function parseTimeRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const match = range.match(/^(\d+)([mhd])$/);
  if (match) {
    const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    from.setTime(to.getTime() - Number(match[1]) * ms);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return { from: new Date(range).toISOString(), to: to.toISOString() };
}

function loadHomeEnv(): void {
  const path = join(homedir(), ".testeiya", ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

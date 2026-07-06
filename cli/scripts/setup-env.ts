#!/usr/bin/env bun
// Create ~/.testeiya/.env (the packaged app's stable env file) and seed it with
// a commented Langfuse block so enabling observability is just uncommenting two
// lines. Never overwrites existing values — appends the block only when no
// LANGFUSE_* key is present yet.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME_DIR = join(homedir(), ".testeiya");
const ENV_PATH = join(HOME_DIR, ".env");

const LANGFUSE_BLOCK = `# ── Langfuse observability (optional) ──────────────────────────────────
# Trace every agent run to Langfuse: prompts, tool calls, tokens, and cost.
# Copy the keys from your Langfuse project settings, uncomment, and restart.
# Leave commented to keep telemetry off (the agent runs exactly the same).
# LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_SECRET_KEY=sk-lf-...
# LANGFUSE_BASE_URL=https://cloud.langfuse.com
`;

if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true });

if (!existsSync(ENV_PATH)) {
  writeFileSync(ENV_PATH, `# Testeiya environment (~/.testeiya/.env)\n\n${LANGFUSE_BLOCK}`);
  console.log(`Created ${ENV_PATH} with a commented Langfuse block.`);
  process.exit(0);
}

if (readFileSync(ENV_PATH, "utf8").includes("LANGFUSE_")) {
  console.log(`${ENV_PATH} already has a Langfuse block — left untouched.`);
  process.exit(0);
}

appendFileSync(ENV_PATH, `\n${LANGFUSE_BLOCK}`);
console.log(`Appended a commented Langfuse block to ${ENV_PATH}.`);

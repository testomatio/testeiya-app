import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSessionContext, SessionManager } from "@earendil-works/pi-coding-agent";

import { TESTEIYA_HOME } from "./env.js";

const DEFAULT_HUB_URL = "https://testeiya-hub.davert-ua.workers.dev";

/**
 * Share a saved session to the Testeiya Hub: the transcript itself, so a
 * colleague with the company key can download it and continue, or the last
 * assistant answer as a public page.
 *
 * Credentials are shared with the desktop app: env wins, then the
 * hub-auth.json its Settings dialog writes.
 */
export async function runShare(cwd: string, args: ShareArgs): Promise<number> {
  const config = hubConfig();
  if (typeof config === "string") return fail(config);

  const sessions = await SessionManager.list(cwd);
  if (sessions.length === 0) return fail("no saved sessions in this folder");

  const picked = pickSession(sessions, args.resume);
  if (typeof picked === "string") return fail(picked);

  const title = args.title ?? picked.name ?? picked.firstMessage.slice(0, 60);
  return args.answer
    ? shareAnswer(config, picked, title, args.json)
    : shareTranscript(config, picked, title, args.json);
}

export interface ShareArgs {
  /** A session id prefix, the same form `--resume` takes. */
  resume?: string;
  /** Share the last assistant answer as a public page, not the transcript. */
  answer?: boolean;
  title?: string;
  json?: boolean;
}

type HubConfig = { url: string; key: string };

function hubConfig(): HubConfig | string {
  let stored: { hubUrl?: string; companyKey?: string } = {};
  try {
    stored = JSON.parse(readFileSync(join(TESTEIYA_HOME, "hub-auth.json"), "utf-8"));
  } catch {
    /* not configured through the app yet */
  }
  const url = (process.env.TESTEIYA_HUB_URL || stored.hubUrl || DEFAULT_HUB_URL)
    .trim()
    .replace(/\/+$/, "");
  const key = (process.env.TESTEIYA_COMPANY_KEY || stored.companyKey || "").trim();
  if (!key) {
    return "sharing needs a company key — set TESTEIYA_COMPANY_KEY or the app's Testeiya Hub settings";
  }
  return { url, key };
}

function pickSession(
  sessions: Awaited<ReturnType<typeof SessionManager.list>>,
  resume?: string
): (typeof sessions)[number] | string {
  const ordered = [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime());
  if (!resume) return ordered[0];
  const matched = ordered.filter((s) => s.id.startsWith(resume));
  if (matched.length === 0) return `no session "${resume}" in this folder`;
  if (matched.length > 1) {
    const ids = matched.map((s) => s.id.slice(0, 13)).join(", ");
    return `"${resume}" matches ${matched.length} sessions: ${ids}`;
  }
  return matched[0];
}

async function shareTranscript(
  config: HubConfig,
  session: { id: string; path: string },
  title: string,
  json?: boolean
): Promise<number> {
  const body = readFileSync(session.path, "utf-8");
  const result = await hubPost(
    config,
    `/sessions?title=${encodeURIComponent(title)}`,
    body,
    "text/plain"
  );
  if (!result.ok) return fail(result.error);
  done(`session shared — the full transcript, tool calls included`, result.url, json);
  return 0;
}

async function shareAnswer(
  config: HubConfig,
  session: { id: string; path: string },
  title: string,
  json?: boolean
): Promise<number> {
  const manager = await SessionManager.open(session.path);
  const messages = buildSessionContext(manager.getEntries(), manager.getLeafId()).messages;
  const text = lastAssistantText(messages as { role?: string; content?: unknown }[]);
  if (!text) return fail("no assistant answer in that session");

  const payload = JSON.stringify({ title, messages: [{ role: "assistant", text }] });
  const result = await hubPost(config, "/artifacts", payload, "application/json");
  if (!result.ok) return fail(result.error);
  done(`answer shared — a public page`, result.url, json);
  return 0;
}

/** The last assistant turn's text blocks, without its tool calls. */
function lastAssistantText(messages: { role?: string; content?: unknown }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const text = textOf(message.content);
    if (text) return text;
  }
  return null;
}

function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .filter((block): block is { type: string; text?: string } => !!block && typeof block === "object")
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

async function hubPost(
  config: HubConfig,
  path: string,
  body: string,
  contentType: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "content-type": contentType },
      body,
    });
  } catch (err) {
    return { ok: false, error: `cannot reach ${config.url}: ${err instanceof Error ? err.message : String(err)}` };
  }
  const text = await res.text();
  let parsed: { url?: string; error?: string } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* a non-JSON body — reported below */
  }
  if (!res.ok) return { ok: false, error: parsed.error ?? `hub responded ${res.status}` };
  if (!parsed.url) return { ok: false, error: "hub returned no link" };
  return { ok: true, url: `${config.url}${parsed.url}` };
}

function done(what: string, url: string, json?: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ url }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\n  ${what}\n  ${url}\n\n`);
}

function fail(message: string): number {
  process.stderr.write(`  ${message}\n`);
  return 1;
}

#!/usr/bin/env bun
// Supervisor WS client for the Testeiya app-server agent stream.
//
// Usage:  bun ws-supervisor.ts <sessionId> ["initial user prompt"]
//
// Connects to the running app-server (URL from ~/.testeiya/server.json, override
// with TESTEIYA_SERVER_URL) as `ws://<host>?session=<sessionId>` — the same
// protocol the web/desktop UI speaks. Runs until {"quit":true} or the socket
// closes. All files live in the CURRENT WORKING DIRECTORY:
//
//   events.jsonl — every received protocol frame, append-only (the raw transcript)
//   cmd.jsonl    — append JSON lines to interact while it runs:
//     {"answer": {"toolCallId": "...", "value": "..."}}   answer an ask_question
//     {"prompt": "follow-up user message"}                 send the next user turn
//     {"quit": true}                                       close and exit

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: bun ws-supervisor.ts <sessionId> ["initial prompt"]');
  process.exit(1);
}

const WS_URL = `${resolveServerUrl().replace(/^http/, "ws")}?session=${encodeURIComponent(sessionId)}`;
const CMD_FILE = join(process.cwd(), "cmd.jsonl");
const EVENTS_FILE = join(process.cwd(), "events.jsonl");

let cmdCount = 0;
const texts = new Map<string, string>();

const ws = new WebSocket(WS_URL);

ws.onopen = () => {
  console.log(`[WS] connected to ${WS_URL}`);
  const initial = process.argv[3];
  if (initial) {
    send({ type: "prompt", message: initial });
    console.log(`[PROMPT SENT] ${initial}`);
  }
};

ws.onmessage = (e) => {
  try {
    handle(JSON.parse(String(e.data)));
  } catch (err) {
    console.log(`[PARSE ERROR] ${err}`);
  }
};

ws.onclose = () => {
  console.log("[WS] closed");
  process.exit(0);
};

ws.onerror = () => {
  console.log("[WS] socket error");
};

setInterval(pollCmds, 300);

function resolveServerUrl(): string {
  if (process.env.TESTEIYA_SERVER_URL) return process.env.TESTEIYA_SERVER_URL;
  const info = JSON.parse(readFileSync(join(homedir(), ".testeiya", "server.json"), "utf8"));
  return info.url;
}

function send(obj: Record<string, unknown>) {
  ws.send(JSON.stringify(obj));
}

function handle(msg: any) {
  appendFileSync(EVENTS_FILE, JSON.stringify(msg) + "\n");
  switch (msg.type) {
    case "ping":
    case "start":
    case "start-step":
    case "finish-step":
    case "finish":
    case "text-start":
    case "reasoning-start":
    case "reasoning-delta":
      return;
    case "reasoning-end":
      console.log("[reasoning done]");
      return;
    case "text-delta":
      texts.set(msg.id, (texts.get(msg.id) || "") + msg.delta);
      return;
    case "text-end": {
      const text = texts.get(msg.id) || "";
      texts.delete(msg.id);
      console.log(`\n===== AGENT TEXT =====\n${text}\n======================\n`);
      return;
    }
    case "tool-input-available": {
      if (msg.toolName === "ask_question") {
        const opts = (msg.input?.options || [])
          .map((o: string, i: number) => `  [${i}] ${o}`)
          .join("\n");
        console.log(
          `\n##### ASK_QUESTION ##### toolCallId=${msg.toolCallId}\nQ: ${msg.input?.question}\nmultiSelect=${!!msg.input?.multiSelect}\n${opts}\n########################\n`
        );
        return;
      }
      console.log(`[TOOL>] ${msg.toolName} (${msg.toolCallId}) ${trunc(JSON.stringify(msg.input), 900)}`);
      return;
    }
    case "tool-output-available":
      console.log(`[TOOL<] (${msg.toolCallId}) err=${msg.isError} ${trunc(msg.output, 700)}`);
      return;
    case "done":
      console.log("\n[DONE] turn complete\n");
      return;
    case "error":
      console.log(`[ERROR] ${msg.error}`);
      return;
    default:
      console.log(`[${msg.type}] ${trunc(JSON.stringify(msg), 400)}`);
  }
}

function pollCmds() {
  if (!existsSync(CMD_FILE)) return;
  const lines = readFileSync(CMD_FILE, "utf8").split("\n").filter((l) => l.trim());
  while (cmdCount < lines.length) {
    const line = lines[cmdCount++];
    let cmd: any;
    try {
      cmd = JSON.parse(line);
    } catch {
      console.log(`[CMD PARSE ERROR] ${line}`);
      continue;
    }
    if (cmd.answer) {
      send({ type: "answer", toolCallId: cmd.answer.toolCallId, value: cmd.answer.value });
      console.log(`[ANSWER SENT] ${cmd.answer.toolCallId} → ${cmd.answer.value}`);
      continue;
    }
    if (cmd.prompt) {
      send({ type: "prompt", message: cmd.prompt });
      console.log(`[PROMPT SENT] ${cmd.prompt}`);
      continue;
    }
    if (cmd.quit) {
      console.log("[QUIT]");
      ws.close();
      process.exit(0);
    }
  }
}

function trunc(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + ` …(+${s.length - n} chars)`;
}

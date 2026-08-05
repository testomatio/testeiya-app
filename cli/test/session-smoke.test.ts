import { test, expect, describe } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFiles } from "../src/load-env.js";

loadEnvFiles();

const hasKey = Boolean(
  process.env.OPENROUTER_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY
);

const WEB_UI_TOOLS = [
  "ask_question",
  "render_list",
  "render_tree",
  "render_item",
  "render_chart",
  "render_result",
  "query_result",
  "ui_widget",
];

describe.skipIf(!hasKey)("session smoke", () => {
  test("session exposes web UI tools top-level, loads skills, and connects MCP", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "testeiya-smoke-"));
    fs.mkdirSync(path.join(cwd, ".testeiya"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".testeiya", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          smoke: { command: "bunx", args: ["-y", "@modelcontextprotocol/server-everything"] },
        },
      })
    );

    const { createTesteiyaSession } = await import("../src/session-factory.js");
    const result = await createTesteiyaSession({ cwd, mode: "web", trusted: true });
    const session = result.session as any;

    const active: string[] = session.getActiveToolNames();

    for (const name of WEB_UI_TOOLS) {
      expect(active).toContain(name);
    }

    expect(session.skills.length).toBeGreaterThan(0);

    const mcpTools = (result.mcpManager as any)?.getTools?.() ?? [];
    expect(mcpTools.map((t: any) => t.mcpServerName)).toContain("smoke");

    fs.rmSync(cwd, { recursive: true, force: true });
  }, 180_000);
});

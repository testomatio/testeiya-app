import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

/**
 * Tool gate — deferred loading for MCP tool schemas.
 *
 * Every MCP tool stays registered, but only a read-first subset is *active*
 * (its schema reaches the model). The rest are listed by exact name in a
 * byte-stable `<deferred_tools>` block appended to the system prompt, and the
 * `enable_tools` tool activates any of them for the rest of the session via
 * `pi.setActiveTools()`. Mirrors the deferred-tool pattern shipped by the
 * Claude API (`defer_loading` + tool search) and VS Code's virtual tools.
 *
 * Active-set selection per server, first match wins:
 *   1. `toolGate.activeTools[server]` config globs (matched against original
 *      MCP tool names) — explicit pinning, replaces all heuristics.
 *   2. Testomat.io servers — curated read set (entity list/get/search +
 *      analytics + ping).
 *   3. Any other server — tools without a mutating verb token in the name,
 *      capped at SERVER_BUDGET (search/list/get-shaped names kept first).
 *
 * The deferred block is computed from the base classification only — session
 * `enable_tools` activations never change it, so the system prompt stays
 * byte-identical across turns and the prompt cache is preserved.
 */
export function createToolGateExtension(
  runtime: ToolGateRuntime,
  config?: ToolGateConfig
): ExtensionFactory {
  return ((pi: ExtensionAPI) => {
    const sessionEnabled = new Set<string>();
    let lastLogged = "";

    pi.registerTool({
      name: "enable_tools",
      label: "Enable Tools",
      description:
        "Activate deferred MCP tools listed in <deferred_tools>. Pass their " +
        "exact names; they stay active for the rest of the session. Call this " +
        "before your first use of any deferred tool.",
      parameters: Type.Object({
        tools: Type.Array(Type.String(), {
          minItems: 1,
          description: "Exact tool names from the <deferred_tools> block.",
        }),
      }),
      async execute(_toolCallId, params) {
        const requested = (params as { tools: string[] }).tools;
        const known = new Set(pi.getAllTools());
        const unknown = requested.filter((name) => !known.has(name));
        if (unknown.length > 0) {
          return textResult(
            `Unknown tool(s): ${unknown.join(", ")}. Use exact names from <deferred_tools>.`
          );
        }
        for (const name of requested) sessionEnabled.add(name);
        await applyGate();
        console.log(`[tool-gate] enabled: ${requested.join(", ")}`);
        return textResult(
          `Enabled: ${requested.join(", ")}. Available from your next step.`
        );
      },
    });

    pi.on("before_agent_start", async (event: any) => {
      let block: string | null;
      try {
        block = await applyGate();
      } catch (err) {
        console.error("[tool-gate] gate failed:", err);
        return undefined;
      }
      if (!block) return undefined;
      return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
    });

    async function applyGate(): Promise<string | null> {
      const mcpTools = (runtime.mcpManager?.getTools?.() ?? []) as McpToolInfo[];
      if (mcpTools.length === 0) return null;

      const byServer = new Map<string, McpToolInfo[]>();
      for (const tool of mcpTools) {
        const server = tool.mcpServerName ?? "unknown";
        let list = byServer.get(server);
        if (!list) {
          list = [];
          byServer.set(server, list);
        }
        list.push(tool);
      }

      const active = new Set<string>();
      const deferredByServer = new Map<string, string[]>();
      const servers = [...byServer.entries()].sort(([a], [b]) => a.localeCompare(b));
      for (const [server, tools] of servers) {
        const activeNames = selectActive(server, tools, config);
        const deferredNames: string[] = [];
        for (const tool of tools) {
          if (activeNames.has(tool.name)) {
            active.add(tool.name);
          } else {
            deferredNames.push(tool.name);
          }
        }
        if (deferredNames.length > 0) {
          deferredByServer.set(server, deferredNames.sort());
        }
      }

      const mcpNames = new Set(mcpTools.map((tool) => tool.name));
      const nonMcp = pi.getAllTools().filter((name) => !mcpNames.has(name));
      const enabled = [...sessionEnabled].filter((name) => mcpNames.has(name));
      await pi.setActiveTools([...new Set([...nonMcp, ...active, ...enabled])]);

      const activeCount = new Set([...active, ...enabled]).size;
      const summary = `${activeCount}/${mcpTools.length}`;
      if (summary !== lastLogged) {
        lastLogged = summary;
        console.log(
          `[tool-gate] mcp tools: ${activeCount} active, ${mcpTools.length - activeCount} deferred`
        );
      }

      if (deferredByServer.size === 0) return null;
      return deferredBlock(deferredByServer);
    }
  }) as ExtensionFactory;
}

const SERVER_BUDGET = 15;

const TESTOMATIO_ACTIVE_RE =
  /^(?:(?:tests|suites|runs|testruns|plans|requirements)_(?:list|get|search)|analytics_(?:tests|stats)|system_ping)$/;

const MUTATING_VERBS = new Set([
  "create", "update", "delete", "remove", "add", "set", "upload", "link",
  "unlink", "write", "send", "execute", "exec", "push", "post", "put", "patch",
  "move", "archive", "unarchive", "assign", "unassign", "transition", "comment",
  "merge", "close", "reopen", "cancel", "approve", "reject", "invite", "import",
  "clone", "fork", "deploy", "trigger", "run", "start", "stop", "restart",
  "kill", "insert", "edit", "modify", "rename", "revoke", "grant", "publish",
  "submit", "apply", "sync", "reset", "clear", "purge", "flush", "mark",
  "complete", "resolve", "vote", "watch", "invoke",
]);

const READ_PRIORITY = ["search", "list", "get", "read", "find", "query", "status"];

function selectActive(
  server: string,
  tools: McpToolInfo[],
  config?: ToolGateConfig
): Set<string> {
  const overrides = config?.activeTools?.[server];
  if (overrides && overrides.length > 0) {
    const globs = overrides.map((pattern) => new Bun.Glob(pattern));
    const matched = tools.filter((tool) =>
      globs.some((glob) => glob.match(tool.mcpToolName))
    );
    return new Set(matched.map((tool) => tool.name));
  }
  if (server.startsWith("testomatio")) {
    const matched = tools.filter((tool) => TESTOMATIO_ACTIVE_RE.test(tool.mcpToolName));
    return new Set(matched.map((tool) => tool.name));
  }
  const readTools = tools.filter((tool) => !isMutating(tool.mcpToolName));
  readTools.sort(byReadPriority);
  return new Set(readTools.slice(0, SERVER_BUDGET).map((tool) => tool.name));
}

function isMutating(mcpToolName: string): boolean {
  return tokensOf(mcpToolName).some((token) => MUTATING_VERBS.has(token));
}

function byReadPriority(a: McpToolInfo, b: McpToolInfo): number {
  const diff = readScore(a) - readScore(b);
  if (diff !== 0) return diff;
  return a.mcpToolName.localeCompare(b.mcpToolName);
}

function readScore(tool: McpToolInfo): number {
  const tokens = tokensOf(tool.mcpToolName);
  const index = READ_PRIORITY.findIndex((verb) => tokens.includes(verb));
  if (index === -1) return READ_PRIORITY.length;
  return index;
}

function tokensOf(mcpToolName: string): string[] {
  return mcpToolName.toLowerCase().split(/[_\-.]/);
}

function deferredBlock(deferredByServer: Map<string, string[]>): string {
  const lines: string[] = [];
  for (const [server, names] of deferredByServer) {
    lines.push(`${server}: ${names.join(", ")}`);
  }
  return (
    "<deferred_tools>\n" +
    'These MCP tools are registered but their schemas are not loaded. To use one, first call enable_tools({tools: ["<exact name>"]}) — it stays active for the rest of the session — then call it.\n' +
    lines.join("\n") +
    "\n</deferred_tools>"
  );
}

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

export interface ToolGateRuntime {
  mcpManager?: { getTools?: () => unknown[] } | null;
}

export interface ToolGateConfig {
  activeTools?: Record<string, string[]>;
}

interface McpToolInfo {
  name: string;
  mcpToolName: string;
  mcpServerName?: string;
}

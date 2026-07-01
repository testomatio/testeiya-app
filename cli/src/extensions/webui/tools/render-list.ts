import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";

/**
 * `render_list` — a UI-side tool registered by the webui extension.
 *
 * The agent calls this tool after fetching a Testomat.io list (runs, tests,
 * suites, plans, labels). Server-side it does nothing: it just echoes the
 * input back as its output. The web UI intercepts the output by tool name
 * and renders a shadcn/ui-based table (see components/widgets/).
 */
export const renderListTool: ToolDefinition = {
  name: "render_list",
  label: "Render List",
  description:
    "Display a Testomat.io list (runs, tests, suites, plans, labels) as a " +
    "rich interactive table in the chat UI. Call this AFTER fetching data " +
    "via an MCP `*_list` tool when you want the user to see the result. " +
    "Do NOT repeat the list content in your own reply — the UI already " +
    "shows it. Reply with a short summary only.",
  parameters: Type.Object({
    kind: Type.Union(
      [
        Type.Literal("runs"),
        Type.Literal("tests"),
        Type.Literal("suites"),
        Type.Literal("plans"),
        Type.Literal("testruns"),
      ],
      {
        description:
          "Pick the kind that matches the MCP tool you just called: " +
          "runs_list → 'runs', tests_list → 'tests', suites_list → 'suites', " +
          "plans_list → 'plans', testruns_list → 'testruns'.",
      }
    ),
    data: Type.Union(
      [
        Type.Array(Type.Any()),
        Type.Object({}, { additionalProperties: true }),
      ],
      {
        description:
          "The list data from the MCP response. Pass either the full MCP " +
          "result object (e.g. `{data: [...], meta: {...}}`) or just the " +
          "`data` array. The UI will extract what it needs.",
      }
    ),
    title: Type.Optional(
      Type.String({
        description:
          "Short header shown in the card's collapse bar " +
          "(e.g. 'Recent runs in codeceptjs'). Always pass one so the user " +
          "can identify the card in history.",
      })
    ),
    summary: Type.Optional(
      Type.String({
        description:
          "Optional short caption shown inside the card above the table.",
      })
    ),
  }),
  async execute(_toolCallId, params) {
    const p = params as { kind?: string; data?: unknown; summary?: string };
    const count = Array.isArray(p.data)
      ? p.data.length
      : p.data && typeof p.data === "object" && Array.isArray((p.data as { data?: unknown[] }).data)
        ? (p.data as { data: unknown[] }).data.length
        : "?";
    console.log(`[render_list] kind=${p.kind} count=${count} summary=${p.summary ?? "—"}`);
    return {
      content: [{ type: "text", text: JSON.stringify(params) }],
    };
  },
};

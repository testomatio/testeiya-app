import { Type } from "@oh-my-pi/omptype/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { widgetResult } from "./widget-result.js";

/**
 * `render_result` — render one previously fetched MCP `*_list`/`*_search`
 * result, referenced by its tool call id. The webui middleware caches each
 * list result (slimmed) as it passes through; this tool echoes the cached
 * rows to the UI so the agent never re-emits (or truncates) them. Columns
 * and icons (status/state/priority) are handled by the UI renderer.
 */
export function createRenderResultTool(cache: Map<string, CachedList>): ToolDefinition {
  return {
    name: "render_result",
    label: "Render Result",
    loadMode: "essential",
    approval: "read",
    description:
      "Show the full result of a previous *_list/*_search call as a rich " +
      "table in the chat UI, referenced by that call's id (given in the " +
      "result's UI notice). Renders EVERY row of that result.",
    parameters: Type.Object({
      call_id: Type.String({
        description: "The tool call id of the *_list/*_search result to render.",
      }),
      title: Type.Optional(
        Type.String({
          description: "Card header: what this list is and how it was filtered.",
        })
      ),
      columns: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Row fields to show as columns, rendered in exactly this order " +
            "(e.g. ['suite_title', 'title', 'status']). Priority is never a " +
            "column — it renders as an icon next to the title. Omit for " +
            "the kind's defaults.",
        })
      ),
      summary: Type.Optional(
        Type.String({ description: "Optional caption above the table." })
      ),
    }),
    async execute(_toolCallId, params) {
      const p = params as {
        call_id: string;
        title?: string;
        columns?: string[];
        summary?: string;
      };
      const entry = cache.get(p.call_id);
      if (!entry) {
        const known = [...cache.keys()].slice(-5).join(", ") || "none";
        return {
          content: [
            {
              type: "text",
              text:
                `call_id "${p.call_id}" is not a cached list result. Reference a ` +
                `*_list/*_search call from this conversation (recent: ${known}).`,
            },
          ],
        };
      }
      const payload = {
        kind: entry.kind,
        data: { data: entry.rows, meta: { total: entry.total } },
        title: p.title,
        columns: p.columns,
        summary: p.summary,
      };
      console.log(
        `[render_result] call=${p.call_id} kind=${entry.kind} rows=${entry.rows.length}`
      );
      return widgetResult(
        `Rendered ${entry.rows.length} ${entry.kind} rows (of ${entry.total} total) as a table.`,
        payload
      );
    },
  };
}

export interface CachedList {
  kind: string;
  rows: Array<Record<string, unknown>>;
  total: number;
}

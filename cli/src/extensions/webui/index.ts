/**
 * Web-UI-only Pi extension.
 *
 * Bundles everything that only makes sense when the agent is driving the
 * web chat UI:
 *   - Custom tools: render_result, render_list, query_result, render_tree,
 *     render_item, render_chart, ask_question (the web UI renders these as
 *     rich cards; render_* return an ack to the model and the card payload
 *     via `details.widget` — see widget-result.ts).
 *   - A tool_result middleware that caches each MCP `*_list`/`*_search`
 *     result by its tool call id (rows slimmed of code/description bodies)
 *     and replaces large ones in model context with a compact digest
 *     `{call_id, total, fields, sample}`; `render_result` shows the cached
 *     rows to the user, `query_result` computes over them. A "UI notice"
 *     (carrying the call id) tells the model both moves.
 *
 * Loaded only when `createTesteiyaSession({ mode: "web" })`. In TUI mode
 * none of this exists: Pi's built-in `ask` tool (gated behind `hasUI`)
 * handles questioning the user natively.
 */

import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

import { createRenderListTool } from "./tools/render-list.js";
import { createRenderResultTool, type CachedList } from "./tools/render-result.js";
import { createQueryResultTool } from "./tools/query-result.js";
import { renderTreeTool } from "./tools/render-tree.js";
import { renderItemTool } from "./tools/render-item.js";
import { renderChartTool } from "./tools/render-chart.js";
import { createAskQuestionTool } from "./tools/ask-question.js";
import { createUiWidgetTool } from "./tools/ui-widget.js";
import type { AskChannel } from "./ask-channel.js";
import type { WidgetCommandChannel } from "./widget-channel.js";

export { AskChannel } from "./ask-channel.js";
export { WidgetCommandChannel } from "./widget-channel.js";

const LIST_RESULT_RE = /_(testruns|runs|tests|suites|plans)_(?:list|search)$/;
const CACHE_CAP = 50;
// Slimmed results at or below this size stay inline — a digest would save
// nothing and just force an extra query_result round-trip.
const DIGEST_THRESHOLD = 2000;
const SLIM_FIELDS = ["code", "description"];

const RENDER_TOOLS = new Set([
  "render_result",
  "render_list",
  "render_tree",
  "render_item",
  "render_chart",
]);

const RENDER_NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "This content was just rendered to the user as a rich card in the chat UI. " +
  "They can see it fully. " +
  "Do NOT restate the data in your text reply — a 1–2 sentence summary is enough.";

const CHART_NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "Chart rendered inline in the chat. A chart only shows the shape — also show " +
  "the rows behind it: render_result({call_id}) for the query that produced them.";

const WIDGET_NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "This is the result of a widget command you ran. The widget the user is " +
  "looking at has already updated to reflect it. Do NOT restate the returned " +
  "data as a table or list — reply with a short insight only.";

export function createWebUIExtension(
  channel: AskChannel,
  widgetChannel: WidgetCommandChannel
): ExtensionFactory {
  return ((pi: ExtensionAPI) => {
    const listCache = new Map<string, CachedList>();

    pi.registerTool(createRenderResultTool(listCache));
    pi.registerTool(createRenderListTool(listCache));
    pi.registerTool(createQueryResultTool(listCache));
    pi.registerTool(renderTreeTool);
    pi.registerTool(renderItemTool);
    pi.registerTool(renderChartTool);
    pi.registerTool(createAskQuestionTool(channel));
    pi.registerTool(createUiWidgetTool(widgetChannel));

    pi.on("tool_result", async (event: any) => {
      if (event?.isError) return undefined;
      const name = event?.toolName;
      if (typeof name !== "string") return undefined;

      let content = Array.isArray(event.content) ? event.content : [];
      let notice: string | null = null;
      if (name === "render_chart") notice = CHART_NOTICE;
      else if (RENDER_TOOLS.has(name)) notice = RENDER_NOTICE;
      else if (name === "ui_widget") notice = WIDGET_NOTICE;
      else {
        const kind = listKind(name);
        if (kind && typeof event?.toolCallId === "string") {
          content = content.map((item: any) =>
            cacheListResult(item, kind, event.toolCallId, listCache)
          );
          notice = listNotice(event.toolCallId);
        }
      }
      if (!notice) return undefined;

      return {
        content: [...content, { type: "text", text: notice }],
      };
    });
  }) as ExtensionFactory;
}

function listNotice(callId: string): string {
  return (
    "\n\n[UI notice — not part of the data]\n" +
    "The full result is cached server-side under this call id; the user has " +
    "NOT seen it. Show it: " +
    `render_result({call_id: "${callId}", title, columns?}). ` +
    `Compute over it (counts, filters, joins): query_result({call_id: "${callId}", fn}). ` +
    "Never re-type rows or paste them into your reply."
  );
}

function listKind(toolName: unknown): string | null {
  if (typeof toolName !== "string") return null;
  return LIST_RESULT_RE.exec(toolName)?.[1] ?? null;
}

// Slims each row (the full `code`/`description` bodies are tens of thousands
// of tokens the model never needs for listing — `*_get` exists for one item),
// caches the result under its call id for `render_result`/`query_result`, and
// substitutes a compact digest for anything past DIGEST_THRESHOLD so raw rows
// never enter model context.
function cacheListResult(
  item: any,
  kind: string,
  callId: string,
  cache: Map<string, CachedList>
): any {
  if (item?.type !== "text" || typeof item.text !== "string") return item;
  try {
    const parsed = JSON.parse(item.text);
    if (!Array.isArray(parsed?.data)) return item;
    const omitted: string[] = [];
    for (const row of parsed.data) {
      if (!row || typeof row !== "object") continue;
      for (const field of SLIM_FIELDS) {
        if (!(field in row)) continue;
        delete row[field];
        if (!omitted.includes(field)) omitted.push(field);
      }
    }
    const total = parsed.meta?.total ?? parsed.data.length;
    cache.set(callId, { kind, rows: parsed.data, total });
    if (cache.size > CACHE_CAP) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    const slimmed = JSON.stringify(parsed);
    if (slimmed.length <= DIGEST_THRESHOLD) return { ...item, text: slimmed };
    const digest = {
      call_id: callId,
      kind,
      total,
      returned: parsed.data.length,
      fields: fieldsOf(parsed.data),
      omitted_fields: omitted,
      sample: parsed.data.slice(0, 2),
    };
    return { ...item, text: JSON.stringify(digest) };
  } catch {
    return item;
  }
}

function fieldsOf(rows: unknown[]): string[] {
  const fields = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) fields.add(key);
  }
  return [...fields];
}

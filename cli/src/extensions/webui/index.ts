/**
 * Web-UI-only Pi extension.
 *
 * Bundles everything that only makes sense when the agent is driving the
 * web chat UI:
 *   - Custom tools: render_list, render_tree, render_item, ask_question
 *     (the web UI auto-renders these as rich cards / pill buttons).
 *   - A tool_result middleware that appends a short "UI notice" to MCP
 *     `*_list` results and to the render_* + ask_question results so
 *     the model stops repeating rendered content in text.
 *
 * Loaded only when `createTesteiyaSession({ mode: "web" })`. In TUI mode
 * none of this exists: Pi's built-in `ask` tool (gated behind `hasUI`)
 * handles questioning the user natively.
 */

import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

import { renderListTool } from "./tools/render-list.js";
import { renderTreeTool } from "./tools/render-tree.js";
import { renderItemTool } from "./tools/render-item.js";
import { createAskQuestionTool } from "./tools/ask-question.js";
import { createUiWidgetTool } from "./tools/ui-widget.js";
import type { AskChannel } from "./ask-channel.js";
import type { WidgetCommandChannel } from "./widget-channel.js";

export { AskChannel } from "./ask-channel.js";
export { WidgetCommandChannel } from "./widget-channel.js";

const LIST_SUFFIXES = [
  "_runs_list",
  "_tests_list",
  "_suites_list",
  "_plans_list",
  "_testruns_list",
];

const RENDER_TOOLS = new Set(["render_list", "render_tree", "render_item"]);

const LIST_NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "The user has NOT seen this result — it sits in a collapsed tool card they would have to expand. " +
  "If these rows are part of your answer, call render_list with them (pass the {data, meta} through, " +
  "set a title naming the filter and window). " +
  "Do NOT paste the list as a markdown table, bullets, or JSON in your reply.";

const RENDER_NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "This content was just rendered to the user as a rich card in the chat UI. " +
  "They can see it fully. " +
  "Do NOT restate the data in your text reply — a 1–2 sentence summary is enough.";

const WIDGET_NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "This is the result of a widget command you ran. The widget the user is " +
  "looking at has already updated to reflect it. Do NOT restate the returned " +
  "data as a table or list — reply with a short insight only.";

function isMcpList(toolName: unknown): boolean {
  if (typeof toolName !== "string") return false;
  return LIST_SUFFIXES.some((s) => toolName.endsWith(s));
}

export function createWebUIExtension(
  channel: AskChannel,
  widgetChannel: WidgetCommandChannel
): ExtensionFactory {
  return ((pi: ExtensionAPI) => {
    pi.registerTool(renderListTool);
    pi.registerTool(renderTreeTool);
    pi.registerTool(renderItemTool);
    pi.registerTool(createAskQuestionTool(channel));
    pi.registerTool(createUiWidgetTool(widgetChannel));

    pi.on("tool_result", async (event: any) => {
      if (event?.isError) return undefined;
      const name = event?.toolName;
      if (typeof name !== "string") return undefined;

      let notice: string | null = null;
      if (RENDER_TOOLS.has(name)) notice = RENDER_NOTICE;
      else if (name === "ui_widget") notice = WIDGET_NOTICE;
      else if (isMcpList(name)) notice = LIST_NOTICE;
      if (!notice) return undefined;

      const content = Array.isArray(event.content) ? event.content : [];
      return {
        content: [...content, { type: "text", text: notice }],
      };
    });
  }) as ExtensionFactory;
}

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { widgetResult } from "./widget-result.js";

/**
 * `render_item` — display a single Testomat.io entity in detail.
 * Kinds: test, suite, run, testrun, plan. Server-side a no-op;
 * the UI dispatches to per-kind detail cards.
 */
export const renderItemTool: ToolDefinition = {
  name: "render_item",
  label: "Render Item",
  description:
    "Display one Testomat.io entity (a single test, suite, run, testrun, " +
    "or plan) as a detail card. Use when the user asked about one thing " +
    "specifically, or when you want to highlight a single record. " +
    "For multiple items use `render_list` instead.",
  parameters: Type.Object({
    kind: Type.Union(
      [
        Type.Literal("test"),
        Type.Literal("suite"),
        Type.Literal("run"),
        Type.Literal("testrun"),
        Type.Literal("plan"),
      ],
      { description: "What type of entity is being shown." }
    ),
    data: Type.Object(
      {},
      {
        additionalProperties: true,
        description:
          "The entity object, usually the full MCP result from a " +
          "`*_get` call. Pass everything you have; the UI picks the " +
          "fields it needs.",
      }
    ),
    title: Type.Optional(
      Type.String({
        description:
          "Short card header. Defaults to the entity's title/name if " +
          "omitted, but prefer to pass an explicit one.",
      })
    ),
    summary: Type.Optional(
      Type.String({
        description: "Optional one-liner context shown under the title.",
      })
    ),
  }),
  async execute(_toolCallId, params) {
    const p = params as { kind: string; title?: string };
    console.log(`[render_item] kind=${p.kind} title="${p.title ?? "(none)"}"`);
    return widgetResult(
      `Rendered a ${p.kind} detail card${p.title ? ` "${p.title}"` : ""}.`,
      params
    );
  },
};

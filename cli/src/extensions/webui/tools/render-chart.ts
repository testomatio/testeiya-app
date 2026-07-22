import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { widgetResult } from "./widget-result.js";

/**
 * `render_chart` — display a chart in the chat. Server-side a no-op echo;
 * the UI renders it with the same recharts components as `chart` blocks.
 * Point names matching run statuses (passed/failed/…) auto-use status colors.
 */
export const renderChartTool: ToolDefinition = {
  name: "render_chart",
  label: "Render Chart",
  description:
    "Display a chart in the chat UI. Use for any aggregate — counts, pass " +
    "rate, distribution, trend, comparison.",
  parameters: Type.Object({
    type: Type.Union(
      [
        Type.Literal("bar"),
        Type.Literal("line"),
        Type.Literal("area"),
        Type.Literal("pie"),
      ],
      { description: "bar to compare, line/area over time, pie for share." }
    ),
    title: Type.String({
      description: "What the chart shows, including filter and window.",
    }),
    data: Type.Array(Type.Object({}, { additionalProperties: true }), {
      description:
        "One object per point: {name, value}, or {name, <seriesKey>: number, …} " +
        "with `series` for multiple series. Status names (passed/failed/…) get " +
        "status colors automatically.",
      minItems: 1,
    }),
    series: Type.Optional(
      Type.Array(
        Type.Object({ key: Type.String(), label: Type.Optional(Type.String()) }),
        { description: "Series keys for multi-series rows. Omit for {name, value}." }
      )
    ),
  }),
  async execute(_toolCallId, params) {
    const p = params as { type?: string; title?: string; data?: unknown[] };
    console.log(
      `[render_chart] ${p.type} "${p.title ?? ""}" points=${p.data?.length ?? 0}`
    );
    return widgetResult(
      `Rendered a ${p.type} chart "${p.title ?? ""}" (${p.data?.length ?? 0} points).`,
      params
    );
  },
};

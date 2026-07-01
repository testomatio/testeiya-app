import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import type { WidgetCommandChannel } from "../widget-channel.js";

/**
 * `ui_widget` — the single tool for driving the widget the user is currently
 * looking at. The active widget's id and its legal actions/params are given to
 * you in the `<active_widget>` context block on each turn. Calling this runs the
 * SAME action the user's buttons trigger (e.g. paginate, filter, open) — the
 * user sees the widget change — and returns the resulting data so you can read
 * it (e.g. page 2 of a list).
 *
 * Like `ask_question`, `execute` BLOCKS on the connection's channel until the
 * client has run the command and returned its result, so the agent loop is
 * parked rather than emitting filler text.
 */
export function createUiWidgetTool(channel: WidgetCommandChannel): ToolDefinition {
  return {
    name: "ui_widget",
    label: "Control widget",
    description:
      "Drive the widget currently shown to the user (the one described in the " +
      "<active_widget> context block). Pass that block's `id` as `widget_id`, an " +
      "`action` from its listed actions, and the `params` for that action. The " +
      "command runs the same control the user's buttons do — they see it happen — " +
      "and the resulting widget data is returned to you. Use it to paginate " +
      "(`{action:'list', params:{page:2}}`), filter, or open an item. Only the " +
      "active widget is controllable. Actions flagged [destructive] change data; " +
      "confirm with `ask_question` before calling them.",
    parameters: Type.Object({
      widget_id: Type.String({
        description: "The active widget's id, taken from the <active_widget> block.",
      }),
      action: Type.String({
        description: "One of the action names listed for that widget in <active_widget>.",
      }),
      params: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description: "Arguments for the action, per its declared params (e.g. {page:2}).",
          }
        )
      ),
    }),
    async execute(toolCallId, params, signal) {
      const p = params as { widget_id: string; action: string; params?: unknown };
      console.log(`[ui_widget] ${p.widget_id} → ${p.action}(${JSON.stringify(p.params ?? {})})`);
      const result = await channel.wait(toolCallId, signal);
      return { content: [{ type: "text", text: result }] };
    },
  };
}

import { Type } from "@oh-my-pi/omptype/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { widgetResult } from "./widget-result.js";

/**
 * `render_tree` — visualize a nested hierarchy (suites→suites→tests, or
 * the pulled markdown directory tree). Server-side a no-op; the UI
 * walks `nodes` recursively and renders via AI-Elements FileTree.
 */
export const renderTreeTool: ToolDefinition = {
  name: "render_tree",
  label: "Render Tree",
  loadMode: "essential",
  approval: "read",
  description:
    "Render a nested suite/test hierarchy (or any folder-and-leaf tree) " +
    "as an interactive collapsible tree in the chat. Use when showing " +
    "project structure, the workspace's pulled markdown tree, or the " +
    "suite hierarchy. Always pass a `title` describing what this tree is.",
  parameters: Type.Object({
    title: Type.Optional(
      Type.String({
        description:
          "Short header (e.g. 'Suite tree of codeceptjs').",
      })
    ),
    nodes: Type.Array(
      Type.Object(
        {
          name: Type.String(),
          kind: Type.Union(
            [
              Type.Literal("suite"),
              Type.Literal("test"),
              Type.Literal("folder"),
              Type.Literal("file"),
            ],
            { description: "'suite'/'folder' have children; 'test'/'file' are leaves." }
          ),
          status: Type.Optional(
            Type.String({
              description:
                "Optional run status for this node (e.g. 'passed', 'failed', " +
                "'skipped', 'pending'). Renders a colored status mark next to " +
                "the node — use it to show each test's latest result in place.",
            })
          ),
          id: Type.Optional(Type.String()),
          path: Type.Optional(Type.String()),
          children: Type.Optional(Type.Array(Type.Any())),
        },
        { additionalProperties: true }
      ),
      {
        description:
          "Top-level nodes. Each node can nest children recursively. Use " +
          "'suite' or 'folder' for expandable parents, 'test' or 'file' " +
          "for leaf nodes.",
        minItems: 1,
      }
    ),
  }),
  async execute(_toolCallId, params) {
    const p = params as { title?: string; nodes: unknown[] };
    console.log(
      `[render_tree] "${p.title ?? "(untitled)"}" with ${p.nodes?.length ?? 0} root nodes`
    );
    return widgetResult(
      `Rendered tree "${p.title ?? "(untitled)"}" (${p.nodes?.length ?? 0} root nodes).`,
      params
    );
  },
};

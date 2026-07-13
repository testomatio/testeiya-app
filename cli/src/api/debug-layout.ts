import { clientLayout } from "../debug-bus.js";

/*
 * `GET /api/debug/layout?session=<id>` — the browser's last-reported map of the
 * big UI components (see `lib/debug/layout-map.ts`), returned both as the raw
 * tree and as a ready-to-read indented text tree so an agent can understand the
 * rendered layout (coordinates + sizes, container → child) without a browser.
 * The map is only as fresh as the last client report (page load, panel-open, or
 * every 15s while the Debug panel is on).
 */

export async function debugLayout(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const captured = clientLayout(sessionId);
  if (!captured || !captured.layout) {
    return Response.json({
      layout: null,
      text: "",
      note: "No layout reported yet — open the app (turn on the Debug panel to keep it fresh) so the browser reports its rendered DOM.",
    });
  }
  const lines: string[] = [];
  renderNode(captured.layout as LayoutNode, 0, lines);
  return Response.json({
    reportedAt: captured.reportedAt,
    url: captured.url,
    layout: captured.layout,
    text: lines.join("\n"),
  });
}

function renderNode(node: LayoutNode, depth: number, lines: string[]): void {
  const size = node.w || node.h ? ` ${node.w}×${node.h} @${node.x},${node.y}` : "";
  lines.push(`${"  ".repeat(depth)}${node.name}${size}`);
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) renderNode(child, depth + 1, lines);
}

interface LayoutNode {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: LayoutNode[];
}

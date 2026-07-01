/**
 * Frontend presentation for the predefined MCP services. Keyed by the same
 * `id` as the backend catalog (`cli/src/mcp-catalog.ts`). The installable
 * set + config come from `GET /api/mcp/catalog`; this only adds logos/blurbs so
 * config and presentation can't drift.
 *
 * Logos are SVGs in `public/mcp/<id>.svg` (served at `/mcp/<id>.svg`). Service
 * brand marks are a deliberate exception to the indigo-only palette.
 */

export interface McpServiceDisplay {
  logo: string;
  blurb: string;
}

export const MCP_SERVICE_DISPLAY: Record<string, McpServiceDisplay> = {
  linear: {
    logo: "/mcp/linear.svg",
    blurb: "Issues, projects, and cycles from Linear.",
  },
  atlassian: {
    logo: "/mcp/jira.svg",
    blurb: "Jira issues and Confluence pages via Atlassian.",
  },
  figma: {
    logo: "/mcp/figma.svg",
    blurb: "Designs, frames, and Dev Mode context from Figma.",
  },
  miro: {
    logo: "/mcp/miro.svg",
    blurb: "Boards, frames, and sticky notes from Miro.",
  },
};

export function mcpServiceDisplay(id: string): McpServiceDisplay {
  return (
    MCP_SERVICE_DISPLAY[id] ?? {
      logo: "/mcp/generic.svg",
      blurb: "",
    }
  );
}

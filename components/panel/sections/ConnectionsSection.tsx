"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MdiIcon } from "@/components/icons";
import { mdiConnection } from "@mdi/js";
import { SectionShell } from "../SectionShell";
import { McpServersDialog } from "@/components/McpServersDialog";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";
import type { PanelSectionProps } from "@/lib/panel/types";

/**
 * Connections service (shell). Inline MCP management (list + toggles, add via
 * dialog) lands next iteration; for now it owns the entry point that used to
 * live in the header, opening the existing MCP servers dialog for the active
 * session.
 */
export function ConnectionsSection({ active, onToggle }: PanelSectionProps) {
  const { sessionId } = useWorkspace();
  const [mcpOpen, setMcpOpen] = useState(false);

  return (
    <SectionShell
      icon={<MdiIcon path={mdiConnection} className="size-4" />}
      title="Connections"
      active={active}
      onToggle={onToggle}
    >
      <div className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground">
          Connect the agent to external tools over MCP. Inline management is
          coming soon.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!sessionId}
          onClick={() => setMcpOpen(true)}
        >
          Manage MCP servers
        </Button>
        {!sessionId && (
          <p className="text-[11px] text-muted-foreground">
            Start a session to manage connections.
          </p>
        )}
      </div>

      <McpServersDialog
        open={mcpOpen}
        onOpenChange={setMcpOpen}
        sessionId={sessionId ?? undefined}
      />
    </SectionShell>
  );
}

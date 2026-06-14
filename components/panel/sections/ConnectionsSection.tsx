"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionShell } from "../SectionShell";
import { McpServersDialog } from "@/components/McpServersDialog";
import { mcpServiceDisplay } from "@/lib/mcp-services";
import { useConnectionsService } from "@/lib/services/StoreProvider";
import type { McpConnectionStatus, McpServer } from "@/lib/services/types";
import type { PanelSectionProps } from "@/lib/panel/types";

/**
 * Connections service. Lists the active session's configured MCP servers inline
 * (enable/disable, remove) driven by ConnectionsService, and opens the full
 * dialog to add services / custom servers. A thin `observer` over the service:
 * it renders observable state and forwards clicks; all logic lives in the
 * service. Changes apply on the next agent session (clear chat / reload).
 */
export const ConnectionsSection = observer(function ConnectionsSection({
  active,
  onToggle,
  initializing,
}: PanelSectionProps) {
  const conn = useConnectionsService();
  const [mcpOpen, setMcpOpen] = useState(false);

  useEffect(() => {
    if (active && conn.sessionId) void conn.load();
  }, [active, conn, conn.sessionId]);

  return (
    <SectionShell
      title="Connections"
      active={active}
      onToggle={onToggle}
      actions={
        <>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={!conn.sessionId}
                onClick={() => setMcpOpen(true)}
                aria-label="Add connection"
              >
                <Icon name="add" className="size-4" />
              </Button>
            } />
            <TooltipContent><p>Add a service or custom MCP server</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={!conn.sessionId}
                onClick={() => void conn.load()}
                aria-label="Refresh connections"
              >
                <Icon
                  name="refresh"
                  className={conn.loading ? "size-4 animate-spin" : "size-4"}
                />
              </Button>
            } />
            <TooltipContent><p>Refresh connections</p></TooltipContent>
          </Tooltip>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-2">
        {initializing ? <ConnectionsSkeleton /> : <ConnectionsBody conn={conn} onManage={() => setMcpOpen(true)} />}
      </div>

      <McpServersDialog open={mcpOpen} onOpenChange={setMcpOpen} />
    </SectionShell>
  );
});

const ConnectionsBody = observer(function ConnectionsBody({
  conn,
  onManage,
}: {
  conn: ReturnType<typeof useConnectionsService>;
  onManage: () => void;
}) {
  if (!conn.sessionId) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon name="linked_services" className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No active session</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Send a message to start a session, then manage connections here.
        </p>
      </div>
    );
  }
  if (conn.loading && conn.servers.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5 shrink-0" /> Loading connections…
      </div>
    );
  }
  if (conn.servers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon name="add_link" className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No connections yet</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect a service or custom MCP server to extend the agent.
        </p>
        <Button size="sm" variant="outline" className="mt-1 w-full" onClick={onManage}>
          <Icon name="add" className="size-3.5" /> Add connection
        </Button>
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-1.5">
        {conn.servers.map((s) => (
          <ConnectionRow
            key={s.name}
            server={s}
            status={conn.connectionStatus(s.name)}
            busy={conn.busy === s.name}
            authBusy={conn.authBusy === s.name}
            onToggle={(enabled) => void conn.toggle(s.name, enabled)}
            onRemove={() => void conn.remove(s.name)}
            onAuthenticate={() => void conn.authenticate(s.name)}
          />
        ))}
      </ul>
      <Button size="sm" variant="outline" className="w-full" onClick={onManage}>
        Manage MCP servers
      </Button>
    </>
  );
});

function ConnectionRow({
  server,
  status,
  busy,
  authBusy,
  onToggle,
  onRemove,
  onAuthenticate,
}: {
  server: McpServer;
  status: McpConnectionStatus;
  busy: boolean;
  authBusy: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onAuthenticate: () => void;
}) {
  const display = mcpServiceDisplay(server.name);
  const isOauth = server.auth === "oauth";
  return (
    <li className="flex items-center gap-2 rounded-md border px-2 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={display.logo} alt="" aria-hidden className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <StatusDot status={status} enabled={server.enabled} />
          <span className="truncate text-xs font-medium">{server.name}</span>
          {server.source === "project" && (
            <Badge variant="secondary" className="shrink-0 text-[9px]">
              project
            </Badge>
          )}
          {isOauth && (
            <Badge
              variant={server.authenticated ? "secondary" : "outline"}
              className="shrink-0 text-[9px] uppercase"
            >
              {server.authenticated ? "authed" : "oauth"}
            </Badge>
          )}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">
          {server.url ?? server.command ?? server.type}
        </div>
      </div>
      {isOauth && (
        <Tooltip>
          <TooltipTrigger render={
            <Button
              size="sm"
              variant="ghost"
              className="size-6 p-0 text-muted-foreground hover:text-foreground"
              disabled={authBusy}
              onClick={onAuthenticate}
              aria-label="Authenticate connection"
            >
              {authBusy ? (
                <Spinner className="size-3" />
              ) : (
                <Icon name="key" className="size-3.5" />
              )}
            </Button>
          } />
          <TooltipContent><p>{server.authenticated ? "Re-authenticate" : "Authenticate in browser"}</p></TooltipContent>
        </Tooltip>
      )}
      {server.removable && (
        <Tooltip>
          <TooltipTrigger render={
            <Button
              size="sm"
              variant="ghost"
              className="size-6 p-0 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={onRemove}
              aria-label="Remove connection"
            >
              {busy ? (
                <Spinner className="size-3" />
              ) : (
                <Icon name="delete" className="size-3.5" />
              )}
            </Button>
          } />
          <TooltipContent><p>Remove connection</p></TooltipContent>
        </Tooltip>
      )}
      <Switch
        checked={server.enabled}
        onCheckedChange={(checked) => onToggle(checked)}
      />
    </li>
  );
}

function StatusDot({
  status,
  enabled,
}: {
  status: McpConnectionStatus;
  enabled: boolean;
}) {
  if (!enabled) {
    return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" title="Disabled" />;
  }
  const colorMap: Record<McpConnectionStatus, string> = {
    connected: "bg-run-passed",
    disconnected: "bg-run-failed",
    unknown: "bg-run-skipped",
  };
  const labelMap: Record<McpConnectionStatus, string> = {
    connected: "Connected",
    disconnected: "Not connected (failed or pending auth)",
    unknown: "Pending — start a session to connect",
  };
  return <span className={cn("size-1.5 shrink-0 rounded-full", colorMap[status])} title={labelMap[status]} />;
}

function ConnectionsSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {(["w-3/4", "w-1/2", "w-4/5"] as const).map((w, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={`h-3 ${w}`} />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
          <Skeleton className="size-6 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}


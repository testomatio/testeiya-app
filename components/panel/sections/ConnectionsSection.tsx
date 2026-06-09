"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { MdiIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  mdiConnection,
  mdiRefresh,
  mdiPlus,
  mdiTrashCanOutline,
  mdiKeyOutline,
} from "@mdi/js";
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
}: PanelSectionProps) {
  const conn = useConnectionsService();
  const [mcpOpen, setMcpOpen] = useState(false);

  useEffect(() => {
    if (active && conn.sessionId) void conn.load();
  }, [active, conn, conn.sessionId]);

  return (
    <SectionShell
      icon={<MdiIcon path={mdiConnection} className="size-4" />}
      title="Connections"
      active={active}
      onToggle={onToggle}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            disabled={!conn.sessionId}
            onClick={() => setMcpOpen(true)}
            title="Add a service or custom MCP server"
            aria-label="Add connection"
          >
            <MdiIcon path={mdiPlus} className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            disabled={!conn.sessionId}
            onClick={() => void conn.load()}
            title="Refresh connections"
            aria-label="Refresh connections"
          >
            <MdiIcon
              path={mdiRefresh}
              className={conn.loading ? "size-3.5 animate-spin" : "size-3.5"}
            />
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-2">
        <ConnectionsBody conn={conn} onManage={() => setMcpOpen(true)} />
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
      <p className="text-[11px] text-muted-foreground">
        Start a session to manage connections.
      </p>
    );
  }
  if (conn.loading && conn.servers.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Spinner className="size-3" /> Loading…
      </div>
    );
  }
  if (conn.servers.length === 0) {
    return (
      <>
        <p className="text-[11px] text-muted-foreground">
          No connections yet. Add a service or a custom MCP server.
        </p>
        <Button size="sm" variant="outline" className="w-full" onClick={onManage}>
          <MdiIcon path={mdiPlus} className="size-3.5" /> Add connection
        </Button>
      </>
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
        <Button
          size="sm"
          variant="ghost"
          className="size-6 p-0 text-muted-foreground hover:text-foreground"
          disabled={authBusy}
          onClick={onAuthenticate}
          title={server.authenticated ? "Re-authenticate" : "Authenticate in browser"}
          aria-label="Authenticate connection"
        >
          {authBusy ? (
            <Spinner className="size-3" />
          ) : (
            <MdiIcon path={mdiKeyOutline} className="size-3.5" />
          )}
        </Button>
      )}
      {server.removable && (
        <Button
          size="sm"
          variant="ghost"
          className="size-6 p-0 text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={onRemove}
          title="Remove connection"
          aria-label="Remove connection"
        >
          {busy ? (
            <Spinner className="size-3" />
          ) : (
            <MdiIcon path={mdiTrashCanOutline} className="size-3.5" />
          )}
        </Button>
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
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "disconnected"
        ? "bg-red-500"
        : "bg-amber-500";
  const label =
    status === "connected"
      ? "Connected"
      : status === "disconnected"
        ? "Not connected (failed or pending auth)"
        : "Pending — start a session to connect";
  return <span className={cn("size-1.5 shrink-0 rounded-full", color)} title={label} />;
}

"use client";

import { useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import {
  mdiChatOutline,
  mdiChatPlusOutline,
  mdiPencilOutline,
} from "@mdi/js";
import { ChevronDownIcon, Trash2Icon } from "lucide-react";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { usePanel } from "@/lib/panel/PanelContext";
import { MdiIcon } from "@/components/icons";
import { BrowserControls } from "@/components/BrowserControls";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionsService } from "@/lib/services/StoreProvider";
import { useLayoutNode } from "@/lib/debug/layout-registry";

/**
 * The chat column's header: shows the active conversation's summary as the
 * title and a dropdown to switch between, create, delete, or rename chats.
 * A thin `observer` over SessionsService (which the page wires to the live
 * agent socket). Replaces the old "Chats" sidebar section.
 */
export const ChatPanelHeader = observer(function ChatPanelHeader({
  mcpStatus,
  canCollapse,
}: {
  /** Live MCP connection badge, rendered at the head of the panel. */
  mcpStatus?: ReactNode;
  /** Whether the chat can be collapsed (only when a widget fills the row). */
  canCollapse?: boolean;
}) {
  const sessions = useSessionsService();
  const { setChatOpen } = usePanel();
  const layoutRef = useLayoutNode("ChatPanelHeader");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const activeConv = sessions.conversations.find(
    (c) => c.id === sessions.activeId
  );
  const title = activeConv?.title || activeConv?.firstMessage || "New chat";

  const commit = () => {
    const id = sessions.activeId;
    const next = draft.trim();
    setEditing(false);
    if (id && next) void sessions.rename(id, next);
  };

  if (editing) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
        />
      </div>
    );
  }

  return (
    <div ref={layoutRef} className="flex h-12 shrink-0 items-center gap-1 border-b pr-1">
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void sessions.load();
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60"
              title="Switch chat"
            />
          }
        >
          <MdiIcon
            path={mdiChatOutline}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuItem
            disabled={!sessions.sessionId}
            onClick={() => sessions.createNew()}
          >
            <MdiIcon path={mdiChatPlusOutline} className="size-4" />
            New chat
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {sessions.conversations.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {sessions.loading ? "Loading chats…" : "No chats yet."}
            </div>
          )}
          {sessions.conversations.map((conv) => {
            const isActive = conv.id === sessions.activeId;
            const label = conv.title || conv.firstMessage || "Untitled chat";
            return (
              <DropdownMenuItem
                key={conv.id}
                className={cn("group/row gap-2", isActive && "bg-primary/10")}
                onClick={() => void sessions.select(conv.id)}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      isActive && "font-medium text-primary"
                    )}
                  >
                    {label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {relativeTime(conv.modified)} · {conv.messageCount} msg
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void sessions.remove(conv.id);
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {mcpStatus}

      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 shrink-0 p-0"
        disabled={!sessions.activeId}
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        title="Rename chat"
        aria-label="Rename chat"
      >
        <MdiIcon path={mdiPencilOutline} className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 shrink-0 p-0"
        disabled={!sessions.sessionId}
        onClick={() => sessions.createNew()}
        title="New chat"
        aria-label="New chat"
      >
        <MdiIcon path={mdiChatPlusOutline} className="size-3.5" />
      </Button>
      <BrowserControls />
      {canCollapse && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 shrink-0 p-0"
          onClick={() => setChatOpen(false)}
          title="Collapse chat"
          aria-label="Collapse chat"
        >
          <Icon name="dock_to_right" className="size-4" />
        </Button>
      )}
    </div>
  );
});

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

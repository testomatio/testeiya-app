"use client";

import { useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { mdiChatOutline, mdiPencilOutline } from "@mdi/js";
import { Icon, PlusIcon, XIcon } from "@/lib/icons";
import { usePanel } from "@/lib/panel/PanelContext";
import { MdiIcon } from "@/components/icons";
import { BrowserControls } from "@/components/BrowserControls";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChatHistoryDialog } from "@/components/ChatHistoryDialog";
import {
  useSessionsService,
  useChatTabsService,
} from "@/lib/services/StoreProvider";
import { useLayoutNode } from "@/lib/debug/layout-registry";
import { cn } from "@/lib/utils";

/**
 * The chat column's header: the active conversation's title, one square per
 * open chat tab (colored initial, pulsating while that chat is processing),
 * a history button opening the Chat History modal, and a "+" that spawns a
 * new parallel chat tab. A thin `observer` over ChatTabsService +
 * SessionsService.
 */
export const ChatPanelHeader = observer(function ChatPanelHeader({
  mcpStatus,
  canCollapse,
}: {
  /** Live MCP connection badge, rendered before the right-side actions. */
  mcpStatus?: ReactNode;
  /** Whether the chat can be collapsed (only when a widget fills the row). */
  canCollapse?: boolean;
}) {
  const sessions = useSessionsService();
  const tabs = useChatTabsService();
  const { setChatOpen } = usePanel();
  const layoutRef = useLayoutNode("ChatPanelHeader");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeConv = sessions.conversations.find(
    (c) => c.id === sessions.activeId
  );
  const title = activeConv?.title || activeConv?.firstMessage || "New chat";

  let newChatLabel = "New chat";
  if (!tabs.canOpen) newChatLabel = "New chat (max 5)";

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
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="flex min-w-0 shrink items-center gap-1.5 px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60"
        title="Chat history"
      >
        <MdiIcon
          path={mdiChatOutline}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate text-sm font-medium">
          {title}
        </span>
      </button>

      {tabs.visibleTabs.map((tab) => {
        const conv = sessions.conversations.find(
          (c) => c.id === tab.conversationId
        );
        const label = conv?.title || conv?.firstMessage || "New chat";
        const letter = (label.match(/[a-zA-Z0-9]/)?.[0] ?? "N").toUpperCase();
        const busy = tab.status === "submitted" || tab.status === "streaming";
        return (
          <Tooltip key={tab.key}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => tabs.activate(tab.key)}
                  className={cn(
                    "group/tab relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                    tabColor(tab.key),
                    busy && "animate-pulse",
                    tab.key === tabs.activeKey && "ring-2 ring-primary"
                  )}
                  aria-label={label}
                >
                  <span>{letter}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      tabs.close(tab.key);
                    }}
                    className="absolute -top-1 -right-1 hidden size-3.5 items-center justify-center rounded-full border bg-background text-muted-foreground group-hover/tab:flex hover:text-destructive"
                    aria-label="Close chat"
                    title="Close chat"
                  >
                    <XIcon className="size-3" />
                  </span>
                </button>
              }
            />
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 shrink-0 p-0"
              disabled={!sessions.sessionId}
              onClick={() => setHistoryOpen(true)}
              aria-label="Chat history"
            >
              <Icon name="history" className="size-4" />
            </Button>
          }
        />
        <TooltipContent>Chat history</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 shrink-0 p-0"
              disabled={!sessions.sessionId || !tabs.canOpen}
              onClick={() => tabs.openTab()}
              aria-label={newChatLabel}
            >
              <PlusIcon className="size-4" />
            </Button>
          }
        />
        <TooltipContent>{newChatLabel}</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1" />

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
      <ChatHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
});

const TAB_COLORS = [
  "bg-primary text-primary-foreground",
  "bg-primary/20 text-primary",
  "bg-muted text-foreground",
  "bg-primary/40 text-primary",
  "bg-foreground/80 text-background",
];

function tabColor(key: string): string {
  const n = Number(key.slice(4));
  if (!Number.isFinite(n)) return TAB_COLORS[0];
  return TAB_COLORS[n % TAB_COLORS.length];
}

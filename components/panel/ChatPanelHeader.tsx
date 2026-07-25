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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatHistoryDialog } from "@/components/ChatHistoryDialog";
import {
  useSessionsService,
  useChatTabsService,
} from "@/lib/services/StoreProvider";
import type { ChatTab } from "@/lib/services/chat-tabs-service";
import { useLayoutNode } from "@/lib/debug/layout-registry";

/**
 * The chat column's header: the static "Agent" title (the active conversation's
 * full title lives in its tooltip), a tab-switch with one readable tab per open
 * chat — each carrying a run/done/error status icon — a history button opening
 * the Agents modal, and a "+" that spawns a new parallel chat tab. The tab strip
 * wraps to a second row when it no longer fits. A thin `observer` over
 * ChatTabsService + SessionsService.
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
  const title = activeConv?.title || activeConv?.firstMessage || "New agent";

  let newChatLabel = "New agent";
  if (!tabs.canOpen) newChatLabel = "New agent (max 5)";

  const commit = () => {
    const id = sessions.activeId;
    const next = draft.trim();
    setEditing(false);
    if (id && next) void sessions.rename(id, next);
  };

  if (editing) {
    return (
      <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2">
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
    <div
      ref={layoutRef}
      className="flex min-h-12 shrink-0 items-center gap-2 border-b py-1.5 pr-1 pl-3"
    >
      <Tooltip>
        <TooltipTrigger
          render={<span className="shrink-0 text-sm font-semibold">Agent</span>}
        />
        <TooltipContent>
          <p className="line-clamp-2">{title}</p>
        </TooltipContent>
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

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 shrink-0 p-0"
              disabled={!sessions.sessionId}
              onClick={() => setHistoryOpen(true)}
              aria-label="Agent history"
            >
              <Icon name="history" className="size-4" />
            </Button>
          }
        />
        <TooltipContent>Agent history</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {tabs.visibleTabs.length > 0 && (
          <Tabs
            value={tabs.activeKey ?? ""}
            onValueChange={(value) => tabs.activate(value as string)}
          >
            <TabsList className="h-auto max-w-full flex-wrap">
              {tabs.visibleTabs.map((tab) => {
                const conv = sessions.conversations.find(
                  (c) => c.id === tab.conversationId
                );
                const label = conv?.title || conv?.firstMessage || "New agent";
                return (
                  <Tooltip key={tab.key}>
                    <TooltipTrigger
                      render={
                        <TabsTrigger
                          value={tab.key}
                          className="group/tab flex-none gap-1.5 px-2 py-1"
                        >
                          {statusIcon(tab)}
                          <span className="min-w-[15ch] max-w-[18ch] truncate text-left">
                            {label}
                          </span>
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.stopPropagation();
                              tabs.close(tab.key);
                            }}
                            className="flex size-3.5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/tab:opacity-100 hover:text-destructive"
                            aria-label="Close agent"
                          >
                            <XIcon className="size-3" />
                          </span>
                        </TabsTrigger>
                      }
                    />
                    <TooltipContent>
                      <p className="line-clamp-2">{label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TabsList>
          </Tabs>
        )}
      </div>

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
        title="Rename agent"
        aria-label="Rename agent"
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
          title="Collapse agent"
          aria-label="Collapse agent"
        >
          <Icon name="dock_to_right" className="size-4" />
        </Button>
      )}
      <ChatHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
});

function statusIcon(tab: ChatTab): ReactNode {
  if (tab.status === "submitted" || tab.status === "streaming") {
    return (
      <Icon
        name="progress_activity"
        className="size-3.5 shrink-0 animate-spin text-primary"
      />
    );
  }
  if (tab.error) {
    return <Icon name="error" className="size-3.5 shrink-0 text-destructive" />;
  }
  if (tab.doneUnseen) {
    return (
      <Icon name="check_circle" className="size-3.5 shrink-0 text-run-passed" />
    );
  }
  return (
    <MdiIcon
      path={mdiChatOutline}
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  );
}

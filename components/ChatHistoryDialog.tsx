"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SearchIcon, PlusIcon, Trash2Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useSessionsService } from "@/lib/services/StoreProvider";

export const ChatHistoryDialog = observer(function ChatHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sessions = useSessionsService();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    void sessions.load();
    setQuery("");
  }, [open, sessions]);

  const term = query.trim().toLowerCase();
  const filtered = sessions.conversations.filter((conv) => {
    if (!term) return true;
    const label = `${conv.title || ""} ${conv.firstMessage || ""}`.toLowerCase();
    return label.includes(term);
  });

  const openChat = (id: string) => {
    void sessions.select(id);
    onOpenChange(false);
  };

  const createNew = () => {
    sessions.createNew();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agents</DialogTitle>
        </DialogHeader>
        <div className="mt-3 flex min-h-0 flex-col border-t">
          <div className="border-b p-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents"
                className="pl-7"
              />
            </div>
          </div>
          <div className="max-h-[60vh] min-h-32 overflow-y-auto p-1">
            {sessions.loading && sessions.conversations.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                Loading agents…
              </div>
            )}
            {!sessions.loading && sessions.conversations.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No agents yet.
              </div>
            )}
            {sessions.conversations.length > 0 && filtered.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No matching agents.
              </div>
            )}
            {filtered.map((conv) => {
              const isActive = conv.id === sessions.activeId;
              const label = conv.title || conv.firstMessage || "Untitled agent";
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => openChat(conv.id)}
                  className="group/row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
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
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      void sessions.remove(conv.id);
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
                    aria-label="Delete agent"
                    title="Delete agent"
                  >
                    <Trash2Icon className="size-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              disabled={!sessions.sessionId}
              onClick={createNew}
            >
              <PlusIcon className="size-3.5" />
              New agent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

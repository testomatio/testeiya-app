"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useMemoryService } from "@/lib/services/StoreProvider";

/**
 * Read-only viewer for the project's autonomous memory (`MEMORY.md`,
 * consolidated by the SDK from past sessions for this workspace). Opened from
 * the header workspace dropdown. The agent writes memory by working in the
 * project — there is no manual edit here — so this offers view + rebuild + clear.
 */
export const MemoryDialog = observer(function MemoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const memory = useMemoryService();

  useEffect(() => {
    if (open) void memory.load();
  }, [open, memory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project memory</DialogTitle>
          <DialogDescription>
            Durable knowledge the agent consolidated from past sessions in this
            project. It is extracted automatically and injected into future
            sessions; secret-like values are redacted, so it is not a store for
            credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] min-h-[8rem] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
          {memory.loading && <Shimmer as="span">Loading memory…</Shimmer>}
          {!memory.loading && memory.error && (
            <span className="text-destructive">{memory.error}</span>
          )}
          {!memory.loading && !memory.error && !memory.content && (
            <span className="text-muted-foreground">
              No memory yet. As you work in this project, the agent consolidates
              durable facts here between sessions.
            </span>
          )}
          {!memory.loading && memory.content && (
            <MessageResponse>{memory.content}</MessageResponse>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={memory.busy || !memory.exists}
            onClick={() => void memory.clear()}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={memory.busy}
            onClick={() => void memory.rebuild()}
          >
            Rebuild
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

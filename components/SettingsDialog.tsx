"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { FolderOpenIcon } from "lucide-react";
import {
  useWorkspaceService,
  useMemoryService,
} from "@/lib/services/StoreProvider";

/**
 * In-app Settings for the desktop build: workspace switching (open a local
 * directory).
 *
 * The LLM provider/model + credentials are managed in the Providers & Models
 * dialog (`ProvidersDialog`, opened from the header model name). MCP servers are
 * managed in their own dialog (`McpServersDialog`).
 */
export const SettingsDialog = observer(function SettingsDialog({
  open,
  onOpenChange,
  cwd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd?: string | null;
}) {
  const workspace = useWorkspaceService();
  const memory = useMemoryService();
  const [folder, setFolder] = useState("");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (open) {
      setFolder("");
      void memory.load();
    }
  }, [open, memory]);

  // The WorkspaceService owns the open-folder flow (pick → POST → navigate).
  const openWorkspace = useCallback(
    async (rawPath: string) => {
      const p = rawPath.trim();
      if (!p) return;
      setOpening(true);
      try {
        await workspace.openFolder(p);
      } finally {
        setOpening(false);
      }
    },
    [workspace]
  );

  const browseFolder = useCallback(
    () => void workspace.openFolder(),
    [workspace]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Workspace for the agent.</DialogDescription>
        </DialogHeader>

        {/* Workspace */}
        <section className="space-y-3 py-2">
          <h3 className="text-sm font-semibold">Workspace</h3>
          {cwd && (
            <p className="text-muted-foreground text-xs font-mono break-all">
              Current: {cwd}
            </p>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="/path/to/project"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void openWorkspace(folder);
              }}
            />
            <Button
              variant="outline"
              onClick={() => void browseFolder()}
              title="Browse for a folder (desktop app)"
            >
              <FolderOpenIcon className="size-4" />
            </Button>
            <Button
              onClick={() => void openWorkspace(folder)}
              disabled={!folder.trim() || opening}
            >
              {opening ? <Spinner className="size-3.5" /> : null}
              Open
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Opens a local directory as the agent&apos;s workspace (reloads the session).
          </p>
        </section>

        {/* Memory */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Project memory</h3>
              <p className="text-muted-foreground text-xs">
                The agent consolidates durable facts from this project&apos;s past
                sessions and reuses them later. Secret-like values are redacted, so
                it is not a store for credentials.
              </p>
            </div>
            <Switch
              checked={memory.enabled}
              onCheckedChange={(checked) => void memory.setEnabled(checked)}
              aria-label="Enable project memory"
            />
          </div>

          {memory.enabled && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {memory.loading
                  ? "Checking…"
                  : memory.exists
                    ? "Memory stored for this project."
                    : "No memory stored yet."}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={memory.busy}
                  onClick={() => void memory.rebuild()}
                >
                  Rebuild
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={memory.busy || !memory.exists}
                  onClick={() => void memory.clear()}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Changes apply on the next session.
          </p>
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

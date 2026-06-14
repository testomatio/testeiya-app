"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FolderOpenIcon } from "@/lib/icons";
import { useWorkspaceService } from "@/lib/services/StoreProvider";

/**
 * In-app Settings for the desktop build: workspace switching (open a local
 * directory).
 *
 * The LLM provider/model + credentials are managed in the Providers & Models
 * dialog (`ProvidersDialog`, opened from the header model name). MCP servers are
 * managed in their own dialog (`McpServersDialog`).
 */
export function SettingsDialog({
  open,
  onOpenChange,
  cwd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd?: string | null;
}) {
  const workspace = useWorkspaceService();
  const [folder, setFolder] = useState("");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (open) setFolder("");
  }, [open]);

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
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Workspace for the agent.</DialogDescription>
        </DialogHeader>

        <DialogBody>
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
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

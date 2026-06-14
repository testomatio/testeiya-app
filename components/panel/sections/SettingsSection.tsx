"use client";

import { useCallback, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FolderOpenIcon } from "@/lib/icons";
import { SectionShell } from "../SectionShell";
import { useWorkspaceService } from "@/lib/services/StoreProvider";
import type { PanelSectionProps } from "@/lib/panel/types";

export const SettingsSection = observer(function SettingsSection({
  active,
  onToggle,
}: PanelSectionProps) {
  const workspace = useWorkspaceService();
  const [folder, setFolder] = useState("");
  const [opening, setOpening] = useState(false);

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

  const browseFolder = useCallback(() => void workspace.openFolder(), [workspace]);

  return (
    <SectionShell title="Settings" active={active} onToggle={onToggle}>
      <div className="space-y-4 p-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Workspace</h3>
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
              size="icon"
              onClick={browseFolder}
              title="Browse for a folder"
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
            Opens a local directory as the agent&apos;s workspace (reloads the
            session).
          </p>
        </div>
      </div>
    </SectionShell>
  );
});

"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ChevronDownIcon, FolderOpenIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SectionShell } from "../SectionShell";
import {
  useWorkspaceService,
  useDebugLogService,
  useMemoryService,
  useProjectService,
  useProvidersService,
} from "@/lib/services/StoreProvider";
import type { PanelSectionProps } from "@/lib/panel/types";

export const SettingsSection = observer(function SettingsSection({
  active,
  onToggle,
  initializing: _initializing,
}: PanelSectionProps) {
  const workspace = useWorkspaceService();
  const debug = useDebugLogService();
  const memory = useMemoryService();
  const project = useProjectService();
  const providers = useProvidersService();
  const [folder, setFolder] = useState("");
  const [opening, setOpening] = useState(false);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [host, setHost] = useState(project.baseUrl);
  const [savingHost, setSavingHost] = useState(false);

  useEffect(() => {
    if (active) void memory.load();
  }, [active, memory]);

  useEffect(() => {
    if (active) void project.refreshStatus();
  }, [active, project]);

  useEffect(() => {
    if (active) void providers.refresh();
  }, [active, providers]);

  useEffect(() => {
    setHost(project.baseUrl);
  }, [project.baseUrl]);

  const saveHost = useCallback(async () => {
    setSavingHost(true);
    try {
      await project.setHost(host);
    } finally {
      setSavingHost(false);
    }
  }, [project, host]);

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
          <h3 className="text-sm font-semibold">AI Provider &amp; Model</h3>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
              {providers.label ?? "No model selected"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => providers.setDialogOpen(true)}
            >
              Change
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Pick the LLM provider and model the agent uses. Applies on the next
            session.
          </p>
        </div>

        <div className="space-y-3 border-t pt-4">
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

        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Testomat.io Host</h3>
          <div className="flex gap-2">
            <Input
              placeholder="https://app.testomat.io"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveHost();
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <Button onClick={() => void saveHost()} disabled={savingHost}>
              {savingHost ? <Spinner className="size-3.5" /> : null}
              Save
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Point Testeiya at a self-hosted Testomat.io instance. Applies to
            sign-in and project sync.
          </p>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Debug panel</h3>
              <p className="text-muted-foreground text-xs">
                Show a Debug section in the sidebar that logs API requests,
                Testomat.io calls, and agent events.
              </p>
            </div>
            <Switch
              checked={debug.enabled}
              onCheckedChange={(checked) => debug.setEnabled(checked)}
              aria-label="Enable debug panel"
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Project memory</h3>
              <p className="text-muted-foreground text-xs">
                Durable facts the agent consolidates from this project&apos;s
                past sessions and reuses later. Secret-like values are redacted,
                so it is not a store for credentials.
              </p>
            </div>
            <Switch
              checked={memory.enabled}
              onCheckedChange={(checked) => void memory.setEnabled(checked)}
              aria-label="Enable project memory"
            />
          </div>

          {memory.enabled && (
            <Collapsible
              open={memoryExpanded}
              onOpenChange={setMemoryExpanded}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <ChevronDownIcon
                    className={cn(
                      "size-3.5 transition-transform",
                      memoryExpanded ? "rotate-0" : "-rotate-90"
                    )}
                  />
                  View memory
                </CollapsibleTrigger>
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
              <CollapsibleContent>
                <div className="max-h-[40vh] min-h-[6rem] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
                  {memory.loading && <Shimmer as="span">Loading memory…</Shimmer>}
                  {!memory.loading && memory.error && (
                    <span className="text-destructive">{memory.error}</span>
                  )}
                  {!memory.loading && !memory.error && !memory.content && (
                    <span className="text-muted-foreground">
                      No memory yet. As you work in this project, the agent
                      consolidates durable facts here between sessions.
                    </span>
                  )}
                  {!memory.loading && memory.content && (
                    <MessageResponse>{memory.content}</MessageResponse>
                  )}
                </div>
              </CollapsibleContent>
              <p className="text-muted-foreground text-xs">
                Changes apply on the next session.
              </p>
            </Collapsible>
          )}
        </div>
      </div>
    </SectionShell>
  );
});

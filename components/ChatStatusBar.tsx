"use client";

import type { ComponentType } from "react";
import { observer } from "mobx-react-lite";
import { Icon, XIcon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePanel } from "@/lib/panel/PanelContext";
import {
  useContextService,
  useWorkspaceService,
} from "@/lib/services/StoreProvider";
import type { ContextKind } from "@/lib/services/types";

/**
 * Slim status strip under the prompt input — everything the agent currently
 * has in front of it: the workspace (folder, branch), one badge per non-empty
 * predefined `.testeiya` context folder, and the widget or file the chat is
 * referencing (dismissable with ×). Badges click through to the workspace
 * sidebar — a context badge also expands its folder in the tree.
 */
export const ChatStatusBar = observer(function ChatStatusBar({
  cwd,
  widgetLabel,
  WidgetIcon,
  onDismissWidget,
}: {
  cwd?: string | null;
  widgetLabel?: string | null;
  WidgetIcon?: ComponentType<{ className?: string }>;
  onDismissWidget?: () => void;
}) {
  const ws = useWorkspaceService();
  const ctx = useContextService();
  const panel = usePanel();
  if (!ws.sessionId || !cwd) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] leading-none text-muted-foreground">
      <Tooltip>
        <TooltipTrigger render={
          <button
            type="button"
            onClick={() => panel.openSection("workspace")}
            className="flex cursor-pointer items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open workspace sidebar"
          >
            <Icon name="folder" className="size-3" />
            <span className="max-w-[180px] truncate">{basename(cwd)}</span>
            {ws.branch && (
              <span className="flex items-center gap-0.5 border-l pl-1 text-muted-foreground/80">
                <Icon name="commit" className="size-3" />
                <span className="max-w-[120px] truncate">{ws.branch}</span>
              </span>
            )}
          </button>
        } />
        <TooltipContent><p>Context: Workspace at {cwd}</p></TooltipContent>
      </Tooltip>
      {ctx.folders.map((folder) => (
        <FolderBadge
          key={folder.path}
          path={folder.path}
          onReveal={() => {
            panel.openSection("workspace");
            void ws.revealFolder(folder.path);
          }}
        />
      ))}
      {ctx.entries
        .filter((entry) => entry.path.split("/").length === 2)
        .map((entry) => (
          <FolderBadge
            key={entry.id}
            path={entry.path}
            onReveal={() => {
              panel.openSection("workspace");
              void ws.revealFolder(entry.path);
            }}
          />
        ))}
      {ctx.busy && (
        <span className="flex animate-pulse items-center gap-1 rounded-md border border-dashed px-1.5 py-1">
          <Icon name="progress_activity" className="size-3 animate-spin" />
          {busyLabel(ctx.busy)}
        </span>
      )}
      {widgetLabel && (
        <span className="flex items-center gap-1 rounded-md border bg-muted/40 py-1 pr-0.5 pl-1.5">
          {WidgetIcon && <WidgetIcon className="size-3" />}
          <Tooltip>
            <TooltipTrigger render={
              <span className="max-w-[200px] truncate">{widgetLabel}</span>
            } />
            <TooltipContent><p>Context: {widgetLabel}</p></TooltipContent>
          </Tooltip>
          {onDismissWidget && (
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={onDismissWidget}
                  className="flex size-4 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
                  aria-label="Remove widget from context"
                >
                  <XIcon className="size-3" />
                </button>
              } />
              <TooltipContent><p>Remove from context</p></TooltipContent>
            </Tooltip>
          )}
        </span>
      )}
    </div>
  );
});

function FolderBadge({
  path,
  onReveal,
}: {
  path: string;
  onReveal: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={
        <button
          type="button"
          onClick={onReveal}
          className="flex cursor-pointer items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Show ${path} in the workspace sidebar`}
        >
          <Icon name="folder" className="size-3" />
          <span className="max-w-[220px] truncate">{path}</span>
        </button>
      } />
      <TooltipContent><p>Context: {path} — click to open in the workspace sidebar</p></TooltipContent>
    </Tooltip>
  );
}

function busyLabel(kind: ContextKind): string {
  if (kind === "repo") return "Cloning repository…";
  if (kind === "folder") return "Adding folder…";
  return "Uploading…";
}

function basename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

"use client";

import { observer } from "mobx-react-lite";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SuiteGlyph } from "@/components/icons";
import { Icon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionShell } from "../SectionShell";
import {
  useWorkspaceService,
  useSearchService,
} from "@/lib/services/StoreProvider";
import type { TreeNode } from "@/lib/services/types";
import type { PanelSectionProps } from "@/lib/panel/types";

function NodeRow({ node, onOpen }: { node: TreeNode; onOpen: (path: string, anchor?: string) => void }) {
  const isMarkdown = /\.md$/i.test(node.name);
  if (node.kind === "folder") {
    const count = countTests(node);
    return (
      <FileTreeFolder path={node.path} name={node.name} badge={count || undefined}>
        {(node.children ?? []).map((child) => (
          <NodeRow key={child.anchor ?? child.path} node={child} onOpen={onOpen} />
        ))}
      </FileTreeFolder>
    );
  }
  if (node.kind === "test") {
    return (
      <FileTreeFile
        path={`${node.path}#${node.anchor}`}
        name={node.name}
        onClick={() => onOpen(node.path, node.anchor)}
        icon={<Icon name="tag" className="size-4 text-muted-foreground" />}
      />
    );
  }
  if (node.children?.length) {
    const count = node.children.filter((c) => c.kind === "test").length;
    return (
      <FileTreeFolder
        path={node.path}
        name={node.name}
        icon={isMarkdown ? <SuiteGlyph className="size-4 text-muted-foreground" /> : undefined}
        badge={count || undefined}
      >
        {node.children.map((child) => (
          <NodeRow key={child.anchor ?? child.path} node={child} onOpen={onOpen} />
        ))}
      </FileTreeFolder>
    );
  }
  return (
    <FileTreeFile
      path={node.path}
      name={node.name}
      icon={isMarkdown ? <SuiteGlyph className="size-4 text-muted-foreground" /> : undefined}
    />
  );
}

function countTests(node: TreeNode): number {
  if (node.kind === "test") return 1;
  return (node.children ?? []).reduce((sum, child) => sum + countTests(child), 0);
}

/**
 * Workspace service — the project's pulled test markdown as a file tree. A thin
 * view over WorkspaceService: it renders observable state and forwards clicks;
 * all loading/expansion logic lives in the service.
 */
export const WorkspaceSection = observer(function WorkspaceSection({
  active,
  onToggle,
  initializing,
}: PanelSectionProps) {
  const ws = useWorkspaceService();
  const search = useSearchService();

  return (
    <SectionShell
      icon={<Icon name="folder_open" className="size-4" />}
      title="Workspace"
      active={active}
      onToggle={onToggle}
      actions={
        <>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-7 w-7 p-0", search.searchOpen && "text-primary")}
                onClick={() => search.toggleSearch()}
                aria-pressed={search.searchOpen}
                aria-label="Search workspace"
              >
                <Icon name="search" className="size-4" />
              </Button>
            } />
            <TooltipContent side="bottom"><p>Search workspace</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => void ws.openFolder()}
                aria-label="Open folder as workspace"
              >
                <Icon name="folder_open" className="size-4" />
              </Button>
            } />
            <TooltipContent side="bottom"><p>Open folder as workspace</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={!ws.sessionId || !!ws.syncing}
                onClick={() => void ws.sync("pull")}
                aria-label="Pull manual tests from Testomat.io"
              >
                <Icon
                  name="cloud_download"
                  className={cn("size-4", ws.syncing === "pull" && "animate-pulse")}
                />
              </Button>
            } />
            <TooltipContent side="bottom"><p>Pull manual tests from Testomat.io</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={!ws.sessionId || !!ws.syncing || ws.manualTestsDir === null}
                onClick={() => void ws.sync("push")}
                aria-label="Push manual tests to Testomat.io"
              >
                <Icon
                  name="cloud_upload"
                  className={cn("size-4", ws.syncing === "push" && "animate-pulse")}
                />
              </Button>
            } />
            <TooltipContent side="bottom"><p>Push manual tests to Testomat.io</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => void ws.loadTree()}
                aria-label="Refresh tree"
              >
                <Icon
                  name="refresh"
                  className={cn("size-4", ws.treeLoading && "animate-spin")}
                />
              </Button>
            } />
            <TooltipContent side="bottom"><p>Refresh tree</p></TooltipContent>
          </Tooltip>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {search.searchOpen && (
          <div className="mb-2 flex flex-col gap-1.5 px-4">
            <Input
              autoFocus
              value={search.searchQuery}
              onChange={(e) => search.setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void search.runSearch();
              }}
              placeholder="Search workspace…"
              className="h-7 text-xs"
            />
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Switch
                size="sm"
                checked={search.searchScope === "manual"}
                onCheckedChange={(checked) =>
                  search.setSearchScope(checked ? "manual" : "all")
                }
              />
              Manual tests only
            </label>
          </div>
        )}
        {ws.syncing && (
          <div className="mx-3 my-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary/90">
            <Icon name={ws.syncing === "pull" ? "cloud_download" : "cloud_upload"} className="size-3.5 shrink-0 animate-pulse" />
            <span className="flex-1">{ws.syncing === "pull" ? "Pulling tests from Testomat.io…" : "Pushing tests to Testomat.io…"}</span>
            <Icon name="refresh" className="size-3 shrink-0 animate-spin opacity-60" />
          </div>
        )}
        {ws.treeError && (
          <div className="mx-3 my-2 flex flex-col gap-1.5 rounded-md border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive dark:border-destructive/40 dark:bg-destructive/15 dark:text-destructive/90">
            <div className="flex items-center gap-2">
              <Icon name="error" className="size-3.5 shrink-0" />
              <span className="flex-1">{ws.treeError}</span>
            </div>
            <span className="pl-5 text-destructive/70">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-destructive"
                onClick={() => void ws.loadTree()}
              >
                Refresh the tree
              </button>
              {" "}to try again.
            </span>
          </div>
        )}
        {!ws.sessionId && !ws.treeError && (
          initializing ? (
            <WorkspaceSkeleton />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <Icon name="folder_open" className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No active session</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Send a message to start a session and load your workspace.
              </p>
            </div>
          )
        )}
        {ws.sessionId && !ws.treeError && ws.tree.length === 0 && (ws.awaitingTests || ws.treeLoading) && (
          <div className="mx-3 my-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary/90">
            <Icon name="folder_open" className="size-3.5 shrink-0 animate-pulse" />
            <span className="flex-1">Loading project tests…</span>
            <Icon name="refresh" className="size-3 shrink-0 animate-spin opacity-60" />
          </div>
        )}
        {ws.sessionId && !ws.treeError && ws.tree.length === 0 && !ws.awaitingTests && !ws.treeLoading && (
          initializing ? (
            <WorkspaceSkeleton />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <Icon name="folder_open" className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Workspace is empty</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pull tests from Testomat.io or open a folder to get started.
              </p>
            </div>
          )
        )}
        {ws.tree.length > 0 && (
          <FileTree
            className="min-h-0 flex-1 overflow-auto"
            expanded={ws.expanded}
            onExpandedChange={(s) => ws.setExpanded(s)}
            selectedPath={ws.openFile?.path}
            onSelect={(p) => ws.openPath(p)}
          >
            {ws.tree.map((node) => (
              <NodeRow key={node.path} node={node} onOpen={(p, anchor) => ws.openPath(p, anchor)} />
            ))}
          </FileTree>
        )}
      </div>
    </SectionShell>
  );
});

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2 px-1 py-1">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1 pl-6">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1 pl-6">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1 pl-6">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-2/5" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1 pl-6">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1 pl-6">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="flex items-center gap-2 px-1 py-1 pl-6">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    </div>
  );
}

"use client";

import { observer } from "mobx-react-lite";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
} from "@/components/ai-elements/file-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

function NodeRow({ node }: { node: TreeNode }) {
  const isMarkdown = /\.md$/i.test(node.name);
  if (node.kind === "folder") {
    return (
      <FileTreeFolder path={node.path} name={node.name}>
        {(node.children ?? []).map((child) => (
          <NodeRow key={child.path} node={child} />
        ))}
      </FileTreeFolder>
    );
  }
  return (
    <FileTreeFile
      path={node.path}
      name={node.name}
      icon={
        isMarkdown ? (
          <FileTreeIcon>
            <SuiteGlyph className="size-4 text-muted-foreground" />
          </FileTreeIcon>
        ) : undefined
      }
    />
  );
}

/**
 * Workspace service — the project's pulled test markdown as a file tree. A thin
 * view over WorkspaceService: it renders observable state and forwards clicks;
 * all loading/expansion logic lives in the service.
 */
export const WorkspaceSection = observer(function WorkspaceSection({
  active,
  onToggle,
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
            <TooltipContent><p>Search workspace</p></TooltipContent>
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
            <TooltipContent><p>Open folder as workspace</p></TooltipContent>
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
            <TooltipContent><p>Pull manual tests from Testomat.io</p></TooltipContent>
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
            <TooltipContent><p>Push manual tests to Testomat.io</p></TooltipContent>
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
            <TooltipContent><p>Refresh tree</p></TooltipContent>
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
          <div className="mx-3 my-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Icon name="info" className="size-3.5 shrink-0" />
            <span>No active session yet.</span>
          </div>
        )}
        {ws.sessionId && !ws.treeError && ws.tree.length === 0 && (ws.awaitingTests || ws.treeLoading) && (
          <div className="mx-3 my-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary/90">
            <Icon name="folder_open" className="size-3.5 shrink-0 animate-pulse" />
            <span className="flex-1">Loading project tests…</span>
            <Icon name="refresh" className="size-3 shrink-0 animate-spin opacity-60" />
          </div>
        )}
        {ws.sessionId && !ws.treeError && ws.tree.length === 0 && !ws.awaitingTests && !ws.treeLoading && (
          <div className="px-4 text-xs text-muted-foreground">(empty)</div>
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
              <NodeRow key={node.path} node={node} />
            ))}
          </FileTree>
        )}
      </div>
    </SectionShell>
  );
});

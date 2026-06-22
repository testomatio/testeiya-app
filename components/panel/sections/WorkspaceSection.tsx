"use client";

import { observer } from "mobx-react-lite";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SuiteGlyph, TypeIcon } from "@/components/icons";
import { Icon, TrashIcon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { SectionShell } from "../SectionShell";
import {
  useWorkspaceService,
  useSearchService,
} from "@/lib/services/StoreProvider";
import type { FileStatus, TreeNode } from "@/lib/services/types";
import type { PanelSectionProps } from "@/lib/panel/types";

// `@tag` tokens in a test title — Testomat.io's TAG_ALLOWED_SYMBOLS, anchored to
// a word boundary so emails (`a@b.com`) aren't mistaken for tags.
const TAG_RE = /(^|\s)(@[\w=().:&-]*[\w)])/g;

const NodeRow = observer(function NodeRow({ node }: { node: TreeNode }) {
  const ws = useWorkspaceService();
  const isMarkdown = /\.md$/i.test(node.name);
  const menu = (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => ws.requestRename(node)}>
        <Icon name="edit" className="size-4" />
        Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => ws.requestDelete(node)}>
        <TrashIcon className="size-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
  if (node.kind === "folder") {
    const count = countTests(node);
    return (
      <FileTreeFolder
        path={node.path}
        name={node.name}
        nameClassName={statusClass(subtreeStatus(node, ws.changedFiles))}
        badge={count || undefined}
        menu={menu}
      >
        {(node.children ?? []).map((child) => (
          <NodeRow key={child.anchor ?? child.path} node={child} />
        ))}
      </FileTreeFolder>
    );
  }
  if (node.kind === "test") {
    const { title, tags } = splitTags(node.name);
    return (
      <FileTreeFile
        path={`${node.path}#${node.anchor}`}
        name={title}
        onClick={() => ws.openPath(node.path, node.anchor)}
        icon={<TypeIcon type="manual" className="size-4" />}
        menu={menu}
        badge={
          tags.length > 0 ? (
            <span className="flex items-center gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="h-4 shrink-0 rounded px-1 py-0 text-[10px] font-normal leading-none text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </span>
          ) : undefined
        }
      />
    );
  }
  if (node.children?.length) {
    const count = node.children.filter((c) => c.kind === "test").length;
    return (
      <FileTreeFolder
        path={node.path}
        name={node.name}
        nameClassName={statusClass(ws.changedFiles.get(node.path))}
        icon={isMarkdown ? <SuiteGlyph className="size-4 text-muted-foreground" /> : undefined}
        badge={count || undefined}
        menu={menu}
      >
        {node.children.map((child) => (
          <NodeRow key={child.anchor ?? child.path} node={child} />
        ))}
      </FileTreeFolder>
    );
  }
  return (
    <FileTreeFile
      path={node.path}
      name={node.name}
      nameClassName={statusClass(ws.changedFiles.get(node.path))}
      icon={isMarkdown ? <SuiteGlyph className="size-4 text-muted-foreground" /> : undefined}
      menu={menu}
    />
  );
});

function statusClass(status: FileStatus | undefined): string | undefined {
  if (status === "created") return "font-medium text-status-success-foreground";
  if (status === "changed") return "font-medium text-status-warning-foreground";
  return undefined;
}

// Aggregate status for a node: its own change, else the strongest change in its
// subtree ("changed" wins over "created"), so a collapsed folder on the path to
// an edited file is still highlighted.
function subtreeStatus(
  node: TreeNode,
  changed: Map<string, FileStatus>
): FileStatus | undefined {
  const own = changed.get(node.path);
  if (own) return own;
  let result: FileStatus | undefined;
  for (const child of node.children ?? []) {
    const status = subtreeStatus(child, changed);
    if (status === "changed") return "changed";
    if (status === "created") result = "created";
  }
  return result;
}

function countTests(node: TreeNode): number {
  if (node.kind === "test") return 1;
  return (node.children ?? []).reduce((sum, child) => sum + countTests(child), 0);
}

function splitTags(name: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const title = name
    .replace(TAG_RE, (_match, pre: string, tag: string) => {
      tags.push(tag);
      return pre;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || name, tags };
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
                className={cn(
                  "h-7",
                  ws.changedFiles.size === 0 && "w-7 p-0",
                  ws.changedFiles.size > 0 && "gap-1 px-1.5",
                  ws.changedOnly && "text-primary"
                )}
                disabled={ws.changedFiles.size === 0}
                onClick={() => ws.toggleChangedOnly()}
                aria-pressed={ws.changedOnly}
                aria-label="Show changed files only"
              >
                <Icon name="filter_list" className="size-4" />
                {ws.changedFiles.size > 0 && (
                  <span className="text-[11px] font-medium tabular-nums">
                    {ws.changedFiles.size}
                  </span>
                )}
              </Button>
            } />
            <TooltipContent side="bottom"><p>Show changed (un-pushed) files only</p></TooltipContent>
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
        {ws.tree.length > 0 && ws.changedOnly && ws.visibleTree.length === 0 && (
          <div className="text-xs text-muted-foreground">No changed files yet.</div>
        )}
        {ws.visibleTree.length > 0 && (
          <FileTree
            className="min-h-0 flex-1 overflow-auto"
            expanded={ws.expanded}
            onExpandedChange={(s) => ws.setExpanded(s)}
            selectedPath={ws.openFile?.path}
            onSelect={(p) => ws.openPath(p)}
          >
            {ws.visibleTree.map((node) => (
              <NodeRow key={node.path} node={node} />
            ))}
          </FileTree>
        )}
      </div>
      <Dialog
        open={!!ws.pendingDelete}
        onOpenChange={(open) => {
          if (!open) ws.cancelDelete();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleteTitle(ws.pendingDelete)}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>{deleteDescription(ws.pendingDelete)}</DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => ws.cancelDelete()} disabled={ws.deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void ws.confirmDelete()}
              disabled={ws.deleting}
            >
              {ws.deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!ws.renaming}
        onOpenChange={(open) => {
          if (!open) ws.cancelRename();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{renameTitle(ws.renaming)}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              value={ws.renameValue}
              onChange={(e) => ws.setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void ws.confirmRename();
              }}
              placeholder="New name…"
              disabled={ws.renamingBusy}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => ws.cancelRename()} disabled={ws.renamingBusy}>
              Cancel
            </Button>
            <Button
              onClick={() => void ws.confirmRename()}
              disabled={ws.renamingBusy || !ws.renameValue.trim()}
            >
              {ws.renamingBusy ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionShell>
  );
});

function renameTitle(node: TreeNode | null): string {
  if (!node) return "";
  if (node.kind === "test") return "Rename test";
  if (node.kind === "folder") return "Rename folder";
  return "Rename file";
}

function deleteTitle(node: TreeNode | null): string {
  if (!node) return "";
  if (node.kind === "test") return `Delete test “${splitTags(node.name).title}”?`;
  if (node.kind === "folder") return `Delete folder “${node.name}”?`;
  return `Delete suite “${node.name}”?`;
}

function deleteDescription(node: TreeNode | null): string {
  if (!node) return "";
  if (node.kind === "test") {
    return "This removes the test from the file and deletes it from Testomat.io. This can’t be undone.";
  }
  if (node.kind === "folder") {
    return "This deletes the folder and permanently removes every test suite inside it from Testomat.io. This can’t be undone.";
  }
  return "This deletes the local file and permanently removes the suite and all its tests from Testomat.io. This can’t be undone.";
}

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

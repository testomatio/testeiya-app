"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
} from "@/components/ai-elements/file-tree";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MdiIcon, SuiteGlyph } from "@/components/icons";
import { mdiFileTreeOutline, mdiFolderOpenOutline, mdiRefresh } from "@mdi/js";
import { openWorkspaceFlow } from "@/lib/workspace/open-workspace";
import { SectionShell } from "../SectionShell";
import type { PanelSectionProps } from "@/lib/panel/types";

interface TreeNode {
  name: string;
  kind: "folder" | "file";
  path: string;
  children?: TreeNode[];
}

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

function firstLevelFolderPaths(nodes: TreeNode[]): Set<string> {
  const s = new Set<string>();
  for (const n of nodes) if (n.kind === "folder") s.add(n.path);
  return s;
}

function containsFolder(nodes: TreeNode[], path: string): boolean {
  for (const n of nodes) {
    if (n.path === path) return n.kind === "folder";
    if (n.children && path.startsWith(n.path + "/")) {
      return containsFolder(n.children, path);
    }
  }
  return false;
}

/**
 * Workspace service — the project's pulled test markdown rendered as a file
 * tree. Clicking a file opens it full-height in the editor; folders toggle.
 * Fetches only while this section is the active (expanded) one.
 */
export function WorkspaceSection({ active, onToggle }: PanelSectionProps) {
  const { sessionId, openFile, open, refreshCounter } = useWorkspace();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  // Controlled expansion so we can toggle folders on folder-row click.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Seed first-level folders the first time nodes load; preserve user
  // toggles on subsequent refetches.
  const seededRef = useRef(false);

  useEffect(() => {
    if (nodes.length === 0 || seededRef.current) return;
    setExpanded(firstLevelFolderPaths(nodes));
    seededRef.current = true;
  }, [nodes]);

  const refetch = useCallback(() => setFetchKey((n) => n + 1), []);

  // A just-opened project syncs its markdown in the background, so the first
  // tree fetch can land before any files exist. Auto-poll a handful of times
  // while empty so the files appear on their own (then stop).
  const emptyRetriesRef = useRef(0);
  useEffect(() => {
    emptyRetriesRef.current = 0;
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId || !active || loading) return;
    if (nodes.length > 0) {
      emptyRetriesRef.current = 0;
      return;
    }
    if (emptyRetriesRef.current >= 6) return;
    const id = setTimeout(() => {
      emptyRetriesRef.current += 1;
      refetch();
    }, 2500);
    return () => clearTimeout(id);
  }, [sessionId, active, loading, nodes.length, refetch]);

  useEffect(() => {
    if (!sessionId || !active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/files/tree?session=${encodeURIComponent(sessionId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { nodes: TreeNode[] }) => {
        if (!cancelled) setNodes(data.nodes ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, active, fetchKey, refreshCounter]);

  // Clicking a node row:
  //   - folder → toggle expansion
  //   - file   → open in editor (full-height; hides the chat)
  const handleSelect = useCallback(
    (path: string) => {
      const isFolder = containsFolder(nodes, path);
      if (isFolder) {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
        return;
      }
      open(path, undefined, { fullHeight: true });
    },
    [nodes, open]
  );

  return (
    <SectionShell
      icon={<MdiIcon path={mdiFileTreeOutline} className="size-4" />}
      title="Workspace"
      active={active}
      onToggle={onToggle}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => void openWorkspaceFlow()}
            title="Open folder as workspace"
            aria-label="Open folder as workspace"
          >
            <MdiIcon path={mdiFolderOpenOutline} className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={refetch}
            title="Refresh tree"
            aria-label="Refresh tree"
          >
            <MdiIcon
              path={mdiRefresh}
              className={cn("size-3.5", loading && "animate-spin")}
            />
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {error && <div className="text-xs text-red-500">{error}</div>}
        {!sessionId && !error && (
          <div className="text-xs text-muted-foreground">
            No active session yet.
          </div>
        )}
        {sessionId && !error && nodes.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground">(empty)</div>
        )}
        {nodes.length > 0 && (
          <FileTree
            // Fill the section body and scroll internally so the list runs the
            // full height of the sidebar instead of hugging its content.
            className="min-h-0 flex-1 overflow-auto"
            expanded={expanded}
            onExpandedChange={setExpanded}
            selectedPath={openFile?.path}
            onSelect={handleSelect}
          >
            {nodes.map((node) => (
              <NodeRow key={node.path} node={node} />
            ))}
          </FileTree>
        )}
      </div>
    </SectionShell>
  );
}

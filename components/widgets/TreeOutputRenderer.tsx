"use client";

import { useMemo } from "react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
} from "@/components/ai-elements/file-tree";
import { SuiteGlyph } from "@/components/icons";

interface TreeNode {
  name: string;
  kind?: "suite" | "test" | "folder" | "file";
  id?: string;
  path?: string;
  children?: TreeNode[];
}

interface Props {
  json: unknown;
}

function extractNodes(raw: unknown): TreeNode[] {
  // Accept an array or { nodes: [...] } or an MCP envelope string.
  if (Array.isArray(raw)) return raw as TreeNode[];
  if (raw && typeof raw === "object") {
    const obj = raw as { nodes?: unknown; content?: Array<{ type?: string; text?: string }> };
    if (Array.isArray(obj.nodes)) return obj.nodes as TreeNode[];
    const text = obj.content?.find((c) => c?.type === "text")?.text;
    if (typeof text === "string") {
      try {
        return extractNodes(JSON.parse(text));
      } catch {
        return [];
      }
    }
  }
  if (typeof raw === "string") {
    try {
      return extractNodes(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function pathFor(node: TreeNode, parentPath: string, index: number): string {
  if (node.path) return node.path;
  if (node.id) return `${parentPath}/${node.id}`;
  return `${parentPath}/${index}:${node.name}`;
}

function Branch({
  nodes,
  parentPath,
}: {
  nodes: TreeNode[];
  parentPath: string;
}) {
  return (
    <>
      {nodes.map((node, i) => {
        const path = pathFor(node, parentPath, i);
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const isParent =
          hasChildren || node.kind === "suite" || node.kind === "folder";

        if (isParent) {
          return (
            <FileTreeFolder key={path} path={path} name={node.name}>
              {hasChildren && (
                <Branch nodes={node.children!} parentPath={path} />
              )}
            </FileTreeFolder>
          );
        }
        // leaf — test or file
        return (
          <FileTreeFile
            key={path}
            path={path}
            name={node.name}
            icon={
              node.kind === "test" ? (
                <FileTreeIcon>
                  <SuiteGlyph className="size-4 text-muted-foreground" />
                </FileTreeIcon>
              ) : undefined
            }
          />
        );
      })}
    </>
  );
}

export default function TreeOutputRenderer({ json }: Props) {
  const nodes = useMemo(() => extractNodes(json), [json]);

  // Default-expand top-level folders so the tree isn't a blank shell.
  const initialExpanded = useMemo(() => {
    const s = new Set<string>();
    nodes.forEach((n, i) => {
      if (
        n.kind === "suite" ||
        n.kind === "folder" ||
        (Array.isArray(n.children) && n.children.length > 0)
      ) {
        s.add(pathFor(n, "", i));
      }
    });
    return s;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">(empty tree)</div>
    );
  }

  return (
    <FileTree defaultExpanded={initialExpanded}>
      <Branch nodes={nodes} parentPath="" />
    </FileTree>
  );
}

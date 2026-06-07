"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { MarkdownEditor } from "@/components/workspace/MarkdownEditor";
import { useWorkspaceService } from "@/lib/services/StoreProvider";

interface Props {
  json: unknown;
}

function parseInput(raw: unknown): { path?: string; content?: string } | null {
  if (!raw) return null;
  let current: unknown = raw;
  for (let i = 0; i < 3; i++) {
    if (current && typeof current === "object") {
      const obj = current as {
        path?: string;
        content?: string;
        input?: unknown;
        tool?: { input?: unknown };
      };
      if (typeof obj.path === "string") {
        return { path: obj.path, content: typeof obj.content === "string" ? obj.content : undefined };
      }
      if (obj.input) {
        current = obj.input;
        continue;
      }
    }
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return null;
      }
    }
    return null;
  }
  return null;
}

/**
 * Inline renderer for the agent's `write` / `edit` tool calls.
 * Embeds a `<MarkdownEditor>` seeded with the content the agent wrote so
 * the user can review and override without leaving the chat. Also pushes
 * the file into the shared workspace editor panel for persistent access.
 */
function FileEditRenderer({ json }: Props) {
  const { sessionId, open, triggerRefresh } = useWorkspaceService();
  const parsed = parseInput(json);
  const path = parsed?.path;
  const content = parsed?.content;

  useEffect(() => {
    if (!path) return;
    open(path, content);
    triggerRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!path || !sessionId) {
    return (
      <div className="text-xs text-muted-foreground">
        (file edit — insufficient data to render)
      </div>
    );
  }

  return (
    <div className="not-prose w-full">
      <MarkdownEditor
        sessionId={sessionId}
        path={path}
        initialContent={content}
        onSaved={() => triggerRefresh()}
      />
    </div>
  );
}

export default observer(FileEditRenderer);

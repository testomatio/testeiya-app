"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SuiteGlyph } from "@/components/icons";
import {
  ChevronDownIcon,
  Expand,
  Minimize2,
  SaveIcon,
  Blocks,
  Code,
  X,
} from "@/lib/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useTheme } from "@/lib/theme";
import { BlockEditor } from "./BlockEditor";
import { OverTypeEditor } from "./OverTypeEditor";

type Size = "collapsed" | "default" | "expanded";
type EditorMode = "rich" | "markdown";

export type MarkdownEditorProps = {
  sessionId: string;
  path: string;
  /** Seed content (used when the agent just wrote this file). */
  initialContent?: string;
  /** Text to scroll to and highlight once the editor renders (search result). */
  scrollToText?: string;
  /** Key that changes whenever the "open file" should force a remount. */
  instanceKey?: number;
  /** Prevent edits while the agent is mid-action. */
  readOnly?: boolean;
  /** Optional close handler (panel / modal usage). */
  onClose?: () => void;
  /** Optional save callback fired after a successful save. */
  onSaved?: (content: string) => void;
  /** Fill the parent's height instead of using a fixed-height body. Used when
   *  the file is opened full-screen. */
  fillHeight?: boolean;
  /** Toggle full-screen on/off (flips `fillHeight` via the parent). */
  onToggleFullScreen?: () => void;
  className?: string;
};

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

export function MarkdownEditor({
  sessionId,
  path,
  initialContent,
  scrollToText,
  readOnly,
  onClose,
  onSaved,
  fillHeight,
  onToggleFullScreen,
  className,
}: MarkdownEditorProps) {
  const [content, setContent] = useState<string>(initialContent ?? "");
  const [original, setOriginal] = useState<string>(initialContent ?? "");
  const [size, setSize] = useState<Size>("default");
  const [mode, setMode] = useState<EditorMode>(
    () => (localStorage.getItem("editor-mode") as EditorMode | null) ?? "rich"
  );
  const [loading, setLoading] = useState<boolean>(initialContent === undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Load when path changes (or when initialContent not provided).
  useEffect(() => {
    let cancelled = false;
    if (initialContent !== undefined) {
      setContent(initialContent);
      setOriginal(initialContent);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(
      `/api/files/read?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { content: string }) => {
        if (cancelled) return;
        setContent(data.content);
        setOriginal(data.content);
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
  }, [sessionId, path, initialContent]);

  const dirty = content !== original;

  const save = useCallback(async () => {
    if (saving || readOnly || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/files/write?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentRef.current }),
        }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      setOriginal(contentRef.current);
      onSaved?.(contentRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [sessionId, path, dirty, readOnly, saving, onSaved]);

  const saveRef = useRef(save);
  saveRef.current = save;

  const heightClass =
    size === "collapsed"
      ? "h-0 overflow-hidden"
      : size === "expanded"
        ? "h-[80vh]"
        : "h-[30rem]";

  return (
    <div
      className={cn(
        "rounded-md border bg-background text-sm overflow-hidden",
        fillHeight && "flex h-full min-h-0 flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="size-7 shrink-0"
                  aria-label="Close editor"
                >
                  <X className="size-4" />
                </Button>
              } />
              <TooltipContent><p>Close editor</p></TooltipContent>
            </Tooltip>
          )}
          <SuiteGlyph className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">{basename(path)}</span>
          <span
            className="text-[11px] text-muted-foreground truncate hidden sm:inline"
            title={path}
          >
            {path}
          </span>
          {dirty && (
            <span className="text-[11px] text-amber-500 shrink-0">● unsaved</span>
          )}
          {error && (
            <span className="text-[11px] text-red-500 truncate" title={error}>
              {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Editor mode: Rich (BlockNote blocks) ↔ Markdown (OverType raw). */}
          <div className="flex items-center rounded-md border p-0.5">
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={() => { setMode("rich"); localStorage.setItem("editor-mode", "rich"); }}
                  className={cn(
                    "rounded p-1 text-muted-foreground hover:bg-muted",
                    mode === "rich" && "bg-muted text-foreground"
                  )}
                  aria-pressed={mode === "rich"}
                  aria-label="Rich editor"
                >
                  <Blocks className="size-3.5" />
                </button>
              } />
              <TooltipContent><p>Rich editor</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={() => { setMode("markdown"); localStorage.setItem("editor-mode", "markdown"); }}
                  className={cn(
                    "rounded p-1 text-muted-foreground hover:bg-muted",
                    mode === "markdown" && "bg-muted text-foreground"
                  )}
                  aria-pressed={mode === "markdown"}
                  aria-label="Markdown editor"
                >
                  <Code className="size-3.5" />
                </button>
              } />
              <TooltipContent><p>Markdown editor</p></TooltipContent>
            </Tooltip>
          </div>
          {/* Full-screen toggle: fills the area (and hides the chat) ↔ strip. */}
          {onToggleFullScreen && (
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleFullScreen}
                  className="size-7"
                  aria-label={fillHeight ? "Exit full screen" : "Full screen"}
                >
                  {fillHeight ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Expand className="size-3.5" />
                  )}
                </Button>
              } />
              <TooltipContent><p>{fillHeight ? "Exit full screen" : "Full screen"}</p></TooltipContent>
            </Tooltip>
          )}
          {/* Collapse to header — only meaningful in the strip layout. */}
          {!fillHeight && (
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setSize((s) => (s === "collapsed" ? "default" : "collapsed"))
                  }
                  className="size-7"
                  aria-label={size === "collapsed" ? "Show editor" : "Collapse to header"}
                >
                  <ChevronDownIcon
                    className={cn("size-3.5 transition-transform", size === "collapsed" && "-rotate-180")}
                  />
                </Button>
              } />
              <TooltipContent><p>{size === "collapsed" ? "Show editor" : "Collapse to header"}</p></TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            size="sm"
            variant={dirty ? "default" : "ghost"}
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => void save()}
            disabled={!dirty || saving || readOnly}
          >
            <SaveIcon className="size-3" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div
        style={{ contain: "paint" }}
        className={cn(
          "flex transition-[height]",
          fillHeight ? "min-h-0 flex-1" : heightClass
        )}
      >
        {loading && (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
            <Shimmer as="span">Loading file…</Shimmer>
          </div>
        )}
        {!loading && mode === "rich" && (
          <BlockEditor
            value={content}
            onChange={setContent}
            readOnly={readOnly || saving}
            theme={isDark ? "dark" : "light"}
            scrollToText={scrollToText}
            onSaveShortcut={() => void saveRef.current()}
          />
        )}
        {!loading && mode === "markdown" && (
          <OverTypeEditor
            value={content}
            onChange={setContent}
            readOnly={readOnly || saving}
            theme={isDark ? "dark" : "light"}
            scrollToText={scrollToText}
            onSaveShortcut={() => void saveRef.current()}
          />
        )}
      </div>
    </div>
  );
}

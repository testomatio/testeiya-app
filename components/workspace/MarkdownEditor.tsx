"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SuiteGlyph } from "@/components/icons";
import {
  ChevronDownIcon,
  Expand,
  Icon,
  Minimize2,
  SaveIcon,
  Blocks,
  Code,
  X,
} from "@/lib/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useWidgetSnapshot } from "@/components/widgets/use-widget-snapshot";
import { useTheme } from "@/lib/theme";
import { BlockEditor } from "./BlockEditor";
import { OverTypeEditor } from "./OverTypeEditor";
import { CodeEditor } from "./CodeEditor";
import { SuiteToc } from "./SuiteToc";
import type { SuiteTest } from "@/lib/test-md";

type Size = "collapsed" | "default" | "expanded";
type EditorMode = "rich" | "markdown";
type View = "toc" | "editor";

const TEST_MD_RE = /\.test\.md$/i;
const TEST_MARKER_RE = /^<!--\s*test\b/m;

export type MarkdownEditorProps = {
  sessionId: string;
  path: string;
  /** Seed content (used when the agent just wrote this file). */
  initialContent?: string;
  /** Text to scroll to and highlight once the editor renders (search result). */
  scrollToText?: string;
  /** Key that changes whenever the "open file" should force a remount. */
  instanceKey?: number;
  /** Bump to re-read the file from disk (skipped while there are unsaved edits). */
  reloadToken?: number;
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
  reloadToken,
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
  // A suite file opens on its contents list; picking a test (here or in the
  // sidebar, which passes `scrollToText`) drops into the editor at that test.
  const [pickedView, setPickedView] = useState<View | null>(null);
  const [scrollTarget, setScrollTarget] = useState(scrollToText);
  const [loading, setLoading] = useState<boolean>(initialContent === undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed read is kept apart from a failed save: it replaces the body (there
  // is no file to show), while a save error must never hide the user's edits.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // The rich editor seeds its document once, so content replaced from disk has
  // to remount it.
  const [seed, setSeed] = useState(0);
  const contentRef = useRef(content);
  contentRef.current = content;
  const dirty = content !== original;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const tokenRef = useRef(reloadToken);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMarkdown = /\.(md|markdown)$/i.test(path);
  const isSuite = TEST_MD_RE.test(path);
  let view: View = "editor";
  if (isSuite && !scrollToText && TEST_MARKER_RE.test(content)) view = "toc";
  if (pickedView) view = pickedView;
  let tabValue: string = mode;
  if (view === "toc") tabValue = "toc";

  // Load when path changes (or when initialContent not provided); a bumped
  // `reloadToken` re-reads the file in place, but never over unsaved edits.
  useEffect(() => {
    const reloading = tokenRef.current !== reloadToken;
    tokenRef.current = reloadToken;
    if (reloading && dirtyRef.current) return;
    let cancelled = false;
    if (initialContent !== undefined && !reloading) {
      setContent(initialContent);
      setOriginal(initialContent);
      setLoading(false);
      return;
    }
    if (!reloading) setLoading(true);
    setLoadError(null);
    fetch(
      `/api/files/read?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`
    )
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
        }
        return data as { content: string };
      })
      .then((data) => {
        if (cancelled) return;
        if (data.content !== contentRef.current) setSeed((s) => s + 1);
        setContent(data.content);
        setOriginal(data.content);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, path, initialContent, reloadToken, retry]);

  useWidgetSnapshot({ kind: "file", path, content, unsaved: dirty }, !loading);

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

  const openTest = useCallback((test: SuiteTest) => {
    setScrollTarget(test.anchor);
    setPickedView("editor");
  }, []);

  const heightClass =
    size === "collapsed"
      ? "h-0 overflow-hidden"
      : size === "expanded"
        ? "h-[80vh]"
        : "h-[30rem]";

  return (
    <div
      className={cn(
        "bg-background text-sm overflow-hidden",
        !fillHeight && "rounded-md border",
        fillHeight && "flex h-full min-h-0 flex-col",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-between gap-2 px-2 py-1.5",
          fillHeight && "h-12 shrink-0 border-b py-0 px-3"
        )}
      >
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
          {(error ?? loadError) && (
            <span className="text-[11px] text-red-500 truncate" title={error ?? loadError ?? ""}>
              {error ?? loadError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Editor mode: Rich (BlockNote blocks) ↔ Markdown (OverType raw).
              Only markdown files get the block editor; other files fall back to
              the code editor below. */}
          {isMarkdown && (
          <Tabs
            value={tabValue}
            onValueChange={(v) => {
              if (v === "toc") {
                setPickedView("toc");
                return;
              }
              setPickedView("editor");
              setMode(v as EditorMode);
              localStorage.setItem("editor-mode", String(v));
            }}
          >
            <TabsList className="h-7">
              {isSuite && (
                <Tooltip>
                  <TooltipTrigger render={
                    <TabsTrigger value="toc" className="px-1.5" aria-label="Contents">
                      <Icon name="toc" className="size-3.5" />
                    </TabsTrigger>
                  } />
                  <TooltipContent><p>Contents</p></TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger render={
                  <TabsTrigger value="rich" className="px-1.5" aria-label="Rich editor">
                    <Blocks className="size-3.5" />
                  </TabsTrigger>
                } />
                <TooltipContent><p>Rich editor</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <TabsTrigger value="markdown" className="px-1.5" aria-label="Markdown editor">
                    <Code className="size-3.5" />
                  </TabsTrigger>
                } />
                <TooltipContent><p>Markdown editor</p></TooltipContent>
              </Tooltip>
            </TabsList>
          </Tabs>
          )}
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
        {!loading && loadError && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm">Could not open {basename(path)}</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </Button>
          </div>
        )}
        {!loading && !loadError && view === "toc" && (
          <SuiteToc
            content={content}
            fallbackTitle={basename(path)}
            onOpenTest={openTest}
            className="min-w-0 flex-1"
          />
        )}
        {!loading && !loadError && view === "editor" && isMarkdown && mode === "rich" && (
          <BlockEditor
            key={seed}
            value={content}
            onChange={setContent}
            readOnly={readOnly || saving}
            theme={isDark ? "dark" : "light"}
            scrollToText={scrollTarget}
            onSaveShortcut={() => void saveRef.current()}
          />
        )}
        {!loading && !loadError && view === "editor" && isMarkdown && mode === "markdown" && (
          <OverTypeEditor
            value={content}
            onChange={setContent}
            readOnly={readOnly || saving}
            theme={isDark ? "dark" : "light"}
            scrollToText={scrollTarget}
            onSaveShortcut={() => void saveRef.current()}
          />
        )}
        {!loading && !loadError && !isMarkdown && (
          <CodeEditor
            value={content}
            onChange={setContent}
            path={path}
            readOnly={readOnly || saving}
            scrollToText={scrollToText}
            onSaveShortcut={() => void saveRef.current()}
          />
        )}
      </div>
    </div>
  );
}

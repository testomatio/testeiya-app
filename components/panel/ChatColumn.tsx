"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePanel } from "@/lib/panel/PanelContext";
import { ChatRail } from "./ChatRail";

const WIDTH_STORAGE_KEY = "testeiya.chat.width";
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const WIDGET_MIN_WIDTH = 360;
const COLLAPSE_RATIO = 0.05;
const DEFAULT_RATIO = 0.3;

/**
 * The chat column shell. It owns an explicit, persisted width and a single,
 * always-mounted left-edge drag handle that resizes the chat against the
 * widget pane and snaps between two states:
 *   - dragged below ~5% of the row → collapsed to the 48px `ChatRail`;
 *   - dragged back out → re-expanded (so the splitter works both ways).
 * Collapse is only possible while a widget fills the rest of the row; with no
 * widget the chat always fills (no handle, never a blank middle). Width init is
 * hydration-safe (the build is statically exported).
 */
export function ChatColumn({
  hasWidget,
  children,
}: {
  hasWidget: boolean;
  children: ReactNode;
}) {
  const { chatOpen, setChatOpen } = usePanel();
  const asideRef = useRef<HTMLElement>(null);

  // Start from the deterministic default so the first client render matches the
  // server; apply the persisted width after mount (reading localStorage in the
  // initializer causes a hydration mismatch).
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the persisted width is
       read after mount on purpose; reading it during render diverges from the
       default-width SSR markup and breaks hydration */
    setWidth(loadWidth());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Collapse only makes sense when a widget occupies the rest of the row, so a
  // blank middle (chat collapsed with nothing beside it) can never happen.
  const collapsed = hasWidget && !chatOpen;

  // First expand with a widget and no stored width → snap to ~30% of the row.
  useEffect(() => {
    if (!hydrated || collapsed || !hasWidget) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(WIDTH_STORAGE_KEY)) return;
    const row = asideRef.current?.parentElement?.clientWidth;
    if (!row) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a post-mount DOM measurement
    setWidth(clampWidth(Math.round(row * DEFAULT_RATIO), row));
  }, [hydrated, collapsed, hasWidget]);

  useEffect(() => {
    if (!hydrated || collapsed) return;
    saveWidth(width);
  }, [width, hydrated, collapsed]);

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const row = asideRef.current?.parentElement?.clientWidth ?? 0;
      const startW = asideRef.current?.offsetWidth ?? width;
      dragRef.current = { startX: e.clientX, startW };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        // Dragging the left handle leftwards (negative delta) widens the chat.
        const delta = ev.clientX - dragRef.current.startX;
        const raw = dragRef.current.startW - delta;
        if (row && raw < row * COLLAPSE_RATIO) {
          setChatOpen(false);
          return;
        }
        setChatOpen(true);
        setWidth(clampWidth(raw, row));
      };
      const onUp = () => {
        dragRef.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, setChatOpen]
  );

  // The handle exists only when a widget is present — that's the only state in
  // which the chat is resizable/collapsible.
  const handle = hasWidget ? (
    <div
      onMouseDown={onResizeMouseDown}
      className={cn(
        "absolute top-0 -left-1 h-full w-3 cursor-col-resize z-10",
        "bg-transparent hover:bg-primary/30 transition-colors"
      )}
      role="separator"
      aria-orientation="vertical"
      aria-label={collapsed ? "Expand chat" : "Resize chat"}
      title="Drag to resize"
    />
  ) : null;

  if (collapsed) {
    return (
      <aside ref={asideRef} className="relative flex shrink-0">
        <ChatRail />
        {handle}
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      className={cn(
        "relative flex flex-col bg-muted/30",
        hasWidget ? "shrink-0 border-l" : "min-w-0 flex-1"
      )}
      style={hasWidget ? { width } : undefined}
    >
      {children}
      {handle}
    </aside>
  );
}

function clampWidth(w: number, row: number): number {
  const max = row ? Math.max(MIN_WIDTH, row - WIDGET_MIN_WIDTH) : w;
  return Math.min(max, Math.max(MIN_WIDTH, w));
}

function loadWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const v = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_WIDTH) return v;
  } catch {}
  return DEFAULT_WIDTH;
}

function saveWidth(w: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(w)));
  } catch {}
}

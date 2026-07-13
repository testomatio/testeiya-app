"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLayoutNode } from "@/lib/debug/layout-registry";

const WIDTH_STORAGE_KEY = "testeiya.widget-pane.width";
const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 360;
const MAX_WIDTH = 1000;

/**
 * The widget pane: a resizable column between the sidebar and the chat that
 * shows exactly one widget at a time (agent renders, project resource views,
 * the file editor, or search). Collapses entirely when there is nothing to
 * show so the chat reflows to full width. Width is drag-resizable and persisted.
 */
export function WidgetPane({
  children,
  fill = false,
}: {
  children: ReactNode;
  fill?: boolean;
}) {
  // Start at the deterministic default so the first client render matches the
  // server; apply the stored width after mount (reading localStorage in the
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
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, dragRef.current.startW + delta)
        );
        setWidth(next);
      };
      const onUp = () => {
        if (dragRef.current) {
          saveWidth(width);
          dragRef.current = null;
        }
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
    [width]
  );
  useEffect(() => {
    if (!hydrated) return;
    saveWidth(width);
  }, [width, hydrated]);

  const layoutRef = useLayoutNode("WidgetPane");

  if (!children) return null;

  return (
    <aside
      ref={layoutRef}
      className={cn(
        "relative flex flex-col bg-muted/20",
        fill ? "min-w-0 flex-1" : "shrink-0 border-r"
      )}
      style={fill ? undefined : { width }}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {/* Drag handle on the right edge (the chat boundary) — stripe on hover.
          Hidden when the pane fills the area (no chat to resize against). */}
      {!fill && (
        <div
          onMouseDown={onResizeMouseDown}
          className={cn(
            "absolute top-0 right-0 h-full w-1 cursor-col-resize",
            "bg-transparent hover:bg-primary/30 transition-colors",
            "after:content-[''] after:absolute after:top-0 after:-right-1 after:h-full after:w-2"
          )}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize widget pane"
          title="Drag to resize"
        />
      )}
    </aside>
  );
}

function loadWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const v = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_WIDTH && v <= MAX_WIDTH) return v;
  } catch {}
  return DEFAULT_WIDTH;
}

function saveWidth(w: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(w)));
  } catch {}
}

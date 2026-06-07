"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePanel } from "@/lib/panel/PanelContext";
import { PANEL_SECTIONS } from "./sections/registry";

const WIDTH_STORAGE_KEY = "testeiya.workspace-tree.width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 180;
const MAX_WIDTH = 700;

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

/**
 * The left sidebar panel: a single-open accordion of "services" (Workspace,
 * Project, Connections, Pipelines) from the registry. The expanded section
 * fills the remaining height; collapsed sections show only their header row.
 * Width is drag-resizable and persisted. Hidden entirely when the panel is
 * closed.
 */
export function SidebarPanel({ className }: { className?: string }) {
  const { open, activeSection, setActiveSection } = usePanel();

  // Resize handle — drag to change panel width, persisted in localStorage.
  // Start at the deterministic default so the first client render matches the
  // server (reading localStorage in the initializer causes a hydration
  // mismatch); apply the stored width after mount.
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setWidth(loadWidth());
    setHydrated(true);
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
  // Persist final width after each state settle (belt-and-suspenders). Gated on
  // `hydrated` so the initial default doesn't overwrite the stored value before
  // it's been read back in.
  useEffect(() => {
    if (!hydrated) return;
    saveWidth(width);
  }, [width, hydrated]);

  if (!open) return null;

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col border-r bg-muted/20",
        className
      )}
      style={{ width }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {PANEL_SECTIONS.map((def) => {
          const isActive = activeSection === def.id;
          return (
            <def.Section
              key={def.id}
              active={isActive}
              onToggle={() => setActiveSection(isActive ? null : def.id)}
            />
          );
        })}
      </div>

      {/* Drag handle on the right edge — visible stripe on hover. */}
      <div
        onMouseDown={onResizeMouseDown}
        className={cn(
          "absolute top-0 right-0 h-full w-1 cursor-col-resize",
          "bg-transparent hover:bg-primary/30 transition-colors",
          "after:content-[''] after:absolute after:top-0 after:-right-1 after:h-full after:w-2"
        )}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize"
      />
    </aside>
  );
}

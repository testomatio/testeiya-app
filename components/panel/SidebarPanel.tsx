"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePanel } from "@/lib/panel/PanelContext";
import { PANEL_SECTIONS } from "./sections/registry";

const WIDTH_STORAGE_KEY = "testeiya.workspace-tree.width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 180;
const MAX_WIDTH = 700;
const ICON_STRIP_W = 48;

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

export function SidebarPanel({ className }: { className?: string }) {
  const { open, activeSection, setActiveSection } = usePanel();

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

  if (!open) return null;

  return (
    <aside
      className={cn(
        "relative flex shrink-0 border-r bg-background",
        className
      )}
      style={{ width }}
    >
      {/* Icon strip */}
      <nav
        className="flex shrink-0 flex-col items-center gap-1 border-r py-1"
        style={{ width: ICON_STRIP_W }}
        aria-label="Panel sections"
      >
        {PANEL_SECTIONS.map((def) => {
          const isActive = activeSection === def.id;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => setActiveSection(isActive ? null : def.id)}
              title={def.title}
              aria-label={def.title}
              aria-pressed={isActive}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {def.icon}
            </button>
          );
        })}
      </nav>

      {/* Section content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

      {/* Drag handle */}
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

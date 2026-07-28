"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { cn } from "@/lib/utils";
import { usePanel } from "@/lib/panel/PanelContext";
import { useProjectService, useDebugLogService, useWorkspaceService } from "@/lib/services/StoreProvider";
import { useTheme } from "@/lib/theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon, SunIcon, MoonIcon, ChevronsUpDownIcon, ExternalLinkIcon } from "@/lib/icons";
import { ProjectGlyph, FolderGlyph } from "@/components/icons";
import { PANEL_SECTIONS } from "./sections/registry";
import { useLayoutNode } from "@/lib/debug/layout-registry";

const WIDTH_STORAGE_KEY = "testeiya.workspace-tree.width";
const DEFAULT_WIDTH = 400;
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

export const SidebarPanel = observer(function SidebarPanel({
  cwd,
  onSwitchProject,
  onOpenProviders,
  className,
}: {
  cwd?: string | null;
  onSwitchProject?: () => void;
  onOpenProviders?: () => void;
  className?: string;
}) {
  const { open, activeSection, setActiveSection, togglePanel } = usePanel();
  const project = useProjectService();
  const workspace = useWorkspaceService();
  const debug = useDebugLogService();
  const { theme, toggle: toggleTheme, locked: themeLocked } = useTheme();
  const layoutRef = useLayoutNode("SidebarPanel");

  const sections = PANEL_SECTIONS.filter(
    (def) => def.id !== "debug" || debug.enabled
  );

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [initializing, setInitializing] = useState(true);
  useLayoutEffect(() => {
    setWidth(loadWidth());
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setInitializing(false), 800);
    return () => clearTimeout(t);
  }, []);

  // Keep-alive: once the panel has been opened its content stays mounted (just
  // hidden) so collapsing/expanding it doesn't rebuild the sections.
  const openedRef = useRef(open);
  if (open) openedRef.current = true;

  const widthRef = useRef(width);
  widthRef.current = width;
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      saveWidth(widthRef.current);
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
  }, []);

  return (
    <aside
      ref={layoutRef}
      className={cn(
        "relative flex shrink-0 border-r bg-background",
        className
      )}
      style={open ? { width } : { width: ICON_STRIP_W }}
    >
      {/* Icon strip — always visible */}
      <nav
        className="flex shrink-0 flex-col items-center border-r"
        style={{ width: ICON_STRIP_W }}
        aria-label="Panel sections"
      >
        {/* Panel toggle */}
        <div className="flex h-12 shrink-0 flex-col items-center justify-center w-full px-1 border-b">
          <Tooltip>
            <TooltipTrigger render={
              <button
                type="button"
                onClick={togglePanel}
                aria-label={open ? "Hide panel" : "Show panel"}
                className="flex size-8 items-center justify-center rounded-md transition-colors text-foreground hover:bg-muted"
              >
                <Icon name={open ? "dock_to_left" : "side_navigation"} className="size-4" />
              </button>
            } />
            <TooltipContent side="right"><p>{open ? "Hide panel" : "Show panel"}</p></TooltipContent>
          </Tooltip>
        </div>

        {/* Section icons */}
        <div className="flex flex-1 flex-col items-center gap-1 w-full px-1 pt-1">
          {sections.map((def) => {
            const isActive = open && activeSection === def.id;
            return (
              <Tooltip key={def.id}>
                <TooltipTrigger render={
                  <button
                    type="button"
                    onClick={() => {
                      if (!open) {
                        togglePanel();
                      }
                      setActiveSection(def.id);
                    }}
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
                } />
                <TooltipContent side="right"><p>{def.title}</p></TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Bottom: theme toggle */}
        <div className="flex flex-col items-center gap-1 w-full px-1 pb-1">
          {!themeLocked && (
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className="flex size-8 items-center justify-center rounded-md transition-colors text-foreground hover:bg-muted"
                >
                  {theme === "dark" && <SunIcon className="size-4" />}
                  {theme !== "dark" && <MoonIcon className="size-4" />}
                </button>
              } />
              <TooltipContent side="right">
                <p>{theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </nav>

      {/* Content panel — mounted once opened, hidden while collapsed */}
      {openedRef.current && (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={open ? undefined : { display: "none" }}
        >
          {/* Sidebar header: project info */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
            <Tooltip>
              <TooltipTrigger render={
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/testeiya-icon.svg" alt="Testeiya" className="h-7 w-auto shrink-0" />
              } />
              <TooltipContent side="bottom"><p>Testeiya</p></TooltipContent>
            </Tooltip>
            {width >= 280 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={theme === "dark" ? "/testeiya-wordmark-dark.svg" : "/testeiya-wordmark.svg"}
                alt="Testeiya"
                className="h-5 w-auto shrink-0"
              />
            )}
            <div className="flex-1" />
            {project.currentProject && (
              <>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      type="button"
                      onClick={onSwitchProject}
                      aria-label="Switch project"
                      className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted/50"
                    >
                      <ProjectGlyph className="size-3 shrink-0 text-primary" />
                      <span className="truncate font-medium text-foreground">
                        {project.currentProject.title}
                      </span>
                      {project.currentProject.testsCount !== null && (
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          · {project.currentProject.testsCount.toLocaleString()} tests
                        </span>
                      )}
                      <ChevronsUpDownIcon className="size-3 shrink-0 text-muted-foreground" />
                    </button>
                  } />
                  <TooltipContent side="bottom"><p>Switch project</p></TooltipContent>
                </Tooltip>
                {project.currentLinks?.project && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <button
                        type="button"
                        onClick={() => project.openExternal(project.currentLinks!.project)}
                        aria-label="Open project in Testomat.io"
                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      >
                        <ExternalLinkIcon className="size-4" />
                      </button>
                    } />
                    <TooltipContent side="bottom"><p>Open project in Testomat.io</p></TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>

          {/* Section content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {sections.map((def) => {
              const isActive = activeSection === def.id;
              return (
                <def.Section
                  key={def.id}
                  active={isActive}
                  onToggle={() => setActiveSection(isActive ? null : def.id)}
                  initializing={initializing}
                  onOpenProviders={onOpenProviders}
                  onSwitchProject={onSwitchProject}
                />
              );
            })}
          </div>

          {/* Bottom: cwd path → opens workspace section */}
          {cwd && (
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={() => setActiveSection("workspace")}
                  className="flex h-7 shrink-0 items-center gap-1.5 border-t px-3 text-left text-[11px] font-mono text-muted-foreground transition-colors hover:text-foreground"
                >
                  <FolderGlyph className="size-3 shrink-0" />
                  <span className="min-w-0 truncate [direction:rtl]">{cwd}</span>
                  {workspace.branch && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Icon name="fork_right" className="size-3 shrink-0" />
                      {workspace.branch}
                    </span>
                  )}
                </button>
              } />
              <TooltipContent side="top">
                <p className="font-mono text-xs break-all">{cwd}</p>
                {workspace.branch && (
                  <p className="font-mono text-xs">on branch {workspace.branch}</p>
                )}
                <p className="text-muted-foreground text-xs">Open workspace</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Drag handle */}
      {open && (
        <div
          onMouseDown={onResizeMouseDown}
          className={cn(
            "absolute top-0 -right-1 h-full w-3 cursor-col-resize z-10",
            "bg-transparent hover:bg-primary/30 transition-colors",
          )}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize"
        />
      )}
    </aside>
  );
});

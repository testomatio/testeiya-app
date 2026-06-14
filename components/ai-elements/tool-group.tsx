"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon, WrenchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolGroupProps = {
  count: number;
  summary: string;
  /** Whether any of the wrapped tools is still running. */
  running?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Collapsible wrapper around a stretch of "routine" tool calls
 * (bash / read / grep / find / etc.). Shows a single compact summary row
 * by default; expanding reveals the individual tool cards stacked inside.
 */
export function ToolGroup({
  count,
  summary,
  running,
  children,
  className,
}: ToolGroupProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("not-prose w-full rounded-md border", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-2.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium shrink-0">
            {count} {running ? "operations running" : "operations"}
          </span>
          <span className="text-xs text-muted-foreground font-mono truncate">
            {summary}
          </span>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="space-y-2 border-t p-3">{children}</div>}
    </div>
  );
}

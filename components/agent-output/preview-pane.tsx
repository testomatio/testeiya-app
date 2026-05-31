"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Wrapper shown in-place when the user clicks a row in a *ListRenderer.
 * Replaces the list with a scrollable card containing the matching
 * *ItemRenderer and a "Back to list" header. Escape also closes.
 */

export interface PreviewPaneProps {
  title?: string;
  onBack: () => void;
  children: ReactNode;
  className?: string;
}

export function PreviewPane({
  title,
  onBack,
  children,
  className,
}: PreviewPaneProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus the pane on mount so Escape works immediately and scroll-into-view
  // happens when opened from a long list.
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onBack();
        }
      }}
      className={cn(
        "overflow-hidden rounded-md border bg-card/40 outline-none",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onBack}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <ArrowLeftIcon className="size-3" />
          Back to list
        </Button>
        {title && (
          <span className="truncate text-xs text-muted-foreground" title={title}>
            {title}
          </span>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          esc
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

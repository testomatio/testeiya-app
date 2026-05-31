"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MdiIcon } from "@/components/icons";
import { mdiChevronDown } from "@mdi/js";

/**
 * Shared chrome for a sidebar section: a clickable header row (disclosure
 * chevron + icon + title, with optional right-aligned actions) and, when
 * active, a body that fills the remaining sidebar height. Keeps every section's
 * header visually identical; each section supplies its own icon/body.
 */
export function SectionShell({
  icon,
  title,
  active,
  onToggle,
  actions,
  children,
}: {
  icon: ReactNode;
  title: string;
  active: boolean;
  onToggle: () => void;
  /** Header-right controls, shown only while the section is expanded. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    // `flex-1 min-h-0` while active makes the body fill the leftover height;
    // `shrink-0` while collapsed keeps the row at its natural header height.
    <div className={cn("flex min-h-0 flex-col", active ? "flex-1" : "shrink-0")}>
      <div className="flex items-center gap-1 border-b">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={active}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <MdiIcon
            path={mdiChevronDown}
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              !active && "-rotate-90"
            )}
          />
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{title}</span>
        </button>
        {active && actions ? (
          <div className="flex shrink-0 items-center gap-0.5 pr-1">{actions}</div>
        ) : null}
      </div>
      {active ? (
        // Flex column so a section can hand its body a `flex-1` child that
        // fills the leftover height (e.g. the workspace file list).
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      ) : null}
    </div>
  );
}

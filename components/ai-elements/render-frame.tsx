"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type RenderFrameProps = {
  /** Short label shown next to the icon, e.g. "Runs in codeceptjs". */
  title?: string;
  /** Icon emoji or short glyph shown on the left of the header. */
  icon?: ReactNode;
  /** Badge next to the title (e.g. kind tag). */
  tag?: ReactNode;
  /**
   * Initial open state. Like `Tool`, this is honored across re-renders:
   * if the flag flips (e.g. a newer render arrives in the same message
   * and this one should auto-collapse), the frame follows — unless the
   * user has already toggled it manually.
   */
  defaultOpen?: boolean;
  /** Optional right-side text (timestamp, count, etc.). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Collapsible frame used by every `render_*` block. Provides a consistent
 * header (icon + title + meta + chevron) so the user can scan what's been
 * rendered across a long conversation. Auto-collapse of older renders is
 * driven by the parent via `defaultOpen`.
 */
export function RenderFrame({
  title,
  icon,
  tag,
  defaultOpen = true,
  meta,
  children,
  className,
}: RenderFrameProps) {
  const [userOverride, setUserOverride] = useState<boolean | undefined>(undefined);
  const open = userOverride !== undefined ? userOverride : defaultOpen;

  return (
    <div
      className={cn(
        "not-prose mb-4 w-full rounded-md border bg-background",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setUserOverride(!open)}
        className="flex w-full items-center justify-between gap-3 p-2.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon != null && <span className="shrink-0 text-base leading-none">{icon}</span>}
          {title && (
            <span className="font-medium text-sm truncate">{title}</span>
          )}
          {tag}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meta && (
            <span className="text-[11px] text-muted-foreground">{meta}</span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

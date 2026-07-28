"use client";

import {
  mdiChevronDoubleUp,
  mdiChevronDown,
  mdiChevronUp,
  mdiCircleOutline,
  mdiLabelVariant,
} from "@mdi/js";
import { MdiIcon } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Mirrors the product's `components/priority/icons` glyphs and colors.
const PRIORITY_GLYPH: Record<string, { path: string; className: string }> = {
  low: { path: mdiChevronDown, className: "size-4.5 text-status-info-foreground" },
  normal: { path: mdiCircleOutline, className: "size-3 text-muted-foreground" },
  high: { path: mdiChevronUp, className: "size-4.5 text-status-error-foreground" },
  important: {
    path: mdiChevronDoubleUp,
    className: "size-4.5 text-status-error-foreground",
  },
  critical: {
    path: mdiLabelVariant,
    className: "size-4 -rotate-90 text-status-error-foreground",
  },
};

/** Test priority as the product's glyph, with a `Priority: <value>` tooltip. */
export function PriorityIcon({
  priority,
  className,
}: {
  priority?: string | null;
  className?: string;
}) {
  if (!priority) return null;
  const glyph = PRIORITY_GLYPH[priority.toLowerCase()] ?? PRIORITY_GLYPH.normal;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={`Priority: ${priority}`}
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center",
              className,
            )}
          />
        }
      >
        <MdiIcon path={glyph.path} className={glyph.className} />
      </TooltipTrigger>
      <TooltipContent>
        <p className="capitalize">Priority: {priority}</p>
      </TooltipContent>
    </Tooltip>
  );
}

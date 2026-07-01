"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startColumnDrag } from "@/lib/resizable-columns";
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";

/*
 * Dense list-row primitive modelled on the Ember frontend's
 * `.tree-row` / `.list-runs-header` / `.nested-item-row` (all 36px tall,
 * padding py-1 px-1.5, grid or flex inside). Used by every *ListRenderer
 * instead of shadcn Table so spacing matches the parent app.
 */

export type ListRowVariant = "flex" | "grid";

type BaseProps = {
  className?: string;
  /** CSS grid-template-columns string (only when variant="grid"). */
  gridCols?: string;
  /** Gap between cells (Tailwind class). Default: gap-x-2. */
  gapClass?: string;
  /** Render as hover/selection hover state (row becomes interactive). */
  interactive?: boolean;
  selected?: boolean;
};

const ResizableColumnsContext = createContext<ResizableColumns | null>(null);

export type ListRowGroupProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * Shared `grid-template-columns` for the header + rows inside this group.
   * When set, the columns become user-resizable (drag the header dividers).
   */
  gridCols?: string;
};

/** Wrapper + subtle border around a stack of <ListRow>s. */
export function ListRowGroup({
  className,
  children,
  gridCols,
  ...props
}: ListRowGroupProps) {
  const columns = useResizableColumns(gridCols);
  return (
    <ResizableColumnsContext.Provider value={columns}>
      <div
        className={cn(
          "list-row-group overflow-hidden",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ResizableColumnsContext.Provider>
  );
}

export type ListRowProps = HTMLAttributes<HTMLDivElement> &
  BaseProps & {
    /**
     * When provided, the row becomes a button-like element (role=button,
     * Enter/Space key bindings, pointer cursor). Used by the list
     * renderers to open an inline item preview.
     */
    onOpen?: () => void;
  };

/**
 * Single dense row. 36px height, 4/6px padding, grid or flex layout,
 * absolute-positioned left-inset border-bottom (via `.list-row-divider`).
 */
export function ListRow({
  className,
  children,
  gridCols,
  gapClass = "gap-x-2",
  interactive = true,
  selected = false,
  style,
  onOpen,
  onClick,
  onKeyDown,
  ...props
}: ListRowProps) {
  const columns = useContext(ResizableColumnsContext);
  const template = columns?.template ?? gridCols;
  const gridStyle: CSSProperties | undefined = template
    ? { gridTemplateColumns: template, ...(style ?? {}) }
    : style;

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    onClick?.(e);
    if (!onOpen || e.defaultPrevented) return;
    // Ignore clicks originating from nested interactive elements (links,
    // buttons, inputs) so their own handlers win. Walk from target up to —
    // but NOT including — the row itself (which is role=button, so a naive
    // `closest('[role=button]')` would always match and short-circuit).
    const row = e.currentTarget;
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node && node !== row) {
      if (node.matches("a, button, input, label, [role='button']")) return;
      node = node.parentElement;
    }
    onOpen();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (!onOpen || e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  const clickable = !!onOpen;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "list-row-divider flex h-9 items-center px-1.5 py-1 text-sm",
        template && "grid",
        gapClass,
        interactive && "transition-colors hover:bg-muted/50",
        clickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-accent/40",
        className
      )}
      style={gridStyle}
      {...props}
    >
      {children}
    </div>
  );
}

export type ListRowHeaderProps = HTMLAttributes<HTMLDivElement> & {
  gridCols?: string;
  gapClass?: string;
};

/** Sticky-able header row with the same grid as the body rows below. */
export function ListRowHeader({
  className,
  children,
  gridCols,
  gapClass = "gap-x-2",
  style,
  ...props
}: ListRowHeaderProps) {
  const columns = useContext(ResizableColumnsContext);
  const template = columns?.template ?? gridCols;
  const gridStyle: CSSProperties | undefined = template
    ? { gridTemplateColumns: template, ...(style ?? {}) }
    : style;
  const cells = columns?.enabled ? Children.toArray(children) : null;
  return (
    <div
      ref={columns?.headerRef}
      className={cn(
        "sticky top-0 z-10 flex h-9 items-center border-b px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        template && "grid",
        gapClass,
        className
      )}
      style={gridStyle}
      {...props}
    >
      {!cells && children}
      {cells &&
        cells.map((cell, i) => (
          <div key={i} className="relative flex min-w-0 items-center">
            {cell}
            {i < cells.length - 1 && (
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize column"
                onPointerDown={(e) => {
                  e.preventDefault();
                  columns?.startResize(i, e.clientX);
                }}
                className="group/resize absolute top-1/2 right-0 z-20 flex h-9 w-3 -translate-y-1/2 translate-x-1/2 cursor-col-resize touch-none select-none items-stretch justify-center"
              >
                <span className="w-0.5 rounded-full bg-transparent transition-colors group-hover/resize:bg-primary" />
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

/** Caption strip at the bottom (e.g. "Showing X of Y"). */
export function ListRowCaption({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-t bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Pager strip for fetch-backed lists (label on the left, controls on the right).
 * Renders numbered page buttons (1 2 3 … N) when `totalPages` is known, falling
 * back to plain Prev/Next when the total is unknown.
 */
export function ListPager({
  label,
  page,
  totalPages,
  hasPrev,
  hasNext,
  onPage,
  className,
}: {
  label: string;
  page: number;
  totalPages?: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPage: (page: number) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          disabled={!hasPrev}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeftIcon className="size-3.5" />
          Prev
        </Button>
        {totalPages != null &&
          pageRange(page, totalPages).map((p, i) => {
            if (p === "ellipsis") {
              return (
                <span key={`gap-${i}`} className="px-1">
                  …
                </span>
              );
            }
            let variant: "secondary" | "ghost" = "ghost";
            if (p === page) variant = "secondary";
            return (
              <Button
                key={p}
                size="icon-xs"
                variant={variant}
                aria-current={p === page}
                onClick={() => onPage(p)}
              >
                {p}
              </Button>
            );
          })}
        <Button
          size="xs"
          variant="ghost"
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Page numbers to show around the current page: always first + last, the
 * current page ±1, and an "ellipsis" marker wherever a gap is collapsed.
 * e.g. pageRange(9, 17) → [1, "ellipsis", 8, 9, 10, "ellipsis", 17].
 */
function pageRange(current: number, total: number): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  pages.push(1);
  if (left > 2) pages.push("ellipsis");
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push("ellipsis");
  if (total > 1) pages.push(total);
  return pages;
}

/**
 * Shared, user-resizable `grid-template-columns` for a ListRowGroup. The header
 * and rows read `template`; dragging a header divider reads the live pixel
 * widths of the header tracks and shifts the dragged column against its right
 * neighbour, keeping the total width constant.
 */
function useResizableColumns(initialTemplate?: string): ResizableColumns {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [widths, setWidths] = useState<number[] | null>(null);

  const startResize = useCallback((index: number, clientX: number) => {
    const header = headerRef.current;
    if (!header) return;
    const tracks = getComputedStyle(header)
      .gridTemplateColumns.split(" ")
      .map((value) => parseFloat(value));
    if (tracks.length < 2 || tracks.some((n) => Number.isNaN(n))) return;
    startColumnDrag(tracks, index, clientX, setWidths);
  }, []);

  let template = initialTemplate;
  if (widths) template = widths.map((w) => `${w}px`).join(" ");
  return { template, startResize, headerRef, enabled: !!initialTemplate };
}

type ResizableColumns = {
  template?: string;
  startResize: (index: number, clientX: number) => void;
  headerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
};

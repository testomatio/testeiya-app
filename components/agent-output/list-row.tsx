"use client";

import { cn } from "@/lib/utils";
import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
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

export type ListRowGroupProps = HTMLAttributes<HTMLDivElement>;

/** Wrapper + subtle border around a stack of <ListRow>s. */
export function ListRowGroup({
  className,
  children,
  ...props
}: ListRowGroupProps) {
  return (
    <div
      className={cn(
        "list-row-group overflow-hidden rounded-md border bg-card/40",
        className
      )}
      {...props}
    >
      {children}
    </div>
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
  const gridStyle: CSSProperties | undefined = gridCols
    ? { gridTemplateColumns: gridCols, ...(style ?? {}) }
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
        gridCols && "grid",
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
  const gridStyle: CSSProperties | undefined = gridCols
    ? { gridTemplateColumns: gridCols, ...(style ?? {}) }
    : style;
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex h-9 items-center border-b bg-muted/30 px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        gridCols && "grid",
        gapClass,
        className
      )}
      style={gridStyle}
      {...props}
    >
      {children}
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

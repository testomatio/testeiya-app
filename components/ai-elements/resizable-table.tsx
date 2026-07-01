"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { cn } from "@/lib/utils";
import { startColumnDrag } from "@/lib/resizable-columns";
import type { Components } from "streamdown";

const TableColumnsContext = createContext<TableColumns | null>(null);

/**
 * Streamdown component overrides that make markdown-table columns user-resizable
 * while leaving Streamdown's own `table` wrapper (toolbar, copy/download,
 * fullscreen), `tbody` and `td` untouched. Spread into a Streamdown
 * `components` prop. The header measures its natural column widths once, locks
 * the table to `table-layout: fixed`, then drags shift a column against its
 * right neighbour.
 */
export const resizableTableComponents = {
  thead: ResizableThead,
  th: ResizableTh,
} as Components;

export function ResizableThead({
  children,
  className,
}: ComponentProps<"thead">) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    const thead = ref.current;
    if (!thead || widths) return;
    const table = thead.closest("table");
    const cells = thead.querySelectorAll<HTMLElement>("th");
    if (!table || cells.length < 2) return;
    const measured = Array.from(cells, (cell) =>
      cell.getBoundingClientRect().width
    );
    table.style.tableLayout = "fixed";
    table.style.width = "100%";
    setWidths(measured);
  }, [widths]);

  const startResize = useCallback(
    (index: number, clientX: number) => {
      if (!widths) return;
      startColumnDrag(widths, index, clientX, setWidths);
    },
    [widths]
  );

  return (
    <TableColumnsContext.Provider value={{ widths, startResize }}>
      <thead ref={ref} className={cn("bg-muted/80", className)}>
        {children}
      </thead>
    </TableColumnsContext.Provider>
  );
}

export function ResizableTh({
  children,
  className,
  style,
}: ComponentProps<"th">) {
  const columns = useContext(TableColumnsContext);
  const ref = useRef<HTMLTableCellElement>(null);
  const [pos, setPos] = useState<{ index: number; last: boolean } | null>(null);

  useLayoutEffect(() => {
    const th = ref.current;
    const row = th?.parentElement;
    if (!row) return;
    const index = Array.prototype.indexOf.call(row.children, th);
    setPos({ index, last: index === row.children.length - 1 });
  }, []);

  let cellStyle = style;
  if (columns?.widths && pos) {
    cellStyle = { width: `${columns.widths[pos.index]}px`, ...(style ?? {}) };
  }
  const showHandle = !!columns && !!pos && !pos.last;

  return (
    <th
      ref={ref}
      className={cn(
        "relative px-4 py-2 text-left text-sm font-semibold",
        className
      )}
      style={cellStyle}
    >
      <span className="block truncate">{children}</span>
      {showHandle && pos && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            columns?.startResize(pos.index, e.clientX);
          }}
          className="group/colresize absolute top-0 right-0 z-10 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none select-none items-stretch justify-center"
        >
          <span className="w-0.5 rounded-full bg-transparent transition-colors group-hover/colresize:bg-primary" />
        </span>
      )}
    </th>
  );
}

type TableColumns = {
  widths: number[] | null;
  startResize: (index: number, clientX: number) => void;
};

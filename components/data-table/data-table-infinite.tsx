"use client";

// REMINDER: React Compiler is not compatible with Tanstack Table v8 https://github.com/TanStack/table/issues/5567
"use no memo";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableProvider } from "@/components/data-table/data-table-provider";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"; // TODO: check where to put this
import type { DataTableFilterField } from "@/components/data-table/types";
import type { TqlField } from "@/lib/data-browse/tql";
import { Button } from "@/components/ui/button";
import { useHotKey } from "@/hooks/use-hot-key";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  getColumnOrderKey,
  getColumnVisibilityKey,
} from "@/lib/constants/local-storage";
import { getFacetedUniqueValuesFlattened } from "@/components/data-table/faceted";
import { formatCompactNumber } from "@/lib/format";
import { useFilterActions } from "@/lib/store/hooks/useFilterActions";
import { useFilterState } from "@/lib/store/hooks/useFilterState";
import { arrSome, inDateRange } from "@/lib/table/filterfns";
import { cn } from "@/lib/utils";
import type {
  ColumnDef,
  ColumnFiltersState,
  Row,
  RowSelectionState,
  SortingState,
  TableOptions,
  Table as TTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getFacetedMinMaxValues as getTTableFacetedMinMaxValues,
  useReactTable,
} from "@tanstack/react-table";
import { Loader2Icon } from "@/lib/icons";
import * as React from "react";

// TODO: add a possible chartGroupBy
export interface DataTableInfiniteProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  getRowClassName?: (row: Row<TData>) => string;
  // REMINDER: make sure to pass the correct id to access the rows
  getRowId?: TableOptions<TData>["getRowId"];
  data: TData[];
  defaultColumnFilters?: ColumnFiltersState;
  defaultColumnSorting?: SortingState;
  defaultRowSelection?: RowSelectionState;
  defaultColumnVisibility?: VisibilityState;
  filterFields?: DataTableFilterField<TData>[];
  tqlFields?: TqlField[];
  searchKey?: string;
  // REMINDER: close to the same signature as the `getFacetedUniqueValues` of the `useReactTable`
  getFacetedUniqueValues?: (
    table: TTable<TData>,
    columnId: string,
  ) => Map<string, number>;
  getFacetedMinMaxValues?: (
    table: TTable<TData>,
    columnId: string,
  ) => undefined | [number, number];
  totalRows?: number;
  filterRows?: number;
  totalRowsFetched?: number;
  isFetching?: boolean;
  isLoading?: boolean;
  hasNextPage?: boolean;
  manualFiltering?: boolean;
  fetchNextPage: () => Promise<unknown>;
  fetchPreviousPage?: () => Promise<unknown>;
  refetch: () => void;
  renderLiveRow?: (props?: { row: Row<TData> }) => React.ReactNode;
  // Used to store column order and visibility in local storage for specific data-table namespace
  tableId?: string;
  // Optional slots for extensibility
  commandSlot?: React.ReactNode;
  sheetSlot?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  chartSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  floatingBarSlot?: React.ReactNode;
  className?: string;
}

export function DataTableInfinite<TData, TValue>({
  columns,
  getRowClassName,
  getRowId,
  data,
  defaultColumnFilters = [],
  defaultColumnSorting = [],
  defaultRowSelection = {},
  defaultColumnVisibility = {},
  filterFields = [],
  tqlFields,
  searchKey,
  isFetching,
  isLoading,
  manualFiltering,
  fetchNextPage,
  hasNextPage,
  fetchPreviousPage,
  refetch,
  totalRows,
  filterRows,
  totalRowsFetched = 0,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  renderLiveRow,
  tableId = "infinite",
  commandSlot,
  sheetSlot,
  toolbarActions,
  chartSlot,
  footerSlot,
  floatingBarSlot,
  className,
}: DataTableInfiniteProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>(defaultColumnFilters);
  const [sorting, setSorting] =
    React.useState<SortingState>(defaultColumnSorting);
  const [rowSelection, setRowSelection] =
    React.useState<RowSelectionState>(defaultRowSelection);
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    getColumnOrderKey(tableId),
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(
      getColumnVisibilityKey(tableId),
      defaultColumnVisibility,
    );
  const topBarRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const [topBarHeight, setTopBarHeight] = React.useState(0);

  // Detect if a select column exists to enable multi-row selection
  const hasSelectColumn = React.useMemo(
    () => columns.some((col) => col.meta?.kind === "select"),
    [columns],
  );

  const onScroll = React.useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      const onPageBottom =
        Math.ceil(e.currentTarget.scrollTop + e.currentTarget.clientHeight) >=
        e.currentTarget.scrollHeight;

      if (onPageBottom && !isFetching && totalRowsFetched < (filterRows ?? 0)) {
        fetchNextPage();
      }
    },
    [fetchNextPage, isFetching, filterRows, totalRowsFetched],
  );

  React.useEffect(() => {
    const observer = new ResizeObserver(() => {
      const rect = topBarRef.current?.getBoundingClientRect();
      if (rect) {
        setTopBarHeight(rect.height);
      }
    });

    const topBar = topBarRef.current;
    if (!topBar) return;

    observer.observe(topBar);
    return () => observer.unobserve(topBar);
  }, [topBarRef]);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      sorting,
      columnVisibility,
      rowSelection,
      columnOrder,
    },
    enableMultiRowSelection: hasSelectColumn,
    manualFiltering,
    columnResizeMode: "onChange",
    getRowId,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValuesFlattened(),
    getFacetedMinMaxValues: getTTableFacetedMinMaxValues(),
    filterFns: { inDateRange, arrSome },
    debugAll: process.env.NEXT_PUBLIC_TABLE_DEBUG === "true",
    meta: { getRowClassName },
  });

  // Clear multi-select when filters or sorting change
  React.useEffect(() => {
    if (hasSelectColumn) {
      setRowSelection({});
    }
  }, [columnFilters, sorting, hasSelectColumn, setRowSelection]);

  // NOTE: Filter, sort, and selection syncing is now handled by DataTableStoreSync

  /**
   * https://tanstack.com/table/v8/docs/guide/column-sizing#advanced-column-resizing-performance
   * Instead of calling `column.getSize()` on every render for every header
   * and especially every data cell (very expensive),
   * we will calculate all column sizes at once at the root table level in a useMemo
   * and pass the column sizes down as CSS variables to the <table> element.
   */
  const columnSizeVars = React.useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: { [key: string]: string } = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      // REMINDER: replace "." with "-" to avoid invalid CSS variable name (e.g. "timing.dns" -> "timing-dns")
      colSizes[`--header-${header.id.replace(".", "-")}-size`] =
        `${header.getSize()}px`;
      colSizes[`--col-${header.column.id.replace(".", "-")}-size`] =
        `${header.column.getSize()}px`;
    }
    return colSizes;
  }, [
    table.getState().columnSizingInfo,
    table.getState().columnSizing,
    table.getState().columnVisibility,
  ]);

  useHotKey(() => {
    setColumnOrder([]);
    setColumnVisibility(defaultColumnVisibility);
  }, "u");

  // Memoize column state as strings for efficient row memoization comparison
  const visibleColumnIds = React.useMemo(
    () =>
      table
        .getVisibleLeafColumns()
        .map((c) => c.id)
        .join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.getState().columnVisibility],
  );
  const columnOrderString = React.useMemo(
    () => columnOrder.join(","),
    [columnOrder],
  );

  // Read BYOS uuid for detail row visual state (only used in multi-select mode)
  const detailRowId = useFilterState((s) => s.uuid) as
    | string
    | null
    | undefined;
  const { setFilters } = useFilterActions();

  // Stable callback for row clicks — lifted here so Row doesn't need useFilterActions
  const onRowClick = React.useCallback(
    (row: Row<TData>) => {
      if (hasSelectColumn) {
        setFilters({ uuid: detailRowId === row.id ? null : row.id });
      } else {
        row.toggleSelected();
      }
    },
    [hasSelectColumn, detailRowId, setFilters],
  );

  return (
    <DataTableProvider
      table={table}
      columns={columns}
      filterFields={filterFields}
      tqlFields={tqlFields}
      searchKey={searchKey}
      columnFilters={columnFilters}
      sorting={sorting}
      rowSelection={rowSelection}
      columnOrder={columnOrder}
      columnVisibility={columnVisibility}
      defaultColumnVisibility={defaultColumnVisibility}
      enableColumnOrdering={true}
      isLoading={isFetching || isLoading}
      totalRows={totalRows}
      filterRows={filterRows ?? table.getFilteredRowModel().rows.length}
      getFacetedUniqueValues={getFacetedUniqueValues}
      getFacetedMinMaxValues={getFacetedMinMaxValues}
    >
      <div
        className="flex h-full min-h-0 w-full flex-col"
        style={
          {
            "--top-bar-height": `${topBarHeight}px`,
            ...columnSizeVars,
          } as React.CSSProperties
        }
      >
        <div className="flex max-w-full min-h-0 flex-1 flex-col">
          <div
            ref={topBarRef}
            className={cn(
              "bg-background flex flex-col gap-4 px-4 pt-3",
              "sticky top-0 z-10 pb-3",
            )}
          >
            {commandSlot}
            {/* TBD: better flexibility with compound components? */}
            <DataTableToolbar
              renderActions={toolbarActions ? () => toolbarActions : undefined}
            />
            {chartSlot}
          </div>
          <div className="z-0 mx-4 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden">
            <Table
              ref={tableRef}
              onScroll={onScroll}
              // REMINDER: https://stackoverflow.com/questions/50361698/border-style-do-not-work-with-sticky-position-element
              className="border-separate border-spacing-0"
              containerClassName="h-full overflow-y-auto"
            >
              <TableHeader className={cn("bg-background sticky top-0 z-20")}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className={cn(
                      "bg-muted/40 hover:bg-muted/40",
                      "[&>:not(:last-child)]:border-r",
                    )}
                  >
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead
                          key={header.id}
                          style={
                            header.column.getCanResize()
                              ? {
                                  width: `var(--header-${header.id.replace(".", "-")}-size)`,
                                  minWidth: `var(--header-${header.id.replace(".", "-")}-size)`,
                                }
                              : header.column.columnDef.maxSize
                                ? {
                                    width: `var(--header-${header.id.replace(".", "-")}-size)`,
                                    minWidth: `var(--header-${header.id.replace(".", "-")}-size)`,
                                    maxWidth: `var(--header-${header.id.replace(".", "-")}-size)`,
                                  }
                                : undefined
                          }
                          className={cn(
                            "border-border relative h-9 truncate border-b px-1.5 text-xs text-muted-foreground select-none last:[&>.cursor-col-resize]:opacity-0",
                            header.column.columnDef.meta?.headerClassName,
                          )}
                          aria-sort={
                            header.column.getIsSorted() === "asc"
                              ? "ascending"
                              : header.column.getIsSorted() === "desc"
                                ? "descending"
                                : "none"
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                          {header.column.getCanResize() && (
                            <div
                              onDoubleClick={() => header.column.resetSize()}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className={cn(
                                "user-select-none absolute top-0 -right-2 z-10 flex h-full w-4 cursor-col-resize touch-none justify-center",
                                "before:bg-border before:absolute before:inset-y-0 before:w-px before:translate-x-px",
                              )}
                            />
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody
                id="content"
                tabIndex={-1}
                className="outline-primary outline-1 -outline-offset-1 transition-colors outline-none focus-visible:outline-solid"
                // REMINDER: avoids scroll (skipping the table header) when using skip to content
                style={{
                  scrollMarginTop: "calc(var(--top-bar-height) + 40px)",
                }}
              >
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    // REMINDER: if we want to add arrow navigation https://github.com/TanStack/table/discussions/2752#discussioncomment-192558
                    <React.Fragment key={row.id}>
                      {renderLiveRow?.({ row })}
                      <MemoizedRow
                        row={row}
                        table={table}
                        selected={row.getIsSelected()}
                        detailRowId={hasSelectColumn ? detailRowId : undefined}
                        onRowClick={onRowClick}
                        visibleColumnIds={visibleColumnIds}
                        columnOrder={columnOrderString}
                      />
                    </React.Fragment>
                  ))
                ) : (
                  <React.Fragment>
                    {renderLiveRow?.()}
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No results.
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                )}
                <TableRow className="hover:bg-transparent data-[state=selected]:bg-transparent">
                  <TableCell colSpan={columns.length} className="text-center">
                    {hasNextPage || isFetching || isLoading ? (
                      <Button
                        disabled={isFetching || isLoading}
                        onClick={() => fetchNextPage()}
                        variant="outline"
                      >
                        {isFetching ? (
                          <Loader2Icon className="mr-2 size-4" />
                        ) : null}
                        Load More
                      </Button>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        No more data to load (
                        <span className="font-mono font-medium">
                          {formatCompactNumber(filterRows ?? 0)}
                        </span>{" "}
                        of{" "}
                        <span className="font-mono font-medium">
                          {formatCompactNumber(totalRows ?? 0)}
                        </span>{" "}
                        rows)
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {footerSlot ? (
            <div className="border-border bg-background border-t p-4">
              {footerSlot}
            </div>
          ) : null}
        </div>
      </div>
      {sheetSlot}
      {floatingBarSlot}
    </DataTableProvider>
  );
}

/**
 * REMINDER: this is the heaviest component in the table if lots of rows
 * Some other components are rendered more often necessary, but are fixed size (not like rows that can grow in height)
 * e.g. DataTableFilterMenu, DataTableToolbar, DataTableHeader
 */

function Row<TData>({
  row,
  table,
  selected,
  detailRowId,
  onRowClick,
  visibleColumnIds,
  columnOrder,
}: {
  row: Row<TData>;
  table: TTable<TData>;
  // REMINDER: row.getIsSelected(); - just for memoization
  selected?: boolean;
  // When multi-select is enabled, the BYOS uuid for detail sheet (undefined = single-select mode)
  detailRowId?: string | null;
  onRowClick: (row: Row<TData>) => void;
  // REMINDER: for memoization - triggers re-render when columns change
  visibleColumnIds: string;
  columnOrder: string;
}) {
  // REMINDER: rerender the row when live mode is toggled - used to opacity the row
  // via the `getRowClassName` prop - but for some reasons it wil render the row on data fetch
  useFilterState((s) => s.live);

  const isMultiSelect = detailRowId !== undefined;
  const isDetail = isMultiSelect && detailRowId === row.id;

  const handleClick = React.useCallback(() => {
    onRowClick(row);
  }, [onRowClick, row]);

  return (
    <TableRow
      id={row.id}
      tabIndex={0}
      // Single-select: data-state="selected" for the selected row
      // Multi-select: data-detail + data-checked are independent (a row can be both)
      data-state={!isMultiSelect && selected ? "selected" : undefined}
      data-detail={isDetail ? "" : undefined}
      data-checked={isMultiSelect && selected ? "" : undefined}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "h-8 outline-primary focus-visible:bg-muted/50 outline-1 -outline-offset-1 transition-colors outline-none focus-visible:outline-solid",
        "data-[state=selected]:bg-accent/40 data-[state=selected]:outline-solid",
        "data-detail:outline-solid",
        "data-checked:bg-muted/50",
        table.options.meta?.getRowClassName?.(row),
      )}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          style={
            cell.column.getCanResize()
              ? {
                  width: `var(--col-${cell.column.id.replace(".", "-")}-size)`,
                  maxWidth: `var(--col-${cell.column.id.replace(".", "-")}-size)`,
                }
              : cell.column.columnDef.maxSize
                ? {
                    width: `var(--col-${cell.column.id.replace(".", "-")}-size)`,
                    minWidth: `var(--col-${cell.column.id.replace(".", "-")}-size)`,
                    maxWidth: `var(--col-${cell.column.id.replace(".", "-")}-size)`,
                  }
                : undefined
          }
          className={cn(
            "border-border truncate border-b px-1.5 py-1",
            cell.column.columnDef.meta?.cellClassName,
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

const MemoizedRow = React.memo(
  Row,
  (prev, next) =>
    prev.row.id === next.row.id &&
    // A row whose id survives a data swap can still carry new values — an
    // `/info` row gaining the fields its API list adds, say. Without this the
    // row renders its first payload forever.
    prev.row.original === next.row.original &&
    prev.selected === next.selected &&
    prev.detailRowId === next.detailRowId &&
    prev.onRowClick === next.onRowClick &&
    prev.visibleColumnIds === next.visibleColumnIds &&
    prev.columnOrder === next.columnOrder,
) as typeof Row;

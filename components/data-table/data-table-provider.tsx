import { DataTableFilterField } from "@/components/data-table/types";
import type { TqlField } from "@/lib/data-browse/tql";
import { ControlsProvider } from "@/components/data-table/controls";
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/react-table";
import { createContext, useContext, useMemo } from "react";
import { DataTableStoreSync } from "./data-table-store-sync";

// REMINDER: read about how to move controlled state out of the useReactTable hook
// https://github.com/TanStack/table/discussions/4005#discussioncomment-7303569

interface DataTableStateContextType {
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  rowSelection: RowSelectionState;
  columnOrder: string[];
  columnVisibility: VisibilityState;
  defaultColumnVisibility: VisibilityState;
  pagination: PaginationState;
  enableColumnOrdering: boolean;
}

interface DataTableBaseContextType<TData = unknown, TValue = unknown> {
  table: Table<TData>;
  filterFields: DataTableFilterField<TData>[];
  tqlFields?: TqlField[];
  searchKey?: string;
  columns: ColumnDef<TData, TValue>[];
  isLoading?: boolean;
  totalRows?: number;
  filterRows?: number;
  getFacetedUniqueValues?: (
    table: Table<TData>,
    columnId: string,
  ) => Map<string, number>;
  getFacetedMinMaxValues?: (
    table: Table<TData>,
    columnId: string,
  ) => undefined | [number, number];
}

interface DataTableContextType<TData = unknown, TValue = unknown>
  extends DataTableStateContextType,
    DataTableBaseContextType<TData, TValue> {}

export const DataTableContext = createContext<DataTableContextType<
  any,
  any
> | null>(null);

export function DataTableProvider<TData, TValue>({
  children,
  ...props
}: Partial<DataTableStateContextType> &
  DataTableBaseContextType<TData, TValue> & {
    children: React.ReactNode;
  }) {
  const value = useMemo(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    () => ({
      ...props,
      columnFilters: props.columnFilters ?? [],
      sorting: props.sorting ?? [],
      rowSelection: props.rowSelection ?? {},
      columnOrder: props.columnOrder ?? [],
      columnVisibility: props.columnVisibility ?? {},
      defaultColumnVisibility: props.defaultColumnVisibility ?? {},
      pagination: props.pagination ?? { pageIndex: 0, pageSize: 10 },
      enableColumnOrdering: props.enableColumnOrdering ?? false,
    }),
    [
      props.columnFilters,
      props.sorting,
      props.rowSelection,
      props.columnOrder,
      props.columnVisibility,
      props.defaultColumnVisibility,
      props.pagination,
      props.table,
      props.filterFields,
      props.tqlFields,
      props.searchKey,
      props.columns,
      props.enableColumnOrdering,
      props.isLoading,
      props.totalRows,
      props.filterRows,
      props.getFacetedUniqueValues,
      props.getFacetedMinMaxValues,
    ],
  );

  return (
    <DataTableContext.Provider value={value}>
      <ControlsProvider>
        <DataTableStoreSync />
        {children}
      </ControlsProvider>
    </DataTableContext.Provider>
  );
}

export function useDataTable<TData, TValue>() {
  const context = useContext(DataTableContext);

  if (!context) {
    throw new Error("useDataTable must be used within a DataTableProvider");
  }

  return context as DataTableContextType<TData, TValue>;
}

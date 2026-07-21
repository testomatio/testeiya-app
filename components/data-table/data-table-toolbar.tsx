"use client";

import { useEffect, useState } from "react";
import { useDataTable } from "@/components/data-table/data-table-provider";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useDebounce } from "@/hooks/use-debounce";
import { formatCompactNumber } from "@/lib/format";
import { SearchIcon, XIcon } from "@/lib/icons";
import { DataTableFilterMenu } from "./data-table-filter-menu";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTableToolbarProps {
  renderActions?: () => React.ReactNode;
}

export function DataTableToolbar({ renderActions }: DataTableToolbarProps) {
  const { table, totalRows, filterRows, searchKey, filterFields } =
    useDataTable();
  const rows = {
    total: totalRows ?? table.getCoreRowModel().rows.length,
    filtered: filterRows ?? table.getFilteredRowModel().rows.length,
  };
  // The builder now serialises into the `tql` param, so `columnFilters` is no
  // longer a reliable "is anything filtered" signal — compare the counts.
  const isFiltered = rows.filtered !== rows.total;

  // A table whose only filterable field is the one the search box already
  // drives has nothing to put in the builder, and a single column has nothing
  // to show or hide — both controls would open onto one dead option.
  const canFilter = filterFields.some((field) => field.value !== searchKey);
  const hideableColumns = table
    .getAllColumns()
    .filter((column) => column.accessorFn && column.getCanHide());

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {searchKey ? <DataTableSearch searchKey={searchKey} /> : null}
        {isFiltered ? (
          <>
            <p className="text-muted-foreground hidden text-sm sm:block">
              <span className="font-mono font-medium">
                {formatCompactNumber(rows.filtered)}
              </span>{" "}
              of{" "}
              <span className="font-mono font-medium">
                {formatCompactNumber(rows.total)}
              </span>{" "}
              row(s) filtered
            </p>
            <p className="text-muted-foreground block text-sm sm:hidden">
              <span className="font-mono font-medium">
                {formatCompactNumber(rows.filtered)}
              </span>{" "}
              row(s)
            </p>
          </>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {renderActions?.()}
        {canFilter ? <DataTableFilterMenu /> : null}
        {hideableColumns.length > 1 ? <DataTableViewOptions /> : null}
      </div>
    </div>
  );
}

function DataTableSearch({ searchKey }: { searchKey: string }) {
  const { table, columnFilters } = useDataTable();
  const column = table.getColumn(searchKey);
  const applied = columnFilters.find((item) => item.id === searchKey)?.value;
  let current = "";
  if (typeof applied === "string") current = applied;

  const [input, setInput] = useState(current);
  const debounced = useDebounce(input, 400);

  useEffect(() => {
    column?.setFilterValue(debounced.trim() || null);
  }, [debounced]);

  // Reflect an external reset (Clear all) without fighting the debounce.
  useEffect(() => {
    if (debounced.trim() === current) return;
    setInput(current);
  }, [current]);

  return (
    <InputGroup size="sm" className="w-52">
      <InputGroupAddon>
        <SearchIcon className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Search…"
        aria-label="Search"
      />
      {input ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="Clear search"
            onClick={() => setInput("")}
          >
            <XIcon className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

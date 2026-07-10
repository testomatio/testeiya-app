"use client";

import { useDataTable } from "@/components/data-table/data-table-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotKey } from "@/hooks/use-hot-key";
import { formatCompactNumber } from "@/lib/format";
import { useControls } from "@/components/data-table/controls";
import { cn } from "@/lib/utils";
import { FilterIcon } from "@/lib/icons";
import { DataTableFilterControlsDrawer } from "./data-table-filter-controls-drawer";
import { DataTableResetButton } from "./data-table-reset-button";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTableToolbarProps {
  renderActions?: () => React.ReactNode;
}

export function DataTableToolbar({ renderActions }: DataTableToolbarProps) {
  const { table, columnFilters, totalRows, filterRows } = useDataTable();
  const { open, setOpen } = useControls();
  useHotKey(() => setOpen((prev) => !prev), "b");
  const rows = {
    total: totalRows ?? table.getCoreRowModel().rows.length,
    filtered: filterRows ?? table.getFilteredRowModel().rows.length,
  };

  return (
    <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" onClick={() => setOpen((prev) => !prev)} className={cn("hidden gap-2 sm:flex", columnFilters.length && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")} />}>
            <FilterIcon className="size-4" />
            <span className="hidden md:block">
              {open ? "Hide Filters" : "Show Filters"}
            </span>
            {columnFilters.length ? (
              <Badge variant="default" className="h-5 min-w-5 rounded-full px-1 tabular-nums">
                {columnFilters.length}
              </Badge>
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-nowrap">
              Toggle filters with{" "}
              <Kbd className="text-muted-foreground group-hover:text-accent-foreground ml-1">
                <span className="mr-1">⌘</span>
                <span>B</span>
              </Kbd>
            </p>
          </TooltipContent>
        </Tooltip>
        <div className="block sm:hidden">
          <DataTableFilterControlsDrawer />
        </div>
        {columnFilters.length ? (
          <div className="flex items-center gap-2">
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
            <DataTableResetButton />
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {renderActions?.()}
        <DataTableViewOptions />
      </div>
    </div>
  );
}

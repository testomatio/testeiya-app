"use client";

import { useDataTable } from "@/components/data-table/data-table-provider";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotKey } from "@/hooks/use-hot-key";

export function DataTableResetButton() {
  const { table } = useDataTable();
  useHotKey(table.resetColumnFilters, "Escape");

  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" onClick={() => table.resetColumnFilters()} />}>Reset
                      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-nowrap">
          Reset filters with{" "}
          <Kbd className="text-muted-foreground group-hover:text-accent-foreground ml-1">
            <span className="mr-1">⌘</span>
            <span>Esc</span>
          </Kbd>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

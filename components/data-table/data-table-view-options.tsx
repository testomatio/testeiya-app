"use client";

import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/data-table/sortable";
import { useDataTable } from "@/components/data-table/data-table-provider";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CheckIcon, GripVerticalIcon, Settings2Icon } from "@/lib/icons";
import { useMemo, useState } from "react";

export function DataTableViewOptions() {
  const { table, enableColumnOrdering, defaultColumnVisibility } =
    useDataTable();
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [search, setSearch] = useState("");

  const columnOrder = table.getState().columnOrder;

  const sortedColumns = useMemo(
    () =>
      [...table.getAllColumns()].sort((a, b) => {
        return columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id);
      }),
    [columnOrder, table],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="icon-sm" role="combobox" aria-expanded={open} className="shadow-none" />}><Settings2Icon className="size-4" /><span className="sr-only">View</span></PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[200px] p-0">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search options..."
          />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup className="p-0.5">
              <Sortable
                value={sortedColumns.map((c) => ({ id: c.id }))}
                onValueChange={(items) =>
                  table.setColumnOrder(items.map((c) => c.id))
                }
                overlay={<div className="bg-muted/60 h-8 w-full rounded-md" />}
                onDragStart={() => setDrag(true)}
                onDragEnd={() => setDrag(false)}
                onDragCancel={() => setDrag(false)}
              >
                {sortedColumns
                  .filter(
                    (column) =>
                      typeof column.accessorFn !== "undefined" &&
                      column.getCanHide(),
                  )
                  .map((column) => (
                    <SortableItem key={column.id} value={column.id} render={<CommandItem value={column.id} onSelect={() =>
                                                column.toggleVisibility(!column.getIsVisible())
                                              } className={cn("capitalize", enableColumnOrdering && !search ? "pr-7" : "pr-1")} disabled={drag} />}><div
                                                className={cn(
                                                  "border-foreground! flex h-4 w-4 items-center justify-center rounded-sm border",
                                                  column.getIsVisible()
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible",
                                                )}
                                              >
                                                <CheckIcon className={cn("text-background size-3")} />
                                              </div><span>{column.columnDef.meta?.label || column.id}</span><span data-slot="command-shortcut" className="hidden" />{enableColumnOrdering && !search ? (
                                                <SortableDragHandle
                                                  variant="ghost"
                                                  size="icon"
                                                  className="text-muted-foreground hover:text-foreground focus:bg-muted focus:text-foreground absolute top-1/2 right-1 size-5 -translate-y-1/2"
                                                >
                                                  <GripVerticalIcon
                                                    className="size-4"
                                                    aria-hidden="true"
                                                  />
                                                </SortableDragHandle>
                                              ) : null}</SortableItem>
                  ))}
              </Sortable>
            </CommandGroup>
          </CommandList>
          <div className="border-border border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground w-full justify-center"
              onClick={() => {
                table.setColumnVisibility(defaultColumnVisibility);
                table.setColumnOrder([]);
                table.resetColumnSizing();
              }}
            >
              Reset to default
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

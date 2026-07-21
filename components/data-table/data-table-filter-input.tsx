"use client";

import { useDataTable } from "@/components/data-table/data-table-provider";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type {
  ControlledFilterProps,
  DataTableInputFilterField,
} from "./types";

function getFilter(filterValue: unknown) {
  return typeof filterValue === "string" ? filterValue : null;
}

export function DataTableFilterInput<TData>({
  value: _value,
  label,
  filterValue: controlledValue,
  onFilterChange,
  placeholder = "Search",
  className,
}: DataTableInputFilterField<TData> &
  ControlledFilterProps & { placeholder?: string; className?: string }) {
  const value = _value as string;
  const { table, columnFilters } = useDataTable();
  const column = table.getColumn(value);
  let filterValue = controlledValue;
  if (!onFilterChange) {
    filterValue = columnFilters.find((i) => i.id === value)?.value;
  }
  const filters = getFilter(filterValue);
  const [input, setInput] = useState<string | null>(filters);

  const debouncedInput = useDebounce(input, 500);

  useEffect(() => {
    const newValue = debouncedInput?.trim() === "" ? null : debouncedInput;
    if (debouncedInput === null) return;
    if (onFilterChange) {
      onFilterChange(newValue);
      return;
    }
    column?.setFilterValue(newValue);
  }, [debouncedInput]);

  useEffect(() => {
    if (debouncedInput?.trim() !== filters) {
      setInput(filters);
    }
  }, [filters]);

  return (
    <InputGroup className={cn("h-9 rounded-lg shadow-none", className)}>
      <InputGroupInput
        placeholder={placeholder}
        aria-label={label ?? value}
        name={value}
        id={value}
        value={input || ""}
        onChange={(e) => setInput(e.target.value)}
      />
    </InputGroup>
  );
}

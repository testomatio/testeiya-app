"use client";

import { DatePickerWithRange } from "@/components/data-table/date-picker-with-range";
import { useDataTable } from "@/components/data-table/data-table-provider";
import { isArrayOfDates } from "@/lib/is-array";
import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import type {
  ControlledFilterProps,
  DataTableTimerangeFilterField,
} from "./types";

export function DataTableFilterTimerange<TData>({
  value: _value,
  presets,
  filterValue: controlledValue,
  onFilterChange,
}: DataTableTimerangeFilterField<TData> & ControlledFilterProps) {
  const value = _value as string;
  const { table, columnFilters } = useDataTable();
  const column = table.getColumn(value);
  let filterValue = controlledValue;
  if (!onFilterChange) {
    filterValue = columnFilters.find((i) => i.id === value)?.value;
  }

  const date: DateRange | undefined = useMemo(
    () =>
      filterValue instanceof Date
        ? { from: filterValue, to: undefined }
        : Array.isArray(filterValue) && isArrayOfDates(filterValue)
          ? { from: filterValue?.[0], to: filterValue?.[1] }
          : undefined,
    [filterValue],
  );

  const apply = (next: unknown) => {
    if (onFilterChange) {
      onFilterChange(next);
      return;
    }
    column?.setFilterValue(next);
  };

  const setDate = (date: DateRange | undefined) => {
    if (!date) {
      apply(undefined);
      return;
    }
    if (date.from && !date.to) {
      apply([date.from]);
    }
    if (date.to && date.from) {
      apply([date.from, date.to]);
    }
  };

  return <DatePickerWithRange {...{ date, setDate, presets }} />;
}

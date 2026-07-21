"use client";

import { useDataTable } from "@/components/data-table/data-table-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SearchIcon } from "@/lib/icons";
import { useState } from "react";
import type {
  ControlledFilterProps,
  DataTableCheckboxFilterField,
  Option,
} from "./types";

export function DataTableFilterCheckbox<TData>({
  value: _value,
  options,
  component,
  filterValue: controlledValue,
  onFilterChange,
}: DataTableCheckboxFilterField<TData> & ControlledFilterProps) {
  const value = _value as string;
  const [inputValue, setInputValue] = useState("");
  const { table, columnFilters, isLoading, getFacetedUniqueValues } =
    useDataTable();
  const column = table.getColumn(value);
  // REMINDER: avoid using column?.getFilterValue()
  let filterValue = controlledValue;
  if (!onFilterChange) {
    filterValue = columnFilters.find((i) => i.id === value)?.value;
  }

  function setFilterValue(next: unknown) {
    if (onFilterChange) {
      onFilterChange(next);
      return;
    }
    column?.setFilterValue(next);
  }
  const facetedValue =
    getFacetedUniqueValues?.(table, value) || column?.getFacetedUniqueValues();

  const Component = component;

  // CHECK: it could be filterValue or searchValue
  const filters = filterValue
    ? Array.isArray(filterValue)
      ? filterValue
      : [filterValue]
    : [];

  // Some fields (tags, environments) only have a directory in the project's
  // `/info`, which is not always available. The rows already fetched are then
  // the one remaining source — but they cover just the loaded pages, so the
  // list is flagged as partial instead of passing for the complete set.
  const rowOptions = rowDerivedOptions(facetedValue);
  let available = options ?? [];
  if (!available.length) available = rowOptions;
  const fromRows = !options?.length && rowOptions.length > 0;
  // A row-derived list shrinks to the rows the filter itself left behind, so a
  // chosen value can drop out of its own list. Keep it listed or there is no
  // way to switch it off again.
  available = withSelected(available, filters);

  // filter out the options based on the input value
  const filterOptions = available.filter(
    (option) =>
      inputValue === "" ||
      option.label.toLowerCase().includes(inputValue.toLowerCase()),
  );

  // REMINDER: if no options are defined, while fetching data, we should show a skeleton
  if (isLoading && !filterOptions?.length)
    return (
      <div className="border-border grid divide-y rounded-lg border">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-2 px-2 py-2.5"
          >
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-4 w-full rounded-sm" />
          </div>
        ))}
      </div>
    );

  return (
    <div className="grid gap-2">
      {available.length > 4 ? (
        <InputGroup className="h-9 rounded-lg shadow-none">
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </InputGroup>
      ) : null}
      {fromRows ? (
        <p className="text-muted-foreground px-0.5 text-xs">
          From loaded rows — may be incomplete
        </p>
      ) : null}
      {filterOptions?.length ? null : (
        <div className="px-3 py-6 text-center">
          <p className="text-sm font-medium">
            {inputValue ? "No matches" : "Nothing to filter by"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {inputValue
              ? `No option matches “${inputValue}”.`
              : "This project has no values for this field yet."}
          </p>
        </div>
      )}
      {/* FIXME: due to the added max-h and overflow-y-auto, the hover state and border is laying on top of the scroll bar */}
      <div className="border-border max-h-[200px] overflow-y-auto rounded-lg border empty:border-none">
        {filterOptions
          // TODO: we shoudn't sort the options here, instead filterOptions should be sorted by default
          // .sort((a, b) => a.label.localeCompare(b.label))
          ?.map((option, index) => {
            const checked = filters.includes(option.value);

            return (
              <div
                key={String(option.value)}
                className={cn(
                  "group hover:bg-accent/50 relative flex items-center space-x-2 px-2 py-2.5",
                  index !== filterOptions.length - 1 ? "border-b" : undefined,
                )}
              >
                <Checkbox
                  id={`${value}-${option.value}`}
                  checked={checked}
                  onCheckedChange={(checked) => {
                    const newValue = checked
                      ? [...(filters || []), option.value]
                      : filters?.filter((value) => option.value !== value);
                    setFilterValue(newValue?.length ? newValue : undefined);
                  }}
                  className="border-foreground! shadow-none"
                />
                <Label
                  htmlFor={`${value}-${option.value}`}
                  className="text-foreground/70 group-hover:text-accent-foreground flex w-full items-center justify-center gap-1 truncate"
                >
                  {Component ? (
                    <Component {...option} />
                  ) : (
                    <span className="truncate font-normal">{option.label}</span>
                  )}
                  <span className="ml-auto flex items-center justify-center font-mono text-xs">
                    {isLoading ? (
                      <Skeleton className="h-4 w-4" />
                    ) : facetedValue?.has(option.value) ? (
                      formatCompactNumber(facetedValue.get(option.value) || 0)
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setFilterValue([option.value])}
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 hidden h-auto rounded-md px-2 font-normal backdrop-blur-xs group-hover:inline-flex"
                  >
                    only
                  </Button>
                </Label>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function withSelected(options: Option[], selected: unknown[]): Option[] {
  const known = new Set(options.map((option) => String(option.value)));
  const extra: Option[] = [];
  for (const item of selected) {
    if (item === undefined || item === null || item === "") continue;
    if (typeof item === "object") continue;
    if (known.has(String(item))) continue;
    extra.push({ label: String(item), value: item as string });
  }
  if (!extra.length) return options;
  return [...options, ...extra];
}

function rowDerivedOptions(faceted: Map<unknown, number> | undefined): Option[] {
  if (!faceted?.size) return [];
  const result: Option[] = [];
  for (const key of faceted.keys()) {
    // Rows carry rich objects for some columns (labels are `{title, id, …}`),
    // which cannot stand in for a filter value.
    if (typeof key === "object") continue;
    if (key === undefined || key === null || key === "") continue;
    result.push({ label: String(key), value: key as string });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label));
}

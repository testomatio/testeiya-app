"use client";

import * as React from "react";
import { DataTableFilterCheckbox } from "./data-table-filter-checkbox";
import { DataTableFilterInput } from "./data-table-filter-input";
import { DataTableFilterSlider } from "./data-table-filter-slider";
import { DataTableFilterTimerange } from "./data-table-filter-timerange";

// Pluggable filter registry — extend by adding entries
export const FILTER_COMPONENTS: Record<string, React.ComponentType<any>> = {
  checkbox: DataTableFilterCheckbox,
  input: DataTableFilterInput,
  slider: DataTableFilterSlider,
  timerange: DataTableFilterTimerange,
};

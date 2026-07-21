"use client";

import { useMemo } from "react";
import {
  generateColumns,
  generateFilterFields,
  generateFilterSchema,
  getDefaultColumnVisibility,
} from "@/lib/table-schema";
import { field } from "@/lib/store/schema";
import { useMemoryAdapter } from "@/lib/store/adapters/memory";
import { DataTableStoreProvider } from "@/components/data-table/data-table-store-provider";
import { DataTableInfinite } from "@/components/data-table/data-table-infinite";
import { useFilterState } from "@/lib/store/hooks/useFilterState";
import { generateTqlFields } from "@/lib/data-browse/tql-fields";
import {
  buildFeatureRows,
  buildFeaturesSchema,
  filterInfoRows,
  type FeatureRow,
} from "@/lib/data-browse/schemas/project-info";

const NOOP_NEXT = async () => {};
const NOOP_REFETCH = () => {};
const ROW_NOT_CLICKABLE = () => "cursor-default";

/**
 * The project's enabled features as a browse table. `/info` returns them as a
 * flat list of slugs — all enabled, no grouping — so the rows are built once
 * and the search input filters them locally.
 */
export function FeaturesTable({ features }: { features: string[] }) {
  const built = useMemo(() => buildFeaturesSchema(), []);
  const definition = built.tableSchema.definition;

  const columns = useMemo(
    () => generateColumns<FeatureRow>(definition),
    [definition],
  );
  const filterFields = useMemo(
    () => generateFilterFields<FeatureRow>(definition),
    [definition],
  );
  const tqlFields = useMemo(() => generateTqlFields(definition), [definition]);
  const filterSchema = useMemo(
    () => generateFilterSchema(definition, { sort: field.sort() }),
    [definition],
  );
  const defaultColumnVisibility = useMemo(
    () => getDefaultColumnVisibility(definition),
    [definition],
  );
  const adapter = useMemoryAdapter(filterSchema.definition, {
    id: "browse-features",
  });

  return (
    <DataTableStoreProvider adapter={adapter}>
      <FeaturesTableInner
        features={features}
        columns={columns}
        filterFields={filterFields}
        tqlFields={tqlFields}
        defaultColumnVisibility={defaultColumnVisibility}
      />
    </DataTableStoreProvider>
  );
}

function FeaturesTableInner({
  features,
  columns,
  filterFields,
  tqlFields,
  defaultColumnVisibility,
}: {
  features: string[];
  columns: ReturnType<typeof generateColumns<FeatureRow>>;
  filterFields: ReturnType<typeof generateFilterFields<FeatureRow>>;
  tqlFields: ReturnType<typeof generateTqlFields>;
  defaultColumnVisibility: Record<string, boolean>;
}) {
  const name = useFilterState((s) => s.name);
  const allRows = useMemo(() => buildFeatureRows(features), [features]);
  const rows = useMemo(
    () => filterInfoRows(allRows, name, "name"),
    [allRows, name],
  );

  return (
    <DataTableInfinite
      data={rows}
      columns={columns}
      filterFields={filterFields}
      tqlFields={tqlFields}
      searchKey="name"
      manualFiltering
      getRowId={(row) => row.id}
      defaultColumnVisibility={defaultColumnVisibility}
      totalRows={allRows.length}
      filterRows={rows.length}
      totalRowsFetched={rows.length}
      isLoading={false}
      isFetching={false}
      hasNextPage={false}
      fetchNextPage={NOOP_NEXT}
      refetch={NOOP_REFETCH}
      tableId="browse-features"
      getRowClassName={ROW_NOT_CLICKABLE}
    />
  );
}

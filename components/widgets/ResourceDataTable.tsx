"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  generateColumns,
  generateFilterFields,
  generateFilterSchema,
  getDefaultColumnVisibility,
  type TableSchemaDefinition,
} from "@/lib/table-schema";
import type { DataTableFilterField } from "@/components/data-table/types";
import { field } from "@/lib/store/schema";
import { useMemoryAdapter } from "@/lib/store/adapters/memory";
import { DataTableStoreProvider } from "@/lib/store/provider/DataTableStoreProvider";
import { useFilterState } from "@/lib/store/hooks/useFilterState";
import { useFilterActions } from "@/lib/store/hooks/useFilterActions";
import { DataTableInfinite } from "@/components/data-table/data-table-infinite";
import { buildParams, type FilterMap } from "@/lib/data-browse/params";
import { useTableRows } from "@/lib/data-browse/use-table-rows";
import {
  useProjectFilterOptions,
  useRungroupOptions,
  useSuiteOptions,
} from "@/lib/data-browse/use-filter-options";
import { buildRunsSchema } from "@/lib/data-browse/schemas/runs";
import { buildTestsSchema } from "@/lib/data-browse/schemas/tests";
import { buildTestrunsSchema } from "@/lib/data-browse/schemas/testruns";
import { buildPlansSchema } from "@/lib/data-browse/schemas/plans";
import { buildRequirementsSchema } from "@/lib/data-browse/schemas/requirements";
import type { ProjectResource } from "@/lib/services/project-service";
import { openExternalUrl } from "@/lib/testomatio-url";
import { Button } from "@/components/ui/button";
import { ExternalLinkIcon } from "@/lib/icons";
import { PreviewPane } from "./preview-pane";
import RunItemRenderer from "./items/RunItemRenderer";
import TestItemRenderer from "./items/TestItemRenderer";
import TestRunItemRenderer from "./items/TestRunItemRenderer";
import PlanItemRenderer from "./items/PlanItemRenderer";

type RowData = Record<string, unknown>;

interface BuiltSchema {
  tableSchema: { definition: TableSchemaDefinition };
  filterMap: FilterMap;
  baseParams: Record<string, string>;
}

export function ResourceDataTable({ resource }: { resource: ProjectResource }) {
  const built = useBrowseSchema(resource);
  const definition = built.tableSchema.definition;

  const columns = useMemo(
    () => generateColumns<RowData>(definition),
    [definition],
  );
  const filterFields = useMemo(
    () => generateFilterFields<RowData>(definition),
    [definition],
  );
  const filterSchema = useMemo(
    () =>
      generateFilterSchema(definition, {
        sort: field.sort(),
        uuid: field.string(),
      }),
    [definition],
  );
  const defaultColumnVisibility = useMemo(
    () => getDefaultColumnVisibility(definition),
    [definition],
  );
  const adapter = useMemoryAdapter(filterSchema.definition, {
    id: `browse-${resource}`,
  });

  return (
    <DataTableStoreProvider adapter={adapter}>
      <ResourceTableInner
        resource={resource}
        columns={columns}
        filterFields={filterFields}
        defaultColumnVisibility={defaultColumnVisibility}
        filterMap={built.filterMap}
        baseParams={built.baseParams}
      />
    </DataTableStoreProvider>
  );
}

function useBrowseSchema(resource: ProjectResource): BuiltSchema {
  const project = useProjectFilterOptions();
  const rungroups = useRungroupOptions(
    resource === "runs" || resource === "testruns",
  );
  const suites = useSuiteOptions(resource === "tests");

  return useMemo(() => {
    if (resource === "tests") {
      return buildTestsSchema({
        labels: project.labels,
        tags: project.tags,
        suites,
      });
    }
    if (resource === "testruns") {
      return buildTestrunsSchema({
        environments: project.environments,
        labels: project.labels,
        tags: project.tags,
        rungroups,
      });
    }
    if (resource === "plans") {
      return buildPlansSchema({ labels: project.labels });
    }
    if (resource === "requirements") {
      return buildRequirementsSchema();
    }
    return buildRunsSchema({
      environments: project.environments,
      labels: project.labels,
      rungroups,
    });
  }, [resource, project, rungroups, suites]);
}

function ResourceTableInner({
  resource,
  columns,
  filterFields,
  defaultColumnVisibility,
  filterMap,
  baseParams,
}: {
  resource: ProjectResource;
  columns: ColumnDef<RowData>[];
  filterFields: DataTableFilterField<RowData>[];
  defaultColumnVisibility: Record<string, boolean>;
  filterMap: FilterMap;
  baseParams: Record<string, string>;
}) {
  const state = useFilterState<Record<string, unknown>>((s) => s);
  const { setFilters } = useFilterActions();

  const params = useMemo(
    () => ({ ...baseParams, ...buildParams(state, filterMap) }),
    [state, filterMap, baseParams],
  );

  const uuid = typeof state.uuid === "string" ? state.uuid : null;
  const rows = useTableRows<RowData>(resource, params);
  const selected = uuid ? rows.rows.find((r) => String(r.id) === uuid) : null;

  if (selected) {
    return (
      <PreviewPane
        title={detailTitle(selected)}
        onBack={() => setFilters({ uuid: null })}
      >
        {renderDetail(resource, selected)}
      </PreviewPane>
    );
  }

  return (
    <DataTableInfinite
      data={rows.rows}
      columns={columns}
      filterFields={filterFields}
      manualFiltering
      getRowId={(r) => String(r.id)}
      defaultColumnVisibility={defaultColumnVisibility}
      totalRows={rows.totalRows}
      filterRows={rows.filterRows}
      totalRowsFetched={rows.totalRowsFetched}
      isLoading={rows.isLoading}
      isFetching={rows.isFetching}
      hasNextPage={rows.hasNextPage}
      fetchNextPage={rows.fetchNextPage}
      refetch={rows.refetch}
      tableId={`browse-${resource}`}
    />
  );
}

function renderDetail(resource: ProjectResource, row: RowData) {
  if (resource === "tests") return <TestItemRenderer data={row} />;
  if (resource === "testruns") return <TestRunItemRenderer data={row} />;
  if (resource === "plans") return <PlanItemRenderer data={row} />;
  if (resource === "requirements") return <RequirementDetail req={row} />;
  return <RunItemRenderer data={row} />;
}

function detailTitle(row: RowData): string {
  return String(
    row.title ??
      row.clean_title ??
      row.test_title ??
      row.summary ??
      row.name ??
      row.id ??
      "Item",
  );
}

function RequirementDetail({ req }: { req: RowData }) {
  const url = (req.url ?? req.link) as string | undefined;
  const source = req.source as string | undefined;
  const status = (req.status ?? req.state) as string | undefined;
  return (
    <div className="space-y-3 p-1 text-sm">
      {source ? (
        <div className="text-muted-foreground">
          Source: <span className="text-foreground">{source}</span>
        </div>
      ) : null}
      {status ? (
        <div className="text-muted-foreground">
          Status: <span className="text-foreground capitalize">{status}</span>
        </div>
      ) : null}
      {url ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => void openExternalUrl(url)}
        >
          <ExternalLinkIcon className="size-3.5" />
          Open in Testomat.io
        </Button>
      ) : null}
    </div>
  );
}

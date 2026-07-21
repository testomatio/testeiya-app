"use client";

import { useCallback, useMemo } from "react";
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
import { DataTableStoreProvider } from "@/components/data-table/data-table-store-provider";
import { useFilterState } from "@/lib/store/hooks/useFilterState";
import { useFilterActions } from "@/lib/store/hooks/useFilterActions";
import { DataTableInfinite } from "@/components/data-table/data-table-infinite";
import { buildParams, type FilterMap } from "@/lib/data-browse/params";
import { generateTqlFields } from "@/lib/data-browse/tql-fields";
import type { TqlField } from "@/lib/data-browse/tql";
import { useTableRows } from "@/lib/data-browse/use-table-rows";
import { INFO_RESOURCES, useInfoTableRows } from "@/lib/data-browse/info-rows";
import {
  buildEnvironmentsSchema,
  buildLabelsSchema,
  buildTagsSchema,
} from "@/lib/data-browse/schemas/project-info";
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
import {
  buildCiProfilesSchema,
  configEntries,
  passedEnvVars,
  type CiProfileRow,
} from "@/lib/data-browse/schemas/ci-profiles";
import { MetaPill } from "./status-pill";
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

const HAS_DETAIL = new Set<ProjectResource>([
  "tests",
  "runs",
  "testruns",
  "plans",
  "requirements",
  "ci",
]);

interface BuiltSchema {
  tableSchema: { definition: TableSchemaDefinition };
  filterMap: FilterMap;
  baseParams: Record<string, string>;
}

export function ResourceDataTable({
  resource,
  api,
}: {
  resource: ProjectResource;
  api: string;
}) {
  // Filter state lives in a ref inside the memory adapter, which survives a
  // prop change — remounting per resource stops one table's query from
  // riding along into the next table's request.
  return <ResourceTable key={resource} resource={resource} api={api} />;
}

function ResourceTable({
  resource,
  api,
}: {
  resource: ProjectResource;
  api: string;
}) {
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
  const tqlFields = useMemo(() => generateTqlFields(definition), [definition]);
  const filterSchema = useMemo(
    () =>
      generateFilterSchema(definition, {
        sort: field.sort(),
        uuid: field.string(),
        q: field.string(),
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
        api={api}
        columns={columns}
        filterFields={filterFields}
        tqlFields={tqlFields}
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
    if (resource === "ci") {
      return buildCiProfilesSchema();
    }
    if (resource === "labels") {
      return buildLabelsSchema();
    }
    if (resource === "tags") {
      return buildTagsSchema();
    }
    if (resource === "environments") {
      return buildEnvironmentsSchema();
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
  api,
  columns,
  filterFields,
  tqlFields,
  defaultColumnVisibility,
  filterMap,
  baseParams,
}: {
  resource: ProjectResource;
  api: string;
  columns: ColumnDef<RowData>[];
  filterFields: DataTableFilterField<RowData>[];
  tqlFields: TqlField[];
  defaultColumnVisibility: Record<string, boolean>;
  filterMap: FilterMap;
  baseParams: Record<string, string>;
}) {
  const state = useFilterState<Record<string, unknown>>((s) => s);
  const { setFilters } = useFilterActions();

  // The toolbar search drives the resource's own text-search param, which the
  // backend ANDs with `tql` — so it stays native even when the same field is
  // also a TQL field.
  const searchKey = useMemo(
    () =>
      Object.keys(filterMap).find((key) => filterMap[key].kind === "search"),
    [filterMap],
  );
  // Fields the builder serialises into the `tql` param must not also be sent
  // as native `filter[...]` params, or the backend filters them twice.
  const tqlKeys = useMemo(
    () => tqlFields.map((f) => f.key).filter((key) => key !== searchKey),
    [tqlFields, searchKey],
  );
  const params = useMemo(
    () => ({ ...baseParams, ...buildParams(state, filterMap, { skip: tqlKeys }) }),
    [state, filterMap, baseParams, tqlKeys],
  );

  const uuid = typeof state.uuid === "string" ? state.uuid : null;
  // Some resources are backed by the already-loaded `/info` object, not a
  // paged API list — their rows come from the store, filtered locally.
  const isInfo = INFO_RESOURCES.includes(resource);
  const apiRows = useTableRows<RowData>(api, params, { skip: isInfo });
  const infoRows = useInfoTableRows(resource, state);
  const rows = isInfo ? infoRows : apiRows;
  // A label / tag / environment is the whole record — there is nothing left to
  // open, so those rows never swap the table for a detail pane.
  const selectable = HAS_DETAIL.has(resource);
  const selected =
    uuid && selectable ? rows.rows.find((r) => String(r.id) === uuid) : null;
  // Only a row that opens a detail pane gets the affordance.
  const getRowClassName = useCallback(() => {
    if (!selectable) return "cursor-default";
    return "cursor-pointer";
  }, [selectable]);

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
      tqlFields={tqlFields}
      searchKey={searchKey}
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
      getRowClassName={getRowClassName}
    />
  );
}

function renderDetail(resource: ProjectResource, row: RowData) {
  if (resource === "tests") return <TestItemRenderer data={row} />;
  if (resource === "testruns") return <TestRunItemRenderer data={row} />;
  if (resource === "plans") return <PlanItemRenderer data={row} />;
  if (resource === "requirements") return <RequirementDetail req={row} />;
  if (resource === "ci") return <CiProfileDetail row={row as unknown as CiProfileRow} />;
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

function CiProfileDetail({ row }: { row: CiProfileRow }) {
  const entries = configEntries(row.profile);
  const vars = passedEnvVars(row.profile);
  return (
    <div className="space-y-3 p-1 text-sm">
      {row.profile.service ? (
        <div className="text-muted-foreground">
          Service: <MetaPill className="capitalize">{row.profile.service}</MetaPill>
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div className="space-y-1">
          <div className="text-muted-foreground">Config</div>
          <div className="space-y-0.5 rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2">
                <span className="text-muted-foreground">{key}</span>
                <span className="min-w-0 break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="text-muted-foreground">
        Passes to CI:{" "}
        {vars.length > 0 ? (
          vars.map((v) => (
            <MetaPill key={v} className="mr-1 font-mono">
              {v}
            </MetaPill>
          ))
        ) : (
          <span>none</span>
        )}
      </div>
    </div>
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

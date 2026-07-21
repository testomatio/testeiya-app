"use client";

import { useEffect, useMemo, useState } from "react";
import { reaction } from "mobx";
import { useStores } from "@/lib/services/StoreProvider";
import { useTestomatio } from "@/lib/agent-output/use-testomatio";
import type { ProjectResource } from "@/lib/services/project-service";
import type { TableRowsResult } from "./use-table-rows";
import {
  buildCiProfileRows,
  filterCiProfileRows,
  type CiProfileRow,
} from "./schemas/ci-profiles";
import {
  buildEnvironmentRows,
  buildLabelRows,
  buildTagRows,
  filterInfoRows,
  type ProjectLabel,
} from "./schemas/project-info";

const NOOP_NEXT = async () => {};

/** Resources whose rows come from `/info` instead of a paged list endpoint. */
export const INFO_RESOURCES: ProjectResource[] = [
  "ci",
  "labels",
  "tags",
  "environments",
];

/**
 * Table rows for the `/info`-backed browse resources. The data is the already
 * loaded `projectInfo` object — no paging, no API round-trip — so filtering
 * happens locally from the table's filter state. Labels are the one exception:
 * `/info` carries only title and slug, so colours come from the labels list.
 */
export function useInfoTableRows(
  resource: ProjectResource,
  state: Record<string, unknown>,
): TableRowsResult<Record<string, unknown>> {
  const store = useStores();
  const [info, setInfo] = useState(store.project.projectInfo);
  useEffect(
    () =>
      reaction(() => store.project.projectInfo, setInfo, {
        fireImmediately: true,
      }),
    [store],
  );
  const [loading, setLoading] = useState(store.project.countsLoading);
  useEffect(
    () =>
      reaction(() => store.project.countsLoading, setLoading, {
        fireImmediately: true,
      }),
    [store],
  );

  const labels = useTestomatio<ProjectLabel[]>(
    "labels",
    { per_page: 200 },
    { skip: resource !== "labels" },
  );

  const allRows = useMemo<Row[]>(() => {
    if (!info) return [];
    if (resource === "labels") {
      const list =
        labels.data ??
        (info.labels ?? []).map((l) => ({ id: l.slug, title: l.title }));
      return buildLabelRows(list);
    }
    if (resource === "tags") return buildTagRows(info);
    if (resource === "environments") return buildEnvironmentRows(info);
    return buildCiProfileRows(info) as unknown as Row[];
  }, [info, resource, labels.data]);

  const rows = useMemo<Row[]>(() => {
    if (resource === "labels") return filterInfoRows(allRows, state.title, "title");
    if (resource === "tags") return filterInfoRows(allRows, state.tag, "tag");
    if (resource === "environments") {
      return filterInfoRows(allRows, state.name, "name");
    }
    const name = typeof state.name === "string" ? state.name : "";
    return filterCiProfileRows(
      allRows as unknown as CiProfileRow[],
      { name },
    ) as unknown as Row[];
  }, [allRows, resource, state.title, state.tag, state.name]);

  return {
    rows,
    filterRows: rows.length,
    totalRows: allRows.length,
    totalRowsFetched: rows.length,
    isLoading: loading && !info,
    isFetching: false,
    hasNextPage: false,
    fetchNextPage: NOOP_NEXT,
    refetch: store.project.refresh,
  };
}

type Row = Record<string, unknown>;

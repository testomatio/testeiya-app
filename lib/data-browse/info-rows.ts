"use client";

import { useEffect, useMemo, useState } from "react";
import { reaction } from "mobx";
import { useStores } from "@/lib/services/StoreProvider";
import type { TableRowsResult } from "./use-table-rows";
import { buildCiProfileRows, filterCiProfileRows } from "./schemas/ci-profiles";

const NOOP_NEXT = async () => {};

/**
 * Table rows for the CI-profiles browse resource. The data is the already
 * loaded `projectInfo` object — no paging, no API round-trip — so filtering
 * happens locally from the table's filter state.
 */
export function useInfoTableRows(
  state: Record<string, unknown>
): TableRowsResult<Record<string, unknown>> {
  const store = useStores();
  const [info, setInfo] = useState(store.project.projectInfo);
  useEffect(
    () =>
      reaction(() => store.project.projectInfo, setInfo, {
        fireImmediately: true,
      }),
    [store]
  );
  const [loading, setLoading] = useState(store.project.countsLoading);
  useEffect(
    () =>
      reaction(() => store.project.countsLoading, setLoading, {
        fireImmediately: true,
      }),
    [store]
  );

  const allRows = useMemo(() => {
    if (!info) return [];
    return buildCiProfileRows(info);
  }, [info]);

  const name = typeof state.name === "string" ? state.name : "";
  const rows = useMemo(
    () => filterCiProfileRows(allRows, { name }),
    [allRows, name]
  );

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

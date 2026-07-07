"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reaction } from "mobx";
import { useStores } from "@/lib/services/StoreProvider";
import {
  fetchTestomatioList,
  type TestomatioMeta,
} from "@/lib/agent-output/use-testomatio";
import type { QueryParams } from "./params";

const PER_PAGE = 50;

export function useTableRows<T>(
  resource: string,
  params: QueryParams,
): TableRowsResult<T> {
  const store = useStores();
  const [sessionId, setSessionId] = useState<string | null>(store.sessionId);
  useEffect(
    () => reaction(() => store.sessionId, setSessionId, { fireImmediately: true }),
    [store],
  );
  const [refreshTick, setRefreshTick] = useState(store.project.refreshTick);
  useEffect(
    () =>
      reaction(() => store.project.refreshTick, setRefreshTick, {
        fireImmediately: true,
      }),
    [store],
  );

  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<TestomatioMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const pageRef = useRef(1);
  const inFlightRef = useRef(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const key = JSON.stringify(params);

  useEffect(() => {
    if (!sessionId) {
      setRows([]);
      setMeta(null);
      return;
    }
    let cancelled = false;
    pageRef.current = 1;
    inFlightRef.current = true;
    setIsLoading(true);
    setIsFetching(true);
    fetchTestomatioList<T>(
      resource,
      { ...paramsRef.current, page: 1, per_page: PER_PAGE },
      sessionId,
    )
      .then(({ items, meta: m }) => {
        if (cancelled) return;
        setRows(items);
        setMeta(m);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setMeta(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
        setIsFetching(false);
        inFlightRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [resource, key, sessionId, refreshTick, reload]);

  const fetchNextPage = useCallback(async () => {
    if (!sessionId || inFlightRef.current) return;
    const total = meta?.total;
    if (total != null && rows.length >= total) return;
    const next = pageRef.current + 1;
    inFlightRef.current = true;
    setIsFetching(true);
    try {
      const { items, meta: m } = await fetchTestomatioList<T>(
        resource,
        { ...paramsRef.current, page: next, per_page: PER_PAGE },
        sessionId,
      );
      setRows((prev) => [...prev, ...items]);
      setMeta(m);
      pageRef.current = next;
    } finally {
      setIsFetching(false);
      inFlightRef.current = false;
    }
  }, [sessionId, resource, meta, rows.length]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  const filterRows = meta?.total ?? rows.length;
  return {
    rows,
    filterRows,
    totalRows: meta?.total ?? rows.length,
    totalRowsFetched: rows.length,
    isLoading,
    isFetching,
    hasNextPage: rows.length < filterRows,
    fetchNextPage,
    refetch,
  };
}

interface TableRowsResult<T> {
  rows: T[];
  filterRows: number;
  totalRows: number;
  totalRowsFetched: number;
  isLoading: boolean;
  isFetching: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => void;
}

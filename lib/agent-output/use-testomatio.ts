"use client";

import { useEffect, useState } from "react";
import { reaction } from "mobx";
import { useStores } from "@/lib/services/StoreProvider";

/*
 * Fetches a Testomat.io v2 resource via the `/api/testomatio/{resource}`
 * proxy, using the active sessionId from the service layer. Returns
 * `{data, loading, error}`. When the session is missing or `skip` is true
 * the hook is a no-op — callers fall back to whatever data they already
 * have (e.g. list rows, agent-fed fixtures).
 *
 * A module-scope cache keeps repeat opens of the same drill-down instant.
 */

type QueryValue = string | number | undefined | null;

interface UseTestomatioOpts {
  /** Skip the fetch entirely (e.g. when the caller already has rich data). */
  skip?: boolean;
}

interface UseTestomatioResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  meta: TestomatioMeta | null;
}

export interface TestomatioMeta {
  total?: number;
  page?: number;
  per_page?: number;
  total_pages?: number;
}

const cache = new Map<string, { data: unknown; meta: TestomatioMeta | null }>();

function buildUrl(
  resource: string,
  query: Record<string, QueryValue>,
  sessionId: string
): string {
  const params = new URLSearchParams({ session: sessionId });
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  return `/api/testomatio/${encodeURIComponent(resource)}?${params.toString()}`;
}

/**
 * Unwrap `{data: T, meta?}` envelopes — Testomat.io v2 always wraps.
 * For list endpoints the caller typically wants the `data` array; for
 * detail endpoints the bare entity. Either way we strip one envelope.
 */
function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "data" in (raw as object)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

/** Pull the `{meta: {...}}` envelope (totals/pagination) from a v2 response. */
function extractMeta(raw: unknown): TestomatioMeta | null {
  if (raw && typeof raw === "object" && "meta" in (raw as object)) {
    const m = (raw as { meta?: unknown }).meta;
    if (m && typeof m === "object") return m as TestomatioMeta;
  }
  return null;
}

export function useTestomatio<T>(
  resource: string,
  query: Record<string, QueryValue>,
  opts: UseTestomatioOpts = {}
): UseTestomatioResult<T> {
  const store = useStores();
  // Read the observable sessionId reactively without forcing every consumer to
  // be an `observer` — sync it into local state via a MobX reaction.
  const [sessionId, setSessionId] = useState<string | null>(store.sessionId);
  useEffect(
    () => reaction(() => store.sessionId, setSessionId, { fireImmediately: true }),
    [store]
  );
  const skip = opts.skip || !sessionId;
  const url = sessionId ? buildUrl(resource, query, sessionId) : null;

  const [state, setState] = useState<UseTestomatioResult<T>>(() => {
    if (skip || !url) return { data: null, loading: false, error: null, meta: null };
    const cached = cache.get(url);
    if (cached) return { data: cached.data as T, loading: false, error: null, meta: cached.meta };
    return { data: null, loading: true, error: null, meta: null };
  });

  useEffect(() => {
    if (skip || !url) {
      setState({ data: null, loading: false, error: null, meta: null });
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setState({ data: cached.data as T, loading: false, error: null, meta: cached.meta });
      return;
    }
    setState({ data: null, loading: true, error: null, meta: null });
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const text = await r.text();
        const json = text ? (JSON.parse(text) as unknown) : null;
        if (!r.ok) {
          const msg =
            (json && typeof json === "object" && "error" in json
              ? String((json as { error: unknown }).error)
              : `HTTP ${r.status}`) || `HTTP ${r.status}`;
          throw new Error(msg);
        }
        const data = unwrap<T>(json);
        const meta = extractMeta(json);
        cache.set(url, { data, meta });
        setState({ data, loading: false, error: null, meta });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          meta: null,
        });
      });
    return () => ctrl.abort();
  }, [url, skip]);

  return state;
}

/** Drop every cached response — useful when a session is rotated. */
export function clearTestomatioCache(): void {
  cache.clear();
}

/**
 * Write a Testomat.io v2 resource via the proxy: `PUT /api/testomatio/{resource}?id=`.
 * Unwraps the `{data}` envelope, throws on a non-OK response, and clears the read
 * cache so subsequent `useTestomatio` reads reflect the change.
 */
export async function mutateTestomatio<T>(
  resource: string,
  opts: { id: string | number; body: unknown },
  sessionId: string
): Promise<T> {
  const params = new URLSearchParams({
    session: sessionId,
    id: String(opts.id),
  });
  const url = `/api/testomatio/${encodeURIComponent(resource)}?${params.toString()}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.body),
  });
  const text = await r.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!r.ok) {
    const msg =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${r.status}`;
    throw new Error(msg || `HTTP ${r.status}`);
  }
  clearTestomatioCache();
  return unwrap<T>(json);
}

"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";

/*
 * Fetches a Testomat.io v2 resource via the `/api/testomatio/{resource}`
 * proxy, using the sessionId already tracked by WorkspaceContext. Returns
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
}

const cache = new Map<string, unknown>();

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

export function useTestomatio<T>(
  resource: string,
  query: Record<string, QueryValue>,
  opts: UseTestomatioOpts = {}
): UseTestomatioResult<T> {
  const { sessionId } = useWorkspace();
  const skip = opts.skip || !sessionId;
  const url = sessionId ? buildUrl(resource, query, sessionId) : null;

  const [state, setState] = useState<UseTestomatioResult<T>>(() => {
    if (skip || !url) return { data: null, loading: false, error: null };
    const cached = cache.get(url) as T | undefined;
    if (cached !== undefined) return { data: cached, loading: false, error: null };
    return { data: null, loading: true, error: null };
  });

  useEffect(() => {
    if (skip || !url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = cache.get(url) as T | undefined;
    if (cached !== undefined) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    setState({ data: null, loading: true, error: null });
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
        const unwrapped = unwrap<T>(json);
        cache.set(url, unwrapped);
        setState({ data: unwrapped, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
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

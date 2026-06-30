"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useStores } from "@/lib/services/StoreProvider";
import {
  fetchTestomatioList,
  type TestomatioMeta,
} from "@/lib/agent-output/use-testomatio";
import { useRegisterWidget } from "@/lib/widgets/command-bus";
import { useWidgetSnapshot } from "./use-widget-snapshot";
import { extractList } from "./extract-list";
import { ListPager } from "./list-row";

const PER_PAGE = 50;

/**
 * Shared list-widget behaviour for the chat-rendered list renderers (runs,
 * tests, …). It seeds from the agent-provided `json` and, when the renderer is
 * the active pane widget (`widgetId` set), becomes controllable: the `list`
 * (paginate/filter) and `open` (select) actions run the SAME code the user's
 * pager/rows do, so the user sees the change and the agent gets the result.
 *
 * Without a `widgetId` it's a pure passthrough of `json` — no fetch, no pager,
 * no registration — so standalone uses (inside ResourceWidgetView, preview) keep
 * their current behaviour.
 */
export function useListWidget<T>(opts: {
  widgetId?: string;
  resource: string;
  json: unknown;
  getId: (item: T) => string | undefined;
  onOpen?: (item: T) => void;
}): {
  items: T[];
  meta: TestomatioMeta | null;
  selected: T | null;
  setSelected: (value: T | null) => void;
  pager: ReactNode;
} {
  const { widgetId, resource, json, getId, onOpen } = opts;
  const store = useStores();
  const seed = useMemo(() => extractList<T>(json), [json]);
  const [view, setView] = useState<{
    items: T[];
    meta: TestomatioMeta | null;
    page: number;
    query?: string;
  } | null>(null);
  const [selected, setSelected] = useState<T | null>(null);

  const items = view ? view.items : seed.items;
  const meta: TestomatioMeta | null = view ? view.meta : seed.meta ?? null;
  const page = view?.page ?? 1;

  const runList = useCallback(
    async (params: Record<string, unknown>) => {
      const sessionId = store.sessionId;
      if (!sessionId) throw new Error("No active session to load this list.");
      const nextPage =
        params.page != null
          ? Math.max(1, Number(params.page))
          : params.query != null
            ? 1
            : page;
      const query = params.query != null ? String(params.query) : view?.query;
      const { items: rows, meta: m } = await fetchTestomatioList<T>(
        resource,
        { page: nextPage, per_page: PER_PAGE, query },
        sessionId
      );
      setView({ items: rows, meta: m, page: nextPage, query });
      setSelected(null);
      return {
        page: nextPage,
        per_page: PER_PAGE,
        total: m?.total ?? null,
        count: rows.length,
        query: query ?? null,
        items: rows,
      };
    },
    [store, resource, page, view]
  );

  const runOpen = useCallback(
    async (params: Record<string, unknown>) => {
      const id = String(params.id ?? "");
      const found = items.find((it) => String(getId(it) ?? "") === id);
      if (!found) {
        throw new Error(
          `Item "${id}" is not on the page currently shown (${items.length} items). Use "list" to load the page that contains it first.`
        );
      }
      if (onOpen) onOpen(found);
      else setSelected(found);
      return { opened: found };
    },
    [items, getId, onOpen]
  );

  const run = useCallback(
    (action: string, params: Record<string, unknown>) => {
      if (action === "list") return runList(params);
      if (action === "open") return runOpen(params);
      return Promise.reject(new Error(`Unknown action "${action}" for this widget.`));
    },
    [runList, runOpen]
  );

  useRegisterWidget(widgetId, run);

  // Expose the rows on screen to the agent's `get` action. While a row's detail
  // is open it owns the snapshot, so the list yields (active = no selection).
  useWidgetSnapshot({ kind: resource, items, meta }, !selected);

  const total = meta?.total;
  const hasPrev = page > 1;
  let hasNext = items.length === PER_PAGE;
  if (total != null) hasNext = page * PER_PAGE < total;
  let totalPages: number | undefined;
  if (total != null) totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  let label = `Page ${page}`;
  if (total != null) {
    const start = items.length === 0 ? 0 : (page - 1) * PER_PAGE + 1;
    const end = (page - 1) * PER_PAGE + items.length;
    label = `Showing ${start}–${end} of ${total}`;
  }
  const showPager = !!widgetId && (hasPrev || hasNext);
  const pager = showPager ? (
    <ListPager
      label={label}
      page={page}
      totalPages={totalPages}
      hasPrev={hasPrev}
      hasNext={hasNext}
      onPage={(p) => void runList({ page: p })}
      className="mt-2 border-t pt-2"
    />
  ) : null;

  return { items, meta, selected, setSelected, pager };
}

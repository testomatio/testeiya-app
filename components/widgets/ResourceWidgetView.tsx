"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon, RotateCwIcon, SearchIcon, XIcon } from "@/lib/icons";
import {
  fetchTestomatioList,
  useTestomatio,
} from "@/lib/agent-output/use-testomatio";
import { useStores } from "@/lib/services/StoreProvider";
import { useLayoutNode } from "@/lib/debug/layout-registry";
import { useRegisterWidget } from "@/lib/widgets/command-bus";
import type { ProjectResource } from "@/lib/services/project-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CreateRunDialog } from "./CreateRunDialog";
import { ResourceDataTable } from "./ResourceDataTable";
import { ListPager } from "./list-row";
import PlansListRenderer from "./PlansListRenderer";
import RequirementsListRenderer from "./RequirementsListRenderer";
import RunsListRenderer from "./RunsListRenderer";
import TestsListRenderer from "./TestsListRenderer";
import TestRunsListRenderer from "./TestRunsListRenderer";

// Page size for the in-app live list; Prev/Next walks the rest (the external
// link still covers everything in the full Testomat.io UI).
const PER_PAGE = 50;

// Each project resource maps to a label, the v2 API resource to fetch (the UI
// "requirements" tab is backed by the `issues` endpoint), and its widget.
// `searchVar` is the TQL variable a plain-text search maps to (`test % '…'`),
// and its presence enables the Search + Filter inputs for that resource.
const RESOURCE_CONFIG: Record<
  ProjectResource,
  {
    label: string;
    api: string;
    render: (json: unknown) => ReactNode;
    searchVar?: string;
    table?: boolean;
  }
> = {
  tests: {
    label: "Tests",
    api: "tests",
    render: (json) => <TestsListRenderer json={json} />,
    searchVar: "test",
    table: true,
  },
  runs: {
    label: "Runs",
    api: "runs",
    render: (json) => <RunsListRenderer json={json} />,
    searchVar: "title",
    table: true,
  },
  testruns: {
    label: "Test Runs",
    api: "testruns",
    render: (json) => <TestRunsListRenderer json={json} />,
    table: true,
  },
  plans: {
    label: "Plans",
    api: "plans",
    render: (json) => <PlansListRenderer json={json} />,
    table: true,
  },
  requirements: {
    label: "Requirements",
    api: "issues",
    render: (json) => <RequirementsListRenderer json={json} />,
    table: true,
  },
};

/**
 * Full-height main-area view that renders a project resource (tests / runs /
 * plans) with the same widgets the agent uses in chat. Data comes live from the
 * `/api/testomatio/*` proxy for the active session; a header offers an external
 * "open in Testomat.io" escape hatch and a close button.
 */
export function ResourceWidgetView({
  resource,
  widgetId,
  externalUrl,
  onOpenExternal,
  onRefresh,
  onClose,
  className,
}: {
  resource: ProjectResource;
  widgetId?: string;
  externalUrl?: string;
  onOpenExternal?: () => void;
  onRefresh?: () => void;
  onClose: () => void;
  className?: string;
}) {
  const { label, api, render, searchVar, table: isTable } = RESOURCE_CONFIG[resource];
  const store = useStores();
  const layoutRef = useLayoutNode("ResourceWidgetView");
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [applied, setApplied] = useState({ search: "", filter: "" });

  // Clear the inputs when switching between resources (render-time reset, the
  // React-recommended alternative to a setState-in-effect).
  const [prevResource, setPrevResource] = useState(resource);
  if (resource !== prevResource) {
    setPrevResource(resource);
    setSearchInput("");
    setFilterInput("");
    setApplied({ search: "", filter: "" });
  }

  // Debounce typing before it drives a fetch (the timeout callback isn't a
  // synchronous setState-in-effect, so it stays out of cascading-render rules).
  useEffect(() => {
    const id = setTimeout(
      () => setApplied({ search: searchInput.trim(), filter: filterInput.trim() }),
      400
    );
    return () => clearTimeout(id);
  }, [searchInput, filterInput]);

  const query = buildQuery(searchVar, applied.search, applied.filter);

  // Reset to the first page whenever the resource or effective query changes.
  const resetKey = `${resource}|${query}`;
  const [prevKey, setPrevKey] = useState(resetKey);
  if (resetKey !== prevKey) {
    setPrevKey(resetKey);
    setPage(1);
  }

  const { data, loading, error, meta } = useTestomatio<unknown[]>(
    api,
    {
      page,
      per_page: PER_PAGE,
      query: query || undefined,
    },
    { skip: isTable }
  );

  const items = data ?? [];
  const total = meta?.total;
  const hasPrev = page > 1;
  let hasNext = items.length === PER_PAGE;
  if (total != null) hasNext = page * PER_PAGE < total;
  let totalPages: number | undefined;
  if (total != null) totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const showPager = !loading && !error && (hasPrev || hasNext);
  let rangeStart = (page - 1) * PER_PAGE + 1;
  if (items.length === 0) rangeStart = 0;
  const rangeEnd = (page - 1) * PER_PAGE + items.length;
  let pagerLabel = `Page ${page}`;
  if (total != null) {
    pagerLabel = `Showing ${rangeStart}–${rangeEnd} of ${total} ${label.toLowerCase()}`;
  }

  const applyNow = () =>
    setApplied({ search: searchInput.trim(), filter: filterInput.trim() });

  // Let the agent drive this browse view via `ui_widget`. `list` runs the same
  // pagination/filter the user's pager/inputs do; `open` isn't available here
  // (the list is shown directly — rows open on click), so it returns a hint.
  const runCommand = useCallback(
    async (action: string, params: Record<string, unknown>) => {
      if (action !== "list") {
        throw new Error(
          `This is a browse list; only "list" is supported here (open a row by clicking, or ask me to render the item).`
        );
      }
      const sessionId = store.sessionId;
      if (!sessionId) throw new Error("No active session to load this list.");
      const rawQuery =
        params.query != null ? String(params.query).replace(/^=/, "").trim() : "";
      if (params.query != null) {
        setSearchInput("");
        setFilterInput(rawQuery);
        setApplied({ search: "", filter: rawQuery });
      }
      const nextPage =
        params.page != null
          ? Math.max(1, Number(params.page))
          : params.query != null
            ? 1
            : page;
      setPage(nextPage);
      const effectiveQuery =
        params.query != null
          ? buildQuery(searchVar, "", rawQuery)
          : buildQuery(searchVar, applied.search, applied.filter);
      const { items, meta } = await fetchTestomatioList<unknown>(
        api,
        { page: nextPage, per_page: PER_PAGE, query: effectiveQuery || undefined },
        sessionId
      );
      return {
        page: nextPage,
        per_page: PER_PAGE,
        total: meta?.total ?? null,
        count: items.length,
        query: effectiveQuery || null,
        items,
      };
    },
    [store, api, searchVar, page, applied.search, applied.filter]
  );
  useRegisterWidget(widgetId, runCommand);

  let body;
  if (isTable) {
    body = <ResourceDataTable resource={resource} />;
  } else if (loading) {
    body = (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  } else if (error) {
    body = (
      <p className="p-4 text-sm text-destructive">
        Failed to load {label.toLowerCase()}: {error}
      </p>
    );
  } else {
    body = render(items);
  }

  return (
    <div
      ref={layoutRef}
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-md border bg-background",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Tooltip>
          <TooltipTrigger render={
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          } />
          <TooltipContent><p>Close</p></TooltipContent>
        </Tooltip>
        <span className="shrink-0 text-sm font-medium">{label}</span>
        {searchVar && !isTable && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyNow();
                }}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="h-7 pl-7 text-xs"
              />
            </div>
            <Input
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyNow();
              }}
              placeholder="Filter (TQL), e.g. priority == 'high'"
              title="Testomat.io Query Language filter"
              className="hidden h-7 text-xs sm:block sm:max-w-xs"
            />
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {resource === "runs" && (
            <Button
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setNewRunOpen(true)}
            >
              <Icon name="add" className="size-3.5" />
              <span className="hidden sm:inline">New run</span>
            </Button>
          )}
          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={onRefresh}
              title="Refresh"
              aria-label="Refresh"
            >
              <RotateCwIcon className="size-4" />
            </Button>
          )}
          {externalUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onOpenExternal}
              title="Open in Testomat.io"
            >
              <Icon name="open_in_new" className="size-3.5" />
              <span className="hidden sm:inline">Open in Testomat.io</span>
            </Button>
          )}
        </div>
      </div>
      <div className={cn("min-h-0 flex-1", !isTable && "overflow-auto p-3")}>
        {body}
      </div>
      {showPager && !isTable && (
        <ListPager
          label={pagerLabel}
          page={page}
          totalPages={totalPages}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPage={setPage}
          className="border-t px-3 py-2"
        />
      )}
      {resource === "runs" && (
        <CreateRunDialog open={newRunOpen} onOpenChange={setNewRunOpen} />
      )}
    </div>
  );
}

/**
 * Build the v2 `query` value. The endpoint treats a leading `=` as "this is
 * TQL" (otherwise it's a plain-text search), so a free-text search maps to
 * `=<var> % '<term>'` and the raw TQL filter is AND-ed in — e.g.
 * `=test % 'login' and (priority == 'high')`.
 */
function buildQuery(
  searchVar: string | undefined,
  search: string,
  filter: string
): string {
  const parts: string[] = [];
  if (searchVar && search) {
    parts.push(`${searchVar} % '${search.replace(/'/g, "")}'`);
  }
  if (filter) {
    const tql = filter.replace(/^=/, "").trim();
    if (tql) parts.push(`(${tql})`);
  }
  if (parts.length === 0) return "";
  return `=${parts.join(" and ")}`;
}

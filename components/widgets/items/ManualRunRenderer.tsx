"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  ArrowLeftIcon,
  CameraIcon,
  ChevronDownIcon,
  Icon,
  MonitorIcon,
  SearchIcon,
  UploadIcon,
} from "@/lib/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { resizableTableComponents } from "@/components/ai-elements/resizable-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  mutateTestomatio,
  uploadTestRunAttachment,
  useTestomatio,
} from "@/lib/agent-output/use-testomatio";
import type { CaptureResult } from "@/lib/services/browser-service";
import {
  useBrowserService,
  useProjectService,
  useStores,
} from "@/lib/services/StoreProvider";
import { useRegisterWidget } from "@/lib/widgets/command-bus";
import { useWidgetSnapshot } from "../use-widget-snapshot";
import { captureDisplayScreenshot } from "@/lib/screenshot";
import { openExternalUrl } from "@/lib/testomatio-url";
import { cn } from "@/lib/utils";
import { ListPager } from "../list-row";
import { RunProgress, RunStatusDot, StatusFilterChip } from "../status-pill";
import { resolveType, TypeIcon } from "../type-icons";

const STREAMDOWN_PLUGINS = { cjk, code, math, mermaid };

const PER_PAGE = 50;

const STATUSES: { value: string; label: string }[] = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
];

type StatusBucket = "passed" | "failed" | "skipped" | "pending";

const STATUS_FILTERS: { value: StatusBucket; label: string }[] = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Pending" },
];

const STATUS_TONE: Record<string, string> = {
  passed: "border-run-passed text-run-passed",
  failed: "border-run-failed text-run-failed",
  skipped: "border-run-skipped text-run-skipped",
};

function ManualRunRenderer({
  data,
  onExit,
  widgetId,
}: {
  data: Record<string, unknown>;
  onExit: () => void;
  widgetId?: string;
}) {
  const run = data as ManualRunData;
  const store = useStores();
  const project = useProjectService();
  const browser = useBrowserService();
  const runId = run.id;
  const title = run.title ?? run.clean_title ?? run.id ?? "(untitled run)";
  const runsUrl = project.currentLinks?.runs;
  const externalUrl = runsUrl && run.id ? `${runsUrl}/${run.id}` : undefined;

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Debounce typing before it drives a fetch (the timeout callback is not a
  // synchronous setState-in-effect, so it stays out of cascading-render rules).
  useEffect(() => {
    const id = setTimeout(() => setAppliedSearch(searchInput.trim()), 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const {
    data: fetched,
    loading,
    error,
    meta,
  } = useTestomatio<TestRunRow[]>(
    "testruns",
    { run_id: runId, page, per_page: PER_PAGE, query: appliedSearch || undefined },
    { skip: !runId }
  );
  const testruns = useMemo(() => fetched ?? [], [fetched]);

  // Expose the run and its per-test rows to the agent's `get` action.
  useWidgetSnapshot({
    kind: "manual-run",
    run,
    testruns,
    total: meta?.total,
    capture: {
      active: browser.capturing,
      consoleErrors: browser.signals?.consoleErrors ?? 0,
      failedRequests: browser.signals?.failedRequests ?? 0,
    },
  });

  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [statusFilter, setStatusFilter] = useState<StatusBucket | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shots, setShots] = useState<Record<string, Shot[]>>({});
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [editingTime, setEditingTime] = useState(false);
  const [, setTick] = useState(0);
  const [autoShot, setAutoShot] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("testeiya.manualRunAutoShot") !== "0";
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const [leftPct, setLeftPct] = useState(50);
  const [maxHeight, setMaxHeight] = useState<number>();

  // Reset to the first test/page whenever the search changes (render-time reset,
  // the React-recommended alternative to a setState-in-effect).
  const [prevSearch, setPrevSearch] = useState(appliedSearch);
  if (appliedSearch !== prevSearch) {
    setPrevSearch(appliedSearch);
    setPage(1);
    setIndex(0);
  }

  // Focus the view on mount so the keyboard shortcuts work without a click.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // Bound the height to the viewport so the header/list/steps scroll internally
  // and the status controls stay pinned — the surrounding widget panes don't all
  // hand down a definite height, so `h-full` alone would collapse to content.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      setMaxHeight(Math.max(320, window.innerHeight - top - 12));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // While the manual-run executor is showing it shares the parent widget's id
  // but exposes its own action set, so override the kind the agent is told.
  useEffect(() => {
    store.widget.setActiveOverride({ kind: "manual-run", id: runId, title });
    return () => store.widget.clearActiveOverride();
  }, [store, runId, title]);

  // Keep the selected row visible as the user navigates with the keyboard.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  // Free the local thumbnail object URLs (screen/file captures) on unmount.
  useEffect(
    () => () => {
      for (const u of objectUrls.current) URL.revokeObjectURL(u);
    },
    []
  );

  useEffect(() => {
    if (testruns.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of testruns) {
        const key = String(t.id);
        if (next[key]) continue;
        next[key] = {
          status: t.status ?? "pending",
          message: t.message ?? "",
        };
      }
      return next;
    });
    setIndex((i) => Math.min(i, testruns.length - 1));
  }, [testruns]);

  // The run-list summary often omits counts, so the testruns `meta.total` is the
  // authoritative number of tests in this run, and completion is counted from the
  // testruns' own statuses (drafts are seeded from the server status).
  const total =
    meta?.total ??
    run.tests_count ??
    (run.passed_count ?? 0) +
      (run.failed_count ?? 0) +
      (run.skipped_count ?? 0) +
      (run.pending_count ?? 0);
  const completed = Object.values(drafts).filter(
    (d) => !isPending(d.status)
  ).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  for (const d of Object.values(drafts)) {
    const b = statusBucket(d.status);
    if (b === "passed") passedCount++;
    if (b === "failed") failedCount++;
    if (b === "skipped") skippedCount++;
  }
  const filterCounts: Record<StatusBucket, number> = {
    passed: passedCount,
    failed: failedCount,
    skipped: skippedCount,
    pending: Math.max(0, total - completed),
  };

  // Group the (status-filtered) testruns by suite, preserving their order and
  // each row's original flat index for selection/navigation.
  const groups = useMemo(
    () => buildGroups(testruns, drafts, statusFilter),
    [testruns, drafts, statusFilter]
  );

  const hasPrevPage = page > 1;
  let hasNextPage = testruns.length === PER_PAGE;
  if (meta?.total != null) hasNextPage = page * PER_PAGE < meta.total;
  let totalPages: number | undefined;
  if (meta?.total != null) {
    totalPages = Math.max(1, Math.ceil(meta.total / PER_PAGE));
  }
  const rangeStart = testruns.length === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd = (page - 1) * PER_PAGE + testruns.length;
  let pagerLabel = `Page ${page}`;
  if (meta?.total != null) {
    pagerLabel = `Showing ${rangeStart}–${rangeEnd} of ${meta.total} tests`;
  }

  // Flat indices in the order shown (grouped + status-filtered) — navigation
  // walks this so Prev/Next and arrows follow what's actually on screen.
  const visibleIndices = groups.flatMap((g) => g.items.map((it) => it.i));
  const visiblePos = visibleIndices.indexOf(index);

  const current = testruns[index];
  const draft = current ? drafts[String(current.id)] : undefined;
  const currentShots = current ? shots[String(current.id)] ?? [] : [];
  const currentTitle =
    current?.test_title ?? current?.title ?? String(current?.id ?? "");
  const currentTestId = current?.test_id;
  const isLast = visiblePos === visibleIndices.length - 1 && !hasNextPage;
  const currentKey = current ? String(current.id) : null;
  const currentTimer = currentKey ? timers[currentKey] : undefined;
  const timerRunning = !!currentTimer?.startedAt;
  const currentSuggestion = currentKey ? suggestions[currentKey] : undefined;

  // Re-render each second while the visible timer runs, so the clock ticks.
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Moving to another test pauses whatever timer was running.
  useEffect(() => {
    setEditingTime(false);
    setTimers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, t] of Object.entries(prev)) {
        if (key === currentKey || !t.startedAt) continue;
        next[key] = { base: elapsedSeconds(t), startedAt: null };
        changed = true;
      }
      if (!changed) return prev;
      return next;
    });
  }, [currentKey]);

  const { data: testDetail, loading: stepsLoading } = useTestomatio<TestDetail>(
    "tests",
    { id: currentTestId },
    { skip: !currentTestId }
  );
  const stepsBody = testDetail?.description ?? undefined;

  // Agent control of the manual run — each action runs the same code the
  // buttons/shortcuts do. `save_next` and `finish_run` are destructive (writes).
  const runCommand = (action: string, params: Record<string, unknown>) => {
    if (action === "list") {
      const p = Math.max(1, Number(params.page ?? page));
      goToPage(p);
      return { page: p };
    }
    if (action === "search") {
      const q = String(params.query ?? "");
      setSearchInput(q);
      setAppliedSearch(q);
      return { query: q };
    }
    if (action === "filter_status") {
      const s = String(params.status ?? "all");
      setStatusFilter(s === "all" ? null : (s as StatusBucket));
      return { filter: s };
    }
    if (action === "select_test") {
      let i = -1;
      if (params.id != null) {
        i = testruns.findIndex((t) => String(t.id) === String(params.id));
      } else if (params.index != null) {
        i = Number(params.index);
      }
      if (i < 0 || i >= testruns.length) {
        throw new Error(
          "That test isn't on the current page — use list/search/filter_status to bring it into view first."
        );
      }
      setIndex(i);
      const t = testruns[i];
      return {
        selected: {
          id: t.id,
          title: t.test_title ?? t.title,
          suite: t.suite_title,
          status: drafts[String(t.id)]?.status ?? t.status,
        },
      };
    }
    if (action === "set_status") {
      if (!current) throw new Error("No test selected — call select_test first.");
      const s = String(params.status ?? "");
      if (!["passed", "failed", "skipped"].includes(s)) {
        throw new Error("status must be passed, failed, or skipped.");
      }
      setStatus(s);
      return { id: current.id, status: s };
    }
    if (action === "set_message") {
      if (!current) throw new Error("No test selected — call select_test first.");
      const text = String(params.text ?? "");
      setMessage(text);
      return { id: current.id, message: text };
    }
    if (action === "start_test") {
      if (!current) throw new Error("No test selected — call select_test first.");
      startTest();
      return { started: true, id: current.id, capturing: browser.browserOpen };
    }
    if (action === "suggest_message") {
      if (!current) throw new Error("No test selected — call select_test first.");
      const text = String(params.text ?? "").trim();
      if (!text) throw new Error("text is required.");
      setSuggestions((prev) => ({ ...prev, [String(current.id)]: text }));
      return { suggested: true, id: current.id };
    }
    if (action === "attach_screenshot") {
      if (!current) throw new Error("No test selected — call select_test first.");
      if (!browser.browserOpen) throw new Error("No browser is open.");
      return attach().then(() => ({ attached: true, id: current.id }));
    }
    if (action === "save_next") {
      if (!current) throw new Error("No test selected — call select_test first.");
      const override = params.status != null ? String(params.status) : undefined;
      return save(true, override).then(() => ({ saved: true, id: current.id }));
    }
    if (action === "finish_run") {
      return finish().then(() => ({ finished: true }));
    }
    throw new Error(`Unknown action "${action}" for the manual run.`);
  };
  useRegisterWidget(widgetId, runCommand);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ maxHeight }}
      className="flex h-full min-h-[26rem] flex-col gap-3 outline-none"
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onExit}
          className="h-7 gap-1 px-2 text-xs"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to run
        </Button>
        <div className="min-w-0 truncate text-base font-semibold" title={title}>
          {title}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {total > 0 && (
            <div className="flex items-center gap-2">
              <RunProgress percent={percent} />
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {completed} of {total} test{total === 1 ? "" : "s"} completed
              </span>
            </div>
          )}
          {externalUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => openExternalUrl(externalUrl)}
              title="Open in Testomat.io"
            >
              <Icon name="open_in_new" className="size-3.5" />
              <span className="hidden sm:inline">Open in Testomat.io</span>
            </Button>
          )}
          {runId && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={finish}
              disabled={finishing}
            >
              {finishing ? "Finishing…" : "Finish run"}
            </Button>
          )}
        </div>
      </div>

      {loading && testruns.length === 0 && (
        <div className="text-xs">
          <Shimmer as="span">Loading test runs…</Shimmer>
        </div>
      )}
      {error && !loading && (
        <p className="text-xs text-muted-foreground">
          Couldn&apos;t load test runs — {error}
        </p>
      )}
      {!loading && testruns.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No tests in this run.</p>
      )}

      {testruns.length > 0 && (
        <div ref={containerRef} className="flex min-h-0 flex-1 items-stretch">
          <div
            style={{ width: `${leftPct}%` }}
            className="flex min-h-0 shrink-0 flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search tests…"
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f.value;
                  return (
                    <StatusFilterChip
                      key={f.value}
                      status={f.value}
                      count={filterCounts[f.value]}
                      active={active}
                      onClick={() => setStatusFilter(active ? null : f.value)}
                      className="h-7"
                    />
                  );
                })}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.suite}>
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="min-w-0 truncate">{g.suite}</span>
                    <span className="ml-auto shrink-0 normal-case">
                      {g.items.length} test{g.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {g.items.map(({ t, i }) => {
                    const d = drafts[String(t.id)];
                    const rowTitle =
                      t.test_title ?? t.title ?? String(t.id ?? "(untitled)");
                    return (
                      <div
                        key={t.id ?? i}
                        ref={i === index ? activeRowRef : undefined}
                        role="button"
                        tabIndex={0}
                        aria-current={i === index}
                        onClick={() => setIndex(i)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          setIndex(i);
                        }}
                        className={cn(
                          "flex w-full scroll-mt-8 cursor-pointer items-center gap-2 border-l-2 px-2 py-1.5 text-left text-sm outline-none focus-visible:bg-muted/50",
                          i === index
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-transparent hover:bg-muted/50"
                        )}
                      >
                        <TypeIcon
                          type={resolveType({ automated: t.automated }) ?? "manual"}
                        />
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={rowTitle}
                        >
                          {rowTitle}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cycleStatus(t);
                          }}
                          aria-label={`Set status for ${rowTitle}`}
                          title="Click to cycle passed → failed → skipped → not run"
                          className="flex size-6 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                        >
                          <RunStatusDot status={d?.status ?? t.status} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {groups.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  No tests match this filter.
                </div>
              )}
            </div>
            {(hasPrevPage || hasNextPage) && (
              <ListPager
                label={pagerLabel}
                page={page}
                totalPages={totalPages}
                hasPrev={hasPrevPage}
                hasNext={hasNextPage}
                onPage={goToPage}
                className="rounded-md border"
              />
            )}
            {!hasPrevPage && !hasNextPage && total > 0 && (
              <div className="px-1 text-[11px] text-muted-foreground">
                {total} test{total === 1 ? "" : "s"}
              </div>
            )}
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={onSplitterDown}
            className="mx-1.5 w-1 shrink-0 cursor-col-resize self-stretch rounded-full bg-border transition-colors hover:bg-primary/50"
          />

          {current && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div>
                {current.suite_title && (
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {current.suite_title}
                  </div>
                )}
                <div className="text-base font-semibold">{currentTitle}</div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {stepsLoading && (
                  <div className="text-xs">
                    <Shimmer as="span">Loading steps…</Shimmer>
                  </div>
                )}
                {!stepsLoading && stepsBody && (
                  <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-muted/20 p-3">
                    <Streamdown
                      plugins={STREAMDOWN_PLUGINS}
                      components={resizableTableComponents}
                    >
                      {stepsBody}
                    </Streamdown>
                  </div>
                )}
                {!stepsLoading && !stepsBody && (
                  <p className="text-sm text-muted-foreground">
                    No steps for this test.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs">
                  {!timerRunning && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={startTest}
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <Icon name="play_arrow" className="size-3.5" />
                      {(currentTimer?.base ?? 0) > 0 ? "Resume" : "Start test"}
                    </Button>
                  )}
                  {timerRunning && (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={pauseTimer}
                              aria-label="Pause timer"
                              className="h-7 px-1.5"
                            />
                          }
                        >
                          <Icon name="pause" className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent><p>Pause timer</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={stopTest}
                              aria-label="Stop test"
                              className="h-7 px-1.5"
                            />
                          }
                        >
                          <Icon name="stop" className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent><p>Stop test — ends signal capture</p></TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  {(timerRunning || (currentTimer?.base ?? 0) > 0) && (
                    <>
                      {editingTime ? (
                        <Input
                          autoFocus
                          defaultValue={formatClock(elapsedSeconds(currentTimer))}
                          onBlur={(e) => commitTime(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitTime(e.currentTarget.value);
                            if (e.key === "Escape") setEditingTime(false);
                          }}
                          aria-label="Edit elapsed time (mm:ss)"
                          className="h-7 w-16 text-center font-mono text-xs"
                        />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={() => setEditingTime(true)}
                                className="rounded px-1 py-0.5 font-mono text-sm tabular-nums hover:bg-muted"
                              />
                            }
                          >
                            {formatClock(elapsedSeconds(currentTimer))}
                          </TooltipTrigger>
                          <TooltipContent><p>Click to edit time</p></TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={resetTimer}
                              aria-label="Reset timer"
                              className="h-7 px-1.5 text-muted-foreground"
                            />
                          }
                        >
                          <Icon name="restart_alt" className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent><p>Reset timer</p></TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  {browser.capturing && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={analyzeNow}
                            className={cn(
                              "ml-auto flex items-center gap-1.5 rounded-full border px-2 py-0.5 hover:bg-muted",
                              (browser.signals?.consoleErrors ?? 0) +
                                (browser.signals?.failedRequests ?? 0) >
                                0
                                ? "text-run-failed"
                                : "text-muted-foreground"
                            )}
                          />
                        }
                      >
                        <span className="size-1.5 animate-pulse rounded-full bg-run-failed" />
                        {browser.signals
                          ? `${browser.signals.consoleErrors} console errors · ${browser.signals.failedRequests} failed requests`
                          : "capturing…"}
                      </TooltipTrigger>
                      <TooltipContent><p>Ask the agent to analyze the captured signals</p></TooltipContent>
                    </Tooltip>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {STATUSES.map((s) => {
                    const selected = draft?.status === s.value;
                    return (
                      <Button
                        key={s.value}
                        type="button"
                        variant="outline"
                        onClick={() => setStatus(s.value)}
                        className={cn(
                          "h-9 w-full font-semibold uppercase",
                          STATUS_TONE[s.value],
                          selected && "bg-current/10 ring-1 ring-current"
                        )}
                      >
                        {s.label}
                      </Button>
                    );
                  })}
                </div>

              <Textarea
                placeholder="Message (optional)"
                value={draft?.message ?? ""}
                onChange={(e) => setMessage(e.target.value)}
              />

              {currentSuggestion && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
                  <div className="mb-1 flex items-center gap-1 font-medium text-primary">
                    <Icon name="auto_awesome" className="size-3.5" />
                    Suggested note
                  </div>
                  <p className="whitespace-pre-wrap">{currentSuggestion}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={applySuggestion}
                      className="h-6 px-2 text-xs"
                    >
                      Add to message
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={dismissSuggestion}
                      className="h-6 px-2 text-xs text-muted-foreground"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              {actionError && (
                <p className="text-xs text-destructive">{actionError}</p>
              )}

              {currentShots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {currentShots.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void openExternalUrl(s.url)}
                      title="Open attachment"
                      className="block size-16 overflow-hidden rounded border hover:ring-1 hover:ring-primary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.url}
                        alt="attachment"
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void attach(f);
                }}
              />

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={goPrev}
                  disabled={visiblePos <= 0 && !hasPrevPage}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => save(true)}
                  disabled={saving}
                >
                  {saving ? "Saving…" : isLast ? "Save" : "Save & Next"}
                </Button>

                <div className="ml-auto flex items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void attach()}
                    disabled={attaching || browser.busy || !browser.browserOpen}
                    title={
                      browser.browserOpen
                        ? "Attach a screenshot of the controlled browser"
                        : "Start the browser to capture it"
                    }
                    className="gap-1 rounded-r-none"
                  >
                    <CameraIcon className="size-3.5" />
                    {attaching ? "Attaching…" : "Attach screenshot"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={attaching}
                          aria-label="More screenshot sources"
                          className="rounded-l-none border-l-0 px-1.5"
                        />
                      }
                    >
                      <ChevronDownIcon className="size-3.5 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!browser.browserOpen}
                        onClick={() => void attach()}
                      >
                        <CameraIcon className="size-4" />
                        From controlled browser
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void captureScreen()}>
                        <MonitorIcon className="size-4" />
                        From screen…
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadIcon className="size-4" />
                        Upload image…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={toggleAutoShot}>
                        <Icon
                          name={autoShot ? "check_box" : "check_box_outline_blank"}
                          className="size-4"
                        />
                        Auto-attach on save
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> passed · <Kbd>Ctrl</Kbd>+
                <Kbd>U</Kbd> failed · <Kbd>Ctrl</Kbd>+<Kbd>I</Kbd> skipped ·{" "}
                <Kbd>Ctrl</Kbd>+<Kbd>←</Kbd>/<Kbd>→</Kbd> or <Kbd>↑</Kbd>/
                <Kbd>↓</Kbd> move
              </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function onSplitterDown(e: ReactMouseEvent) {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(80, Math.max(20, pct)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "Enter") {
        e.preventDefault();
        save(true, "passed");
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "u") {
        e.preventDefault();
        save(true, "failed");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        save(true, "skipped");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    if (e.key === "ArrowDown") goNext();
    if (e.key === "ArrowUp") goPrev();
  }

  function goToPage(p: number) {
    setPage(Math.max(1, p));
    setIndex(0);
  }

  function goPrev() {
    if (visiblePos > 0) {
      setIndex(visibleIndices[visiblePos - 1]);
      return;
    }
    if (visiblePos < 0 && visibleIndices.length > 0) {
      setIndex(visibleIndices[0]);
      return;
    }
    if (hasPrevPage) goToPage(page - 1);
  }

  function goNext() {
    if (visiblePos >= 0 && visiblePos < visibleIndices.length - 1) {
      setIndex(visibleIndices[visiblePos + 1]);
      return;
    }
    if (visiblePos < 0 && visibleIndices.length > 0) {
      setIndex(visibleIndices[0]);
      return;
    }
    if (hasNextPage) goToPage(page + 1);
  }

  function setStatus(value: string) {
    if (!current) return;
    const key = String(current.id);
    setDrafts((d) => ({ ...d, [key]: { ...d[key], status: value } }));
  }

  function setMessage(value: string) {
    if (!current) return;
    const key = String(current.id);
    setDrafts((d) => ({ ...d, [key]: { ...d[key], message: value } }));
  }

  // Clicking a row's status dot cycles it through the result states and back to
  // "not run" (passed → failed → skipped → pending), persisting each step so the
  // counts and progress update without opening the test.
  async function cycleStatus(t: TestRunRow) {
    const sessionId = store.sessionId;
    if (!runId || !sessionId) return;
    const key = String(t.id);
    const order: StatusBucket[] = ["passed", "failed", "skipped", "pending"];
    const cur = drafts[key]?.status ?? t.status;
    const next = order[(order.indexOf(statusBucket(cur)) + 1) % order.length];
    const message = drafts[key]?.message ?? t.message ?? "";
    setDrafts((prev) => ({ ...prev, [key]: { status: next, message } }));
    setActionError(null);
    try {
      await mutateTestomatio(
        "testruns",
        { id: t.id as string | number, body: { run_id: runId, status: next, message } },
        sessionId
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  // Start executing the selected test: launch its timer and, when the shared
  // browser is up, begin capturing signals (trace + console/request lists).
  function startTest() {
    if (!currentKey) return;
    setTimers((prev) => {
      const t = prev[currentKey] ?? { base: 0, startedAt: null };
      return { ...prev, [currentKey]: { ...t, startedAt: Date.now() } };
    });
    if (browser.browserOpen && !browser.capturing) void browser.startCapture();
  }

  function pauseTimer() {
    if (!currentKey) return;
    setTimers((prev) => {
      const t = prev[currentKey];
      if (!t?.startedAt) return prev;
      return {
        ...prev,
        [currentKey]: { base: elapsedSeconds(t), startedAt: null },
      };
    });
  }

  function stopTest() {
    pauseTimer();
    if (browser.capturing) void browser.stopCapture();
  }

  function resetTimer() {
    if (!currentKey) return;
    setTimers((prev) => {
      const running = !!prev[currentKey]?.startedAt;
      const startedAt = running ? Date.now() : null;
      return { ...prev, [currentKey]: { base: 0, startedAt } };
    });
  }

  function commitTime(value: string) {
    setEditingTime(false);
    if (!currentKey) return;
    const seconds = parseClock(value);
    if (seconds == null) return;
    setTimers((prev) => {
      const running = !!prev[currentKey]?.startedAt;
      const startedAt = running ? Date.now() : null;
      return { ...prev, [currentKey]: { base: seconds, startedAt } };
    });
  }

  function toggleAutoShot() {
    setAutoShot((v) => {
      localStorage.setItem("testeiya.manualRunAutoShot", v ? "0" : "1");
      return !v;
    });
  }

  function applySuggestion() {
    if (!currentKey || !currentSuggestion) return;
    setDrafts((d) => {
      const prev = d[currentKey]?.message ?? "";
      let message = currentSuggestion;
      if (prev.trim()) message = `${prev}\n\n${currentSuggestion}`;
      return { ...d, [currentKey]: { ...d[currentKey], message } };
    });
    setSuggestions((prev) => ({ ...prev, [currentKey]: "" }));
  }

  function dismissSuggestion() {
    if (!currentKey) return;
    setSuggestions((prev) => ({ ...prev, [currentKey]: "" }));
  }

  // The user asked for a look at the live signals mid-test — the agent reads
  // the shared browser itself, so only the counts ride along.
  function analyzeNow() {
    const signals = browser.signals;
    store.agentEvents.emit(
      [
        "<manual-run-event>",
        `The user asked you to analyze the browser signals captured so far while manually testing "${currentTitle}" (testrun id ${currentKey}) — the test is still in progress.`,
        `Counts so far: ${signals?.consoleErrors ?? 0} console errors, ${signals?.failedRequests ?? 0} failed requests.`,
        "Read the details from the shared browser with `playwright-cli console error` and `playwright-cli requests`, diagnose the cause, and if a real problem is visible propose a short note via the manual-run widget action suggest_message. Do not save or change the result yourself.",
        "</manual-run-event>",
      ].join("\n")
    );
    toast.info("Asking the agent to analyze the captured signals");
  }

  async function save(advance: boolean, statusOverride?: string) {
    const sessionId = store.sessionId;
    if (saving || !current || !draft || !runId || !sessionId) return;
    const status = statusOverride ?? draft.status;
    if (statusOverride) setStatus(statusOverride);
    const target = current;
    const key = String(target.id);
    const runTime = elapsedSeconds(timers[key]);
    pauseTimer();
    setSaving(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {
        run_id: runId,
        status,
        message: draft.message,
      };
      if (runTime > 0) body.run_time = runTime;
      await mutateTestomatio(
        "testruns",
        { id: target.id as string | number, body },
        sessionId
      );
      if (autoShot && browser.browserOpen) void attach(undefined, target);
      void harvestCapture(target, status);
      if (advance) goNext();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Close the capture opened by Start and, when the verdict is a failure or the
  // browser logged problems, hand the evidence to the agent for analysis.
  async function harvestCapture(target: TestRunRow, status: string) {
    if (!browser.capturing) return;
    const capture = await browser.stopCapture();
    if (!capture) return;
    const failedRequests = capture.failedRequests ?? [];
    const hasSignals = (capture.consoleErrors ?? 0) > 0 || failedRequests.length > 0;
    if (status !== "failed" && !hasSignals) return;
    store.agentEvents.emit(
      manualRunEventBlock({
        runTitle: title,
        target,
        status,
        capture,
        screenshotAttached: autoShot && browser.browserOpen,
      })
    );
    toast.info("Asking the agent to analyze the captured signals");
  }

  async function attach(file?: File, targetRow?: TestRunRow) {
    const sessionId = store.sessionId;
    const target = targetRow ?? current;
    if (attaching || !target || !sessionId) return;
    setAttaching(true);
    setActionError(null);
    try {
      const res = await uploadTestRunAttachment({
        sessionId,
        testrunId: target.id,
        runId,
        testId: target.test_id,
        file,
      });
      let url: string | null = null;
      if (file) {
        url = URL.createObjectURL(file);
        objectUrls.current.push(url);
      } else {
        url = attachmentUrl(res, project.baseUrl);
      }
      if (url) {
        const key = String(target.id);
        const next = url;
        setShots((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { url: next }] }));
      }
      toast.success("Screenshot attached to test run");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(false);
    }
  }

  async function captureScreen() {
    try {
      const file = await captureDisplayScreenshot();
      if (file) await attach(file);
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "NotAllowedError" || e.name === "AbortError")
      ) {
        return;
      }
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function finish() {
    const sessionId = store.sessionId;
    if (!runId || !sessionId) return;
    setFinishing(true);
    setActionError(null);
    try {
      await mutateTestomatio(
        "runs",
        { id: runId, body: { status_event: "finish_manual" } },
        sessionId
      );
      onExit();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setFinishing(false);
    }
  }
}

export default observer(ManualRunRenderer);

function isPending(status?: string): boolean {
  return !status || status.toLowerCase() === "pending";
}

function elapsedSeconds(t?: TimerState): number {
  if (!t) return 0;
  let s = t.base;
  if (t.startedAt) s += (Date.now() - t.startedAt) / 1000;
  return Math.round(s);
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${mm}:${ss}`;
}

// Accepts `mm:ss` or plain seconds; null when the value isn't a time.
function parseClock(value: string): number | null {
  const v = value.trim();
  const clock = v.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (/^\d+$/.test(v)) return Number(v);
  return null;
}

// The event block handed to the agent when a saved verdict has evidence worth
// analyzing. One paired tag wrapping everything — the transcript replay strips
// it, so it never resurfaces as a user bubble (see AgentEventsService).
function manualRunEventBlock(input: {
  runTitle: string;
  target: TestRunRow;
  status: string;
  capture: CaptureResult;
  screenshotAttached: boolean;
}): string {
  const { runTitle, target, status, capture, screenshotAttached } = input;
  const testTitle = target.test_title ?? target.title ?? String(target.id);
  const failed = capture.failedRequests ?? [];
  const lines = [
    "<manual-run-event>",
    `The user marked manual test "${testTitle}" as ${status} in run "${runTitle}".`,
    `testrun id: ${target.id}, test id: ${target.test_id ?? "unknown"}`,
  ];
  lines.push(`Console errors captured while the test ran: ${capture.consoleErrors ?? 0}`);
  if (capture.consoleText) lines.push(capture.consoleText);
  lines.push(`Failed requests: ${failed.length}`);
  for (const r of failed) {
    lines.push(`- [${r.method}] ${r.url} => [${r.status}] ${r.statusText}`);
  }
  if (capture.tracePath) {
    lines.push(
      `Trace: ${capture.tracePath} (a Playwright trace; its .network sibling holds full request/response data)`
    );
  }
  if (screenshotAttached) lines.push("A browser screenshot was attached to the result.");
  lines.push(
    "Analyze these signals. If they point to a real problem (even on a passed test), verify against the live browser and propose a short factual note via the manual-run widget action suggest_message. Do not save or change the result yourself."
  );
  lines.push("</manual-run-event>");
  return lines.join("\n");
}

function statusBucket(status?: string): StatusBucket {
  const v = (status ?? "").toLowerCase();
  if (v === "passed") return "passed";
  if (v === "failed") return "failed";
  if (v === "skipped") return "skipped";
  return "pending";
}

function buildGroups(
  testruns: TestRunRow[],
  drafts: Record<string, Draft>,
  statusFilter: StatusBucket | null
): { suite: string; items: { t: TestRunRow; i: number }[] }[] {
  const order: string[] = [];
  const bySuite = new Map<string, { t: TestRunRow; i: number }[]>();
  for (let i = 0; i < testruns.length; i++) {
    const t = testruns[i];
    const draft = drafts[String(t.id)];
    const status = draft?.status ?? t.status;
    if (statusFilter && statusBucket(status) !== statusFilter) continue;
    const suite = t.suite_title ?? "—";
    if (!bySuite.has(suite)) {
      bySuite.set(suite, []);
      order.push(suite);
    }
    bySuite.get(suite)!.push({ t, i });
  }
  return order.map((suite) => ({ suite, items: bySuite.get(suite)! }));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

// Dig a displayable image URL out of the upstream attachment response (its exact
// shape varies), absolutized against the project base URL when it's relative.
function attachmentUrl(res: unknown, base: string): string | null {
  const root = (res as { attachment?: unknown })?.attachment;
  const candidates = [root, (root as { data?: unknown })?.data];
  for (const v of candidates) {
    if (typeof v === "string") return absolutize(v, base);
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    for (const key of ["url", "file", "link", "download_url", "preview"]) {
      if (typeof o[key] === "string") return absolutize(o[key] as string, base);
    }
  }
  return null;
}

function absolutize(url: string, base: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

interface ManualRunData {
  id?: string;
  title?: string;
  clean_title?: string;
  status?: string;
  kind?: string;
  tests_count?: number;
  passed_count?: number;
  failed_count?: number;
  skipped_count?: number;
  pending_count?: number;
}

interface TestRunRow {
  id?: string | number;
  test_id?: string;
  test_title?: string;
  title?: string;
  suite_title?: string;
  status?: string;
  message?: string | null;
  run_time?: number;
  automated?: boolean;
}

interface TestDetail {
  description?: string;
}

interface Draft {
  status: string;
  message: string;
}

interface TimerState {
  base: number;
  startedAt: number | null;
}

interface Shot {
  url: string;
}

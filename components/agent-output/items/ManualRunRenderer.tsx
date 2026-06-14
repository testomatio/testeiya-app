"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
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
import { mdiOpenInNew } from "@mdi/js";
import {
  ArrowLeftIcon,
  CameraIcon,
  ChevronDownIcon,
  MonitorIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react";
import { MdiIcon } from "@/components/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
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
  mutateTestomatio,
  uploadTestRunAttachment,
  useTestomatio,
} from "@/lib/agent-output/use-testomatio";
import {
  useBrowserService,
  useProjectService,
  useStores,
} from "@/lib/services/StoreProvider";
import { captureDisplayScreenshot } from "@/lib/screenshot";
import { openExternalUrl } from "@/lib/testomatio-url";
import { cn } from "@/lib/utils";
import { ListPager } from "../list-row";
import { RunProgress, RunStatusDot } from "../status-pill";
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
}: {
  data: Record<string, unknown>;
  onExit: () => void;
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

  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [statusFilter, setStatusFilter] = useState<StatusBucket | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shots, setShots] = useState<Record<string, Shot[]>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const [leftPct, setLeftPct] = useState(50);

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

  const { data: testDetail, loading: stepsLoading } = useTestomatio<TestDetail>(
    "tests",
    { id: currentTestId },
    { skip: !currentTestId }
  );
  const stepsBody = testDetail?.description ?? undefined;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
              <MdiIcon path={mdiOpenInNew} className="size-3.5" />
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
                    <button
                      key={f.value}
                      type="button"
                      title={`${f.label} (${filterCounts[f.value]})`}
                      onClick={() => setStatusFilter(active ? null : f.value)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs",
                        active ? "border-primary bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      <RunStatusDot status={f.value} />
                      <span className="tabular-nums text-muted-foreground">
                        {filterCounts[f.value]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
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
                      <button
                        key={t.id ?? i}
                        ref={i === index ? activeRowRef : undefined}
                        type="button"
                        onClick={() => setIndex(i)}
                        className={cn(
                          "flex w-full scroll-mt-8 items-center gap-2 border-l-2 px-2 py-1.5 text-left text-sm",
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
                        <RunStatusDot status={d?.status ?? t.status} />
                      </button>
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
                    <Streamdown plugins={STREAMDOWN_PLUGINS}>
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

  async function save(advance: boolean, statusOverride?: string) {
    const sessionId = store.sessionId;
    if (saving || !current || !draft || !runId || !sessionId) return;
    const status = statusOverride ?? draft.status;
    if (statusOverride) setStatus(statusOverride);
    setSaving(true);
    setActionError(null);
    try {
      await mutateTestomatio(
        "testruns",
        {
          id: current.id as string | number,
          body: {
            run_id: runId,
            status,
            message: draft.message,
          },
        },
        sessionId
      );
      if (advance) goNext();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function attach(file?: File) {
    const sessionId = store.sessionId;
    if (attaching || !current || !sessionId) return;
    setAttaching(true);
    setActionError(null);
    try {
      const res = await uploadTestRunAttachment({
        sessionId,
        testrunId: current.id,
        runId,
        testId: current.test_id,
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
        const key = String(current.id);
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

interface Shot {
  url: string;
}

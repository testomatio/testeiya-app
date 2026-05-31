"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  KeyRoundIcon,
  SearchIcon,
} from "lucide-react";
import {
  getAuthState,
  readCachedAuthState,
  connectTestomatio,
  logoutTestomatio,
  createProjectSession,
  openExternalUrl,
  buildSignInUrl,
  DEFAULT_BASE_URL,
  type TestomatioProject,
} from "@/lib/testomatio-auth";

type Phase = "loading" | "signin" | "projects";

export interface TestomatioLoginProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the sessionId once a project session is created. */
  onSession: (sessionId: string) => void;
}

/**
 * Testomat.io connect dialog. Opened on demand (from the empty state or the
 * header) — it never blocks app startup. Paste an app JWT, pick a project;
 * picking creates an agent session (pulls tests + wires the Testomat.io MCP)
 * and hands the sessionId back so the chat takes over.
 */
export function TestomatioLogin({ open, onOpenChange, onSession }: TestomatioLoginProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<TestomatioProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The previously-opened project (remembered across launches), if still present. */
  const [rememberedId, setRememberedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** True while a background revalidation runs over cached (stale) projects. */
  const [refreshing, setRefreshing] = useState(false);

  const showProjects = useCallback(
    (list: TestomatioProject[], selected?: string) => {
      setProjects(list);
      setSelectedId(selected ?? list[0]?.id ?? null);
      if (selected) setRememberedId(selected);
      setPhase("projects");
    },
    []
  );

  // Probe stored auth each time the dialog opens. Seed instantly from the
  // cached project list (stale-while-revalidate) so a large account doesn't
  // show a 10s spinner, then refresh in the background.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setQuery("");

    const cached = readCachedAuthState();
    const hasCache = !!cached?.projects && cached.projects.length > 0;
    if (hasCache) {
      if (cached!.baseUrl) setBaseUrl(cached!.baseUrl);
      showProjects(cached!.projects!, cached!.selectedProjectId);
      setRefreshing(true);
    } else {
      setPhase("loading");
    }

    getAuthState()
      .then((state) => {
        if (cancelled) return;
        if (state.baseUrl) setBaseUrl(state.baseUrl);
        if (state.rejected) {
          setError("Your previous Testomat.io token was rejected. Please reconnect.");
        }
        if (state.connected && state.projects && state.projects.length > 0) {
          showProjects(state.projects, state.selectedProjectId);
        } else if (!state.connected) {
          setPhase("signin");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep showing cached projects on a transient failure; only fall back to
        // the sign-in step when we have nothing to show.
        if (!hasCache) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("signin");
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, showProjects]);

  // Filter by the search query, then float the remembered project to the top.
  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? projects.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            (p.framework?.toLowerCase().includes(q) ?? false)
        )
      : projects;
    if (!rememberedId) return matched;
    const idx = matched.findIndex((p) => p.id === rememberedId);
    if (idx <= 0) return matched;
    return [matched[idx], ...matched.slice(0, idx), ...matched.slice(idx + 1)];
  }, [projects, query, rememberedId]);

  const handleOpenSignIn = useCallback(() => {
    void openExternalUrl(buildSignInUrl(baseUrl));
  }, [baseUrl]);

  const handleConnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const state = await connectTestomatio(token.trim(), baseUrl || undefined);
      if (!state.projects || state.projects.length === 0) {
        setError(
          "No projects are available for this account. Create one in Testomat.io, then reconnect."
        );
        return;
      }
      showProjects(state.projects, state.selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [token, baseUrl, showProjects]);

  const handleContinue = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    setBusy(true);
    try {
      const { sessionId } = await createProjectSession(selectedId);
      onSession(sessionId);
      onOpenChange(false); // close the dialog once the session is ready
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [selectedId, onSession, onOpenChange]);

  const handleUseDifferentToken = useCallback(async () => {
    setBusy(true);
    try {
      await logoutTestomatio();
    } finally {
      setToken("");
      setProjects([]);
      setSelectedId(null);
      setError(null);
      setBusy(false);
      setPhase("signin");
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            Connect to Testomat.io
          </DialogTitle>
          <DialogDescription>
            {phase === "projects"
              ? "Choose the project TestClaw should work with."
              : "Authorize TestClaw to load your projects and work with your tests."}
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0 so this grid item can shrink — without it the long project
            slugs blow the dialog width out past its right edge. */}
        <div className="min-w-0 space-y-4">
          {phase === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" /> Checking connection…
            </div>
          )}

          {phase === "signin" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleOpenSignIn}
              >
                Open Testomat.io &amp; authorize
                <ArrowUpRightIcon className="size-4" />
              </Button>

              <div className="space-y-1.5">
                <label htmlFor="tio-token" className="text-sm font-medium">
                  Paste your authorization token
                </label>
                <Input
                  id="tio-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && token.trim() && !busy) {
                      void handleConnect();
                    }
                  }}
                  placeholder="eyJ…"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  After signing in, click <span className="font-medium">Authorize</span>,
                  copy the token, and paste it here.
                </p>
              </div>
            </>
          )}

          {phase === "projects" && (
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleUseDifferentToken}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <ChevronLeftIcon className="size-3.5" /> Use a different token
                </button>
                {refreshing && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Spinner className="size-3" /> Refreshing…
                  </span>
                )}
              </div>

              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${projects.length} projects…`}
                  autoComplete="off"
                  spellCheck={false}
                  className="pl-8 text-sm"
                />
              </div>

              <div className="max-h-64 min-w-0 space-y-1.5 overflow-y-auto overflow-x-hidden">
                {visibleProjects.length === 0 && (
                  <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                    No projects match “{query}”.
                  </p>
                )}
                {visibleProjects.map((p) => {
                  const active = p.id === selectedId;
                  const remembered = p.id === rememberedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{p.title}</span>
                          {remembered && (
                            <span className="shrink-0 rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                              last used
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.id}
                          {p.framework ? ` · ${p.framework}` : ""}
                          {typeof p.testsCount === "number"
                            ? ` · ${p.testsCount} ${p.testsCount === 1 ? "test" : "tests"}`
                            : ""}
                        </span>
                      </span>
                      {active && <CheckIcon className="size-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {phase === "signin" && (
            <Button
              className="w-full"
              disabled={!token.trim() || busy}
              onClick={() => void handleConnect()}
            >
              {busy ? <Spinner className="size-4" /> : null}
              Connect
            </Button>
          )}
          {phase === "projects" && (
            <Button
              className="w-full"
              disabled={!selectedId || busy}
              onClick={() => void handleContinue()}
            >
              {busy ? <Spinner className="size-4" /> : null}
              {busy ? "Loading project…" : "Open project"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

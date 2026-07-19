"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Dialog,
  DialogBody,
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
} from "@/lib/icons";
import { useProjectService } from "@/lib/services/StoreProvider";

type Phase = "loading" | "signin" | "projects";

export interface TestomatioLoginProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Testomat.io connect dialog — a thin view over ProjectService. Paste an app
 * JWT, pick a project; picking calls `selectProject` (which creates the agent
 * session and navigates). Seeds instantly from the service's cached state and
 * revalidates in the background.
 */
export const TestomatioLogin = observer(function TestomatioLogin({
  open,
  onOpenChange,
}: TestomatioLoginProps) {
  const project = useProjectService();
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState("");
  const [host, setHost] = useState(project.baseUrl);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** True while a background revalidation runs over cached (stale) projects. */
  const [refreshing, setRefreshing] = useState(false);

  // Probe stored auth each time the dialog opens. Seed instantly from the
  // service's cached state (stale-while-revalidate), then refresh.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setQuery("");

    const hadProjects = project.connected && project.projects.length > 0;
    if (hadProjects) {
      setPhase("projects");
      setSelectedId(project.selectedProjectId ?? project.projects[0]?.id ?? null);
      setRefreshing(true);
    } else {
      setPhase("loading");
    }

    project
      .refreshStatus()
      .then((state) => {
        if (cancelled) return;
        if (state.rejected) {
          setError("Your previous Testomat.io token was rejected. Please reconnect.");
        }
        if (state.connected && state.projects && state.projects.length > 0) {
          setPhase("projects");
          setSelectedId(
            (prev) => prev ?? state.selectedProjectId ?? state.projects![0].id
          );
        } else if (!state.connected) {
          setPhase("signin");
        } else {
          setError(
            "No projects are available for this account. Create one in Testomat.io, then reconnect."
          );
          setPhase("signin");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep showing cached projects on a transient failure; only fall back
        // to the sign-in step when we have nothing to show.
        if (!hadProjects) {
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
  }, [open, project]);

  // Re-seed the host field from the service whenever the effective host changes
  // (e.g. after a save) — never on each keystroke, so user input isn't clobbered.
  useEffect(() => {
    setHost(project.baseUrl);
  }, [project.baseUrl]);

  const rememberedId = project.selectedProjectId;

  // Filter by the search query, then float the remembered project to the top.
  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = project.projects;
    const matched = q
      ? list.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            (p.framework?.toLowerCase().includes(q) ?? false)
        )
      : list;
    if (!rememberedId) return matched;
    const idx = matched.findIndex((p) => p.id === rememberedId);
    if (idx <= 0) return matched;
    return [matched[idx], ...matched.slice(0, idx), ...matched.slice(idx + 1)];
  }, [project.projects, query, rememberedId]);

  const handleOpenSignIn = useCallback(async () => {
    await project.setHost(host);
    project.openSignIn();
  }, [project, host]);

  const handleConnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await project.setHost(host);
      const state = await project.connect(token.trim());
      if (!state.projects || state.projects.length === 0) {
        setError(
          "No projects are available for this account. Create one in Testomat.io, then reconnect."
        );
        return;
      }
      setPhase("projects");
      setSelectedId(state.selectedProjectId ?? state.projects[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [project, token, host]);

  const handleContinue = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    setBusy(true);
    try {
      await project.selectProject(selectedId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [selectedId, project, onOpenChange]);

  const handleUseDifferentToken = useCallback(async () => {
    setBusy(true);
    try {
      await project.disconnect();
    } finally {
      setToken("");
      setSelectedId(null);
      setError(null);
      setBusy(false);
      setPhase("signin");
    }
  }, [project]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            Connect to Testomat.io
          </DialogTitle>
          <DialogDescription>
            {phase === "projects"
              ? "Choose the project Testeiya should work with."
              : "Authorize Testeiya to load your projects and work with your tests."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-w-0 space-y-4">
          {phase === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" /> Checking connection…
            </div>
          )}

          {phase === "signin" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="tio-host" className="text-sm font-medium">
                  Testomat.io host
                </label>
                <Input
                  id="tio-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="https://app.testomat.io"
                  autoComplete="off"
                  spellCheck={false}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Change this only for a self-hosted Testomat.io instance.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleOpenSignIn()}
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
                  placeholder={`Search ${project.projects.length} projects…`}
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
        </DialogBody>

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
});

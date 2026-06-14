"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LogInIcon,
  LogOutIcon,
  SearchIcon,
} from "@/lib/icons";
import { toast } from "sonner";
import { observer } from "mobx-react-lite";
import { providerLogo } from "@/lib/provider-logos";
import { useProvidersService } from "@/lib/services/StoreProvider";
import type { ThinkingLevel } from "@/lib/services/types";

const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

// Shown before the server's list loads (kept in sync with the SDK on the server).
const FALLBACK_THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

interface ProviderInfo {
  id: string;
  name: string;
  canLogin: boolean;
  canKey: boolean;
  defaultModel: string | null;
  configured: boolean;
  loggedIn: boolean;
  group: "subscription" | "api";
}

interface Current {
  provider: string;
  model: string;
}

type LoginStatus = "pending" | "done" | "error";
interface LoginState {
  provider: string;
  status: LoginStatus;
  authUrl?: string | null;
  instructions?: string | null;
  progress?: string | null;
  error?: string | null;
}

/**
 * Providers & Models — pick the LLM provider/model the agent uses.
 *
 * The provider list comes entirely from the SDK (`GET /api/providers`); models
 * come from live discovery (`GET /api/providers/models`). Subscriptions sign in
 * via the server-side OAuth bridge; API providers take a pasted key. Selection
 * is persisted to ~/.testeiya/config.json and applies on the next session start
 * (clear chat / reload).
 */
export const ProvidersDialog = observer(function ProvidersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const providersSvc = useProvidersService();
  const providers = providersSvc.providers;
  const current = providersSvc.current;
  const loading = providersSvc.loading;
  const login = providersSvc.login;
  const applied = providersSvc.applied;
  const { startLogin, saveKey, logout, select, submitCode, setThinkingLevel } =
    providersSvc;

  const thinkingLevels = providersSvc.thinkingLevels.length
    ? providersSvc.thinkingLevels
    : FALLBACK_THINKING_LEVELS;

  // Search + which provider is expanded are pure view state.
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setExpandedId(null);
    void providersSvc.refresh();
  }, [open, providersSvc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [providers, search]);

  const subscriptions = filtered.filter((p) => p.group === "subscription");
  const apis = filtered.filter((p) => p.group === "api");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader className="min-w-0">
          <DialogTitle>Providers &amp; Models</DialogTitle>
          <DialogDescription>
            Choose the model the agent uses. Sign in to a subscription or paste an
            API key. Changes apply when a new session starts (clear chat or reload).
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3 min-w-0">
        {applied && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm min-w-0">
            <span className="min-w-0">
              Now using{" "}
              <span className="font-medium">
                {applied.provider} / {applied.model}
              </span>
              . Reload to start the session with it.
            </span>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        )}

        {current && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm min-w-0">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-mono truncate">
              {current.provider} / {current.model}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium">Thinking</p>
            <p className="text-[11px] text-muted-foreground">
              Reasoning effort streamed as the thinking block. Needs a
              reasoning-capable model; applies on next session.
            </p>
          </div>
          <Select
            value={providersSvc.thinkingLevel ?? undefined}
            onValueChange={(v) => v && void setThinkingLevel(v as ThinkingLevel)}
          >
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {thinkingLevels.map((lvl) => (
                <SelectItem key={lvl} value={lvl}>
                  {THINKING_LEVEL_LABELS[lvl] ?? lvl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search providers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-xs">
            <Spinner className="size-3" /> Loading providers…
          </div>
        ) : (
          <div className="space-y-4 min-w-0">
            <ProviderGroup
              title="Subscriptions"
              hint="Sign in with your browser"
              providers={subscriptions}
              current={current}
              expandedId={expandedId}
              onToggleExpand={(id) =>
                setExpandedId((prev) => (prev === id ? null : id))
              }
              login={login}
              onLogin={startLogin}
              onSaveKey={saveKey}
              onLogout={logout}
              onSelect={select}
              onSubmitCode={submitCode}
            />
            <ProviderGroup
              title="API providers"
              hint="Paste an API key"
              providers={apis}
              current={current}
              expandedId={expandedId}
              onToggleExpand={(id) =>
                setExpandedId((prev) => (prev === id ? null : id))
              }
              login={login}
              onLogin={startLogin}
              onSaveKey={saveKey}
              onLogout={logout}
              onSelect={select}
              onSubmitCode={submitCode}
            />
            {filtered.length === 0 && (
              <p className="py-2 text-muted-foreground text-xs">
                No providers match “{search}”.
              </p>
            )}
          </div>
        )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

function ProviderGroup({
  title,
  hint,
  providers,
  current,
  expandedId,
  onToggleExpand,
  login,
  onLogin,
  onSaveKey,
  onLogout,
  onSelect,
  onSubmitCode,
}: {
  title: string;
  hint: string;
  providers: ProviderInfo[];
  current: Current | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  login: LoginState | null;
  onLogin: (provider: string) => void;
  onSaveKey: (provider: string, apiKey: string) => Promise<void>;
  onLogout: (provider: string) => Promise<void>;
  onSelect: (provider: string, model: string) => Promise<void>;
  onSubmitCode: (provider: string, code: string) => Promise<void>;
}) {
  if (providers.length === 0) return null;
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <ul className="space-y-1.5">
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            current={current}
            expanded={expandedId === p.id}
            onToggleExpand={() => onToggleExpand(p.id)}
            login={login?.provider === p.id ? login : null}
            onLogin={() => onLogin(p.id)}
            onSaveKey={onSaveKey}
            onLogout={onLogout}
            onSelect={onSelect}
            onSubmitCode={onSubmitCode}
          />
        ))}
      </ul>
    </div>
  );
}

const ProviderRow = observer(function ProviderRow({
  provider: p,
  current,
  expanded,
  onToggleExpand,
  login,
  onLogin,
  onSaveKey,
  onLogout,
  onSelect,
  onSubmitCode,
}: {
  provider: ProviderInfo;
  current: Current | null;
  expanded: boolean;
  onToggleExpand: () => void;
  login: LoginState | null;
  onLogin: () => void;
  onSaveKey: (provider: string, apiKey: string) => Promise<void>;
  onLogout: (provider: string) => Promise<void>;
  onSelect: (provider: string, model: string) => Promise<void>;
  onSubmitCode: (provider: string, code: string) => Promise<void>;
}) {
  const providers = useProvidersService();
  const isActive = current?.provider === p.id;
  const hasCredential = p.configured || p.loggedIn;

  const models = providers.modelsFor(p.id);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selModel, setSelModel] = useState<string>("");
  const [modelOpen, setModelOpen] = useState(false);
  const [keyVal, setKeyVal] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [using, setUsing] = useState(false);
  const [codeVal, setCodeVal] = useState("");

  // Load this provider's models from live discovery when expanded (via service).
  useEffect(() => {
    if (!expanded || !hasCredential) return;
    let active = true;
    setModelsLoading(true);
    providers
      .loadModels(p.id)
      .then((list) => {
        if (!active) return;
        const preferred = isActive && current ? current.model : p.defaultModel;
        const chosen =
          preferred && list.some((m) => m.id === preferred)
            ? preferred
            : list[0]?.id ?? "";
        setSelModel(chosen);
      })
      .catch(() => {})
      .finally(() => active && setModelsLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hasCredential, p.id]);

  const statusBadge = isActive ? (
    <Badge className="text-[10px] shrink-0">Active</Badge>
  ) : p.loggedIn ? (
    <Badge variant="secondary" className="text-[10px] shrink-0">
      Signed in
    </Badge>
  ) : p.configured ? (
    <Badge variant="secondary" className="text-[10px] shrink-0">
      Key set
    </Badge>
  ) : null;

  const handleSaveKey = async () => {
    const key = keyVal.trim();
    if (!key) return;
    setSavingKey(true);
    try {
      await onSaveKey(p.id, key);
      setKeyVal("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSavingKey(false);
    }
  };

  const handleUse = async () => {
    if (!selModel) return;
    setUsing(true);
    try {
      await onSelect(p.id, selModel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to select model");
    } finally {
      setUsing(false);
    }
  };

  return (
    <li className="rounded-md border min-w-0">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left min-w-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={providerLogo(p.id)} alt="" aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
        {statusBadge}
        {expanded ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-3 py-3 min-w-0">
          {/* Sign-in (subscriptions) */}
          {p.canLogin && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={p.loggedIn ? "outline" : "default"}
                  disabled={login?.status === "pending"}
                  onClick={onLogin}
                >
                  {login?.status === "pending" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <LogInIcon className="size-3.5" />
                  )}
                  {p.loggedIn ? "Re-authenticate" : "Log in"}
                </Button>
                {p.loggedIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => void onLogout(p.id)}
                  >
                    <LogOutIcon className="size-3.5" /> Sign out
                  </Button>
                )}
              </div>
              {login && login.status === "pending" && (
                <div className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Spinner className="size-3" />
                    {login.progress || "Waiting for authorization in your browser…"}
                  </div>
                  {login.instructions && (
                    <div className="font-medium text-foreground">
                      {login.instructions}
                    </div>
                  )}
                  {login.authUrl && (
                    <a
                      href={login.authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLinkIcon className="size-3" /> Open sign-in page
                    </a>
                  )}
                  <details className="pt-1">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      Didn&apos;t redirect back? Paste the code or URL
                    </summary>
                    <div className="flex gap-2 pt-1.5">
                      <Input
                        placeholder="code or http://localhost:…/callback?code=…"
                        value={codeVal}
                        onChange={(e) => setCodeVal(e.target.value)}
                        className="h-7 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!codeVal.trim()}
                        onClick={() => {
                          void onSubmitCode(p.id, codeVal.trim());
                          setCodeVal("");
                        }}
                      >
                        Submit
                      </Button>
                    </div>
                  </details>
                </div>
              )}
              {login && login.status === "error" && (
                <p className="text-xs text-destructive">
                  {login.error || "Sign-in failed."}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Opens a browser sign-in. Works in the desktop app or local browser.
              </p>
            </div>
          )}

          {/* API key */}
          {p.canKey && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                {p.configured ? "Update API key" : "API key"}
              </label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={`${p.name} API key`}
                  value={keyVal}
                  onChange={(e) => setKeyVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSaveKey();
                  }}
                />
                <Button
                  onClick={() => void handleSaveKey()}
                  disabled={!keyVal.trim() || savingKey}
                >
                  {savingKey ? <Spinner className="size-3.5" /> : null}
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Model selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Model</label>
            {!hasCredential ? (
              <p className="text-[11px] text-muted-foreground">
                {p.canLogin ? "Sign in" : "Add a key"} to choose a model.
              </p>
            ) : modelsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Spinner className="size-3" /> Loading models…
              </div>
            ) : models.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No models found for this provider.
              </p>
            ) : (
              <div className="flex gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <Popover open={modelOpen} onOpenChange={setModelOpen}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          role="combobox"
                          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 flex items-center justify-between"
                        />
                      }
                    >
                      <span className="truncate text-left">
                        {selModel
                          ? (models.find((m) => m.id === selModel)?.name ?? selModel)
                          : <span className="text-muted-foreground">Select model…</span>}
                      </span>
                      <ChevronDownIcon className="ml-2 size-4 shrink-0 text-muted-foreground" />
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search model…" autoFocus />
                        <CommandList className="max-h-60">
                          <CommandEmpty>No model found.</CommandEmpty>
                          {models.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={m.name}
                              onSelect={() => {
                                setSelModel(m.id);
                                setModelOpen(false);
                              }}
                            >
                              {m.name}
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <Button
                  onClick={() => void handleUse()}
                  disabled={!selModel || using || (isActive && selModel === current?.model)}
                >
                  {using ? <Spinner className="size-3.5" /> : null}
                  Use
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
});

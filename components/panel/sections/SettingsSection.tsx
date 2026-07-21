"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ChevronDownIcon, LogInIcon, LogOutIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SectionShell } from "../SectionShell";
import {
  useDebugLogService,
  useMemoryService,
  useProjectService,
  useProvidersService,
} from "@/lib/services/StoreProvider";
import type { PanelSectionProps } from "@/lib/panel/types";
import type { EnvScope } from "@/lib/services/types";

export const SettingsSection = observer(function SettingsSection({
  active,
  onToggle,
  onOpenProviders,
  onSwitchProject,
}: PanelSectionProps) {
  const debug = useDebugLogService();
  const memory = useMemoryService();
  const project = useProjectService();
  const providers = useProvidersService();
  const [view, setView] = useState<SettingsView>("ai");
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [host, setHost] = useState(project.baseUrl);
  const [savingHost, setSavingHost] = useState(false);

  useEffect(() => {
    if (active) void memory.load();
  }, [active, memory]);

  useEffect(() => {
    if (active) void project.refreshStatus();
  }, [active, project]);

  useEffect(() => {
    if (active) void providers.refresh();
  }, [active, providers]);

  useEffect(() => {
    if (active) void providers.loadEnv();
  }, [active, providers]);

  useEffect(() => {
    setHost(project.baseUrl);
  }, [project.baseUrl]);

  const saveHost = useCallback(async () => {
    setSavingHost(true);
    try {
      await project.setHost(host);
    } finally {
      setSavingHost(false);
    }
  }, [project, host]);

  return (
    <SectionShell
      title="Settings"
      active={active}
      onToggle={onToggle}
      titleAccessory={
        <Tabs value={view} onValueChange={(v) => setView(v as SettingsView)}>
          <TabsList className="h-7">
            <TabsTrigger value="ai" className="px-2">
              AI
            </TabsTrigger>
            <TabsTrigger value="testomatio" className="px-2">
              Testomat.io
            </TabsTrigger>
            <TabsTrigger value="advanced" className="px-2">
              Advanced
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="space-y-4 p-4">
        {view === "ai" && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Model</h3>
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  {providers.current && (
                    <p className="truncate font-mono">
                      {providers.current.provider} / {providers.current.model}
                    </p>
                  )}
                  {!providers.current && (
                    <p className="text-muted-foreground">No model selected</p>
                  )}
                  {providers.thinkingLevel && (
                    <p className="text-muted-foreground text-xs">
                      Thinking: {providers.thinkingLevel}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={onOpenProviders}
                >
                  Change model…
                </Button>
              </div>
            </div>

            <div className="space-y-1 border-t pt-4">
              <h3 className="text-sm font-semibold">ENV Variables</h3>
              <Accordion>
                <AccordionItem value="global">
                  <AccordionTrigger>Global</AccordionTrigger>
                  <AccordionContent>
                    <EnvEditor
                      scope="global"
                      hint="All workspaces — saved to ~/.testeiya/.env"
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="project">
                  <AccordionTrigger>Project</AccordionTrigger>
                  <AccordionContent>
                    <EnvEditor
                      scope="project"
                      hint="This workspace only — saved to .testeiya/.env, git-ignored"
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Project memory</h3>
                  <p className="text-muted-foreground text-xs">
                    Durable facts the agent consolidates from this
                    project&apos;s past sessions and reuses later. Secret-like
                    values are redacted, so it is not a store for credentials.
                  </p>
                </div>
                <Switch
                  checked={memory.enabled}
                  onCheckedChange={(checked) => void memory.setEnabled(checked)}
                  aria-label="Enable project memory"
                />
              </div>

              {memory.enabled && (
                <Collapsible
                  open={memoryExpanded}
                  onOpenChange={setMemoryExpanded}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                      <ChevronDownIcon
                        className={cn(
                          "size-3.5 transition-transform",
                          memoryExpanded ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      View memory
                    </CollapsibleTrigger>
                    <div className="ml-auto flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={memory.busy}
                        onClick={() => void memory.rebuild()}
                      >
                        Rebuild
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={memory.busy || !memory.exists}
                        onClick={() => void memory.clear()}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="max-h-[40vh] min-h-[6rem] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
                      {memory.loading && (
                        <Shimmer as="span">Loading memory…</Shimmer>
                      )}
                      {!memory.loading && memory.error && (
                        <span className="text-destructive">{memory.error}</span>
                      )}
                      {!memory.loading && !memory.error && !memory.content && (
                        <span className="text-muted-foreground">
                          No memory yet. As you work in this project, the agent
                          consolidates durable facts here between sessions.
                        </span>
                      )}
                      {!memory.loading && memory.content && (
                        <MessageResponse>{memory.content}</MessageResponse>
                      )}
                    </div>
                  </CollapsibleContent>
                  <p className="text-muted-foreground text-xs">
                    Changes apply on the next session.
                  </p>
                </Collapsible>
              )}
            </div>
          </>
        )}

        {view === "testomatio" && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Account</h3>
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {project.connected && (
                  <>
                    <div className="min-w-0">
                      <p className="font-medium">Connected</p>
                      {project.currentProject && (
                        <p className="truncate text-muted-foreground text-xs">
                          Project: {project.currentProject.title}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void project.disconnect()}
                    >
                      <LogOutIcon className="size-3.5" />
                      Log out
                    </Button>
                  </>
                )}
                {!project.connected && (
                  <>
                    <p className="text-muted-foreground">Not connected</p>
                    {onSwitchProject && (
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={onSwitchProject}
                      >
                        <LogInIcon className="size-3.5" />
                        Connect
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">Testomat.io Host</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="https://app.testomat.io"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveHost();
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button onClick={() => void saveHost()} disabled={savingHost}>
                  {savingHost && <Spinner className="size-3.5" />}
                  Save
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Point Testeiya at a self-hosted Testomat.io instance. Applies to
                sign-in and project sync.
              </p>
            </div>
          </>
        )}

        {view === "advanced" && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Debug panel</h3>
                <p className="text-muted-foreground text-xs">
                  Show a Debug section in the sidebar that logs API requests,
                  Testomat.io calls, and agent events.
                </p>
              </div>
              <Switch
                checked={debug.enabled}
                onCheckedChange={(checked) => debug.setEnabled(checked)}
                aria-label="Enable debug panel"
              />
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
});

const EnvEditor = observer(function EnvEditor({
  scope,
  hint,
}: {
  scope: EnvScope;
  hint: string;
}) {
  const providers = useProvidersService();
  let stored = providers.globalEnv;
  if (scope === "project") stored = providers.projectEnv;
  const [text, setText] = useState(stored);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(stored);
  }, [stored]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await providers.saveEnv(scope, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save env vars");
    } finally {
      setSaving(false);
    }
  }, [providers, scope, text]);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{hint}</p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        wrap="off"
        rows={6}
        className="min-h-40 overflow-auto whitespace-pre font-mono text-[11px] leading-relaxed md:text-[11px]"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Spinner className="size-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
});

type SettingsView = "ai" | "testomatio" | "advanced";

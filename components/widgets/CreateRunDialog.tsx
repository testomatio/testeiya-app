"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import { createTestomatio, useTestomatio } from "@/lib/agent-output/use-testomatio";
import { useProjectService, useStores } from "@/lib/services/StoreProvider";
import { cn } from "@/lib/utils";
import { resolveType, TypeIcon, type KindType } from "./type-icons";

const KINDS: { value: KindType; label: string; hint: string }[] = [
  { value: "manual", label: "Manual", hint: "tester walks through cases" },
  { value: "automated", label: "Automated", hint: "results reported by CI" },
  { value: "mixed", label: "Mixed", hint: "manual + automated tests" },
];

export interface CreateRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When launching from a plan, its tests seed the run (plan_ids). */
  plan?: { id?: string; title?: string; kind?: string };
}

/**
 * New-run form. Configures the run model (title, kind, test source, environment,
 * assign strategy, description) and creates it via `POST /api/testomatio/runs`.
 * Tests come from a plan (`plan_ids`) or — when "All tests" is chosen — from every
 * test of the run's kind (no filter). When opened with a `plan` the source is
 * pinned to that plan. On success a manual run opens straight into the guided
 * executor; automated/mixed land on the Runs list. A thin view over ProjectService.
 */
export const CreateRunDialog = observer(function CreateRunDialog({
  open,
  onOpenChange,
  plan,
}: CreateRunDialogProps) {
  const store = useStores();
  const project = useProjectService();
  const fromPlanLaunch = !!plan;

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<KindType>("manual");
  const [testSource, setTestSource] = useState<TestSource>("all");
  const [planId, setPlanId] = useState("");
  const [env, setEnv] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plans for the "From a plan" picker — only fetched when that source is active.
  const plansQuery = useTestomatio<PlanRow[]>(
    "plans",
    { per_page: 100 },
    { skip: !open || fromPlanLaunch || testSource !== "plan" }
  );
  const plans = plansQuery.data ?? [];
  // Only plans whose type matches the run type can fill the run.
  const matchingPlans = plans.filter((pl) => resolveType({ kind: pl.kind }) === kind);
  const kindLabel = KINDS.find((k) => k.value === kind)?.label.toLowerCase();

  // The plans endpoint carries no test count, so count the plan's tests via the
  // tests endpoint (TQL `plan == '<id>'` → meta.total) when a plan is selected.
  const planTests = useTestomatio<unknown[]>(
    "tests",
    { query: planId ? `=plan == '${planId}'` : undefined, per_page: 1 },
    { skip: !open || fromPlanLaunch || testSource !== "plan" || !planId }
  );
  let planCountLabel: string | null = null;
  if (testSource === "plan" && planId) {
    const total = planTests.meta?.total;
    if (typeof total === "number") {
      planCountLabel = `${total} test${total === 1 ? "" : "s"} in this plan`;
    } else if (planTests.loading) {
      planCountLabel = "Loading tests…";
    }
  }

  // Seed the form from the plan (or a blank run) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle(plan?.title ?? "");
    setKind(resolveType({ kind: plan?.kind }) ?? "manual");
    setTestSource("all");
    setPlanId("");
    setEnv("");
    setDescription("");
    setBusy(false);
    setError(null);
  }, [open, plan?.id, plan?.title, plan?.kind]);

  const needsPlan = !fromPlanLaunch && testSource === "plan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="rocket_launch" className="size-4 text-muted-foreground" />
            {plan ? "Launch run from plan" : "New run"}
          </DialogTitle>
          <DialogDescription>
            {plan
              ? "Create a run from this plan's tests and configure how it runs."
              : "Create a run, choose which tests fill it, and configure how it runs."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-w-0 space-y-4">
          {plan && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <Icon name="assignment" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">
                Launching from plan{" "}
                <span className="font-medium">{plan.title ?? plan.id}</span>
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="run-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="run-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim() && !busy) void handleCreate();
              }}
              placeholder="e.g. Smoke run"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Type</span>
            <Select
              value={kind}
              onValueChange={(v) => {
                if (!v) return;
                setKind(v as KindType);
                setPlanId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    <TypeIcon type={k.value} />
                    <span className="flex flex-col">
                      <span>{k.label}</span>
                      <span className="text-xs text-muted-foreground">{k.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!fromPlanLaunch && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Tests</span>
              <div className="grid grid-cols-2 gap-2">
                <SourceTile
                  active={testSource === "all"}
                  icon="select_all"
                  label="All tests"
                  hint={`every ${KINDS.find((k) => k.value === kind)?.label.toLowerCase()} test`}
                  onClick={() => setTestSource("all")}
                />
                <SourceTile
                  active={testSource === "plan"}
                  icon="assignment"
                  label="From a plan"
                  hint="tests in a plan"
                  onClick={() => setTestSource("plan")}
                />
              </div>
              {testSource === "plan" && (
                <Select
                  value={planId}
                  onValueChange={(v) => v && setPlanId(v)}
                  disabled={plansQuery.loading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value) => {
                        if (!value) {
                          return plansQuery.loading ? "Loading plans…" : "Select a plan…";
                        }
                        const pl = matchingPlans.find((p) => String(p.id) === value);
                        if (!pl) return String(value);
                        return (
                          <>
                            <TypeIcon type={kind} />
                            <span className="truncate">{pl.title ?? pl.id}</span>
                          </>
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {matchingPlans.map((pl) => (
                      <SelectItem key={pl.id} value={String(pl.id)}>
                        <TypeIcon type={kind} />
                        <span className="truncate">{pl.title ?? pl.id}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {planCountLabel && (
                <p className="text-xs text-muted-foreground">{planCountLabel}</p>
              )}
              {testSource === "plan" &&
                !plansQuery.loading &&
                matchingPlans.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No {kindLabel} plans in this project yet.
                  </p>
                )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="run-env" className="text-sm font-medium">
              Environment
            </label>
            <Input
              id="run-env"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder="optional"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="run-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="run-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="optional"
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || busy || (needsPlan && !planId)}
            onClick={() => void handleCreate()}
          >
            {busy ? <Spinner className="size-4" /> : <Icon name="rocket_launch" className="size-4" />}
            {plan ? "Launch run" : "Create run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  async function handleCreate() {
    const sessionId = store.sessionId;
    if (!sessionId || !title.trim() || busy) return;
    setBusy(true);
    setError(null);
    // Create unassigned — the API otherwise defaults to assigning the creator.
    const payload: Record<string, unknown> = {
      title: title.trim(),
      kind,
      assign_strategy: "none",
    };
    if (description.trim()) payload.description = description.trim();
    if (env.trim()) payload.env = env.trim();
    if (plan?.id) payload.plan_ids = [String(plan.id)];
    if (needsPlan && planId) payload.plan_ids = [planId];
    try {
      const created = await createTestomatio<CreatedRun>("runs", payload, sessionId);
      toast.success("Run created");
      onOpenChange(false);
      const run = { ...created, kind };
      if (kind === "manual" && created?.id) {
        project.startManualRun(run);
        return;
      }
      project.showResource("runs");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
});

function SourceTile({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
      )}
    >
      <Icon name={icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{label}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

type TestSource = "all" | "plan";

interface PlanRow {
  id?: string;
  title?: string;
  kind?: string;
}

interface CreatedRun {
  id?: string;
  title?: string;
  kind?: string;
}

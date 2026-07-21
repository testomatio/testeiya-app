"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/lib/icons";
import { ProjectGlyph } from "@/components/icons";
import { cn } from "@/lib/utils";
import { SectionShell } from "../SectionShell";
import { TestomatioLogin } from "@/components/TestomatioLogin";
import { useProjectService } from "@/lib/services/StoreProvider";
import { useProjectFilterOptions } from "@/lib/data-browse/use-filter-options";
import type { PanelSectionProps } from "@/lib/panel/types";

/**
 * Project service view — the Testomat.io project the active session is open on:
 * title (opens the project), and Tests / Runs counts (open their pages). All
 * data + links come from ProjectService; this is a thin observer.
 */
export const ProjectSection = observer(function ProjectSection({
  active,
  onToggle,
  initializing,
}: PanelSectionProps) {
  const project = useProjectService();
  const [authOpen, setAuthOpen] = useState(false);
  const current = project.currentProject;
  const links = project.currentLinks;
  const info = project.projectInfo;
  // `/info` carries the counts, but it fails on some projects; labels have
  // their own endpoint, so this one stays real instead of falling back to a dash.
  const { labels } = useProjectFilterOptions();
  let labelCount: number | null = null;
  if (info || labels.length) labelCount = labels.length;

  return (
    <SectionShell
      title="Project"
      active={active}
      onToggle={onToggle}
    >
      {initializing ? (
        <ProjectSkeleton />
      ) : current && links ? (
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => project.openExternal(links.project)}
              title="Open project in Testomat.io"
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:text-primary"
            >
              <ProjectGlyph className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">{current.title}</span>
              <Icon
                name="open_in_new"
                className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="size-7 shrink-0 p-0 text-muted-foreground"
              onClick={() => project.refresh()}
              title="Refresh"
              aria-label="Refresh"
            >
              <Icon name="refresh" className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <StatTile
              icon="science"
              label="Tests"
              count={current.testsCount}
              loading={project.countsLoading}
              active={project.openResource === "tests"}
              onClick={() => project.showResource("tests")}
            />
            <StatTile
              icon="play_circle"
              label="Runs"
              count={current.runsCount}
              loading={project.countsLoading}
              active={project.openResource === "runs"}
              onClick={() => project.showResource("runs")}
            />
            <StatTile
              icon="assignment"
              label="Plans"
              count={current.plansCount}
              loading={project.countsLoading}
              active={project.openResource === "plans"}
              onClick={() => project.showResource("plans")}
            />
            <StatTile
              icon="rule"
              label="Requirements"
              count={current.requirementsCount}
              loading={project.countsLoading}
              active={project.openResource === "requirements"}
              onClick={() => project.showResource("requirements")}
            />
            <StatTile
              icon="label"
              label="Labels"
              count={labelCount}
              loading={project.countsLoading}
              active={project.openResource === "labels"}
              onClick={() => project.showResource("labels")}
            />
            <StatTile
              icon="sell"
              label="Tags"
              count={info ? (info.tags?.length ?? 0) : null}
              loading={project.countsLoading}
              active={project.openResource === "tags"}
              onClick={() => project.showResource("tags")}
            />
            <StatTile
              icon="cloud"
              label="Environments"
              count={info ? (info.environments?.length ?? 0) : null}
              loading={project.countsLoading}
              active={project.openResource === "environments"}
              onClick={() => project.showResource("environments")}
            />
            <StatTile
              icon="rocket_launch"
              label="CI Profiles"
              count={info ? (info.ci_profiles?.length ?? 0) : null}
              loading={project.countsLoading}
              active={project.openResource === "ci"}
              onClick={() => project.showResource("ci")}
            />
            <StatTile
              icon="tune"
              label="Configuration"
              count={info ? (info.features?.length ?? 0) : null}
              loading={project.countsLoading}
              active={project.openResource === "settings"}
              onClick={() => project.showResource("settings")}
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setAuthOpen(true)}
          >
            Switch project
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={<Icon name="folder_managed" className="size-5 text-muted-foreground" />}
          title={project.connected ? "No project selected" : "Not connected"}
          description={
            project.connected
              ? "Select a Testomat.io project to load its tests into the workspace."
              : "Connect your Testomat.io account to load tests into the workspace."
          }
        >
          <Button
            size="sm"
            variant="outline"
            className="mt-1 w-full"
            onClick={() => setAuthOpen(true)}
          >
            {project.connected ? "Open a project" : "Connect a project"}
          </Button>
        </EmptyState>
      )}

      <TestomatioLogin open={authOpen} onOpenChange={setAuthOpen} />
    </SectionShell>
  );
});

function ProjectSkeleton() {
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2.5">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-6 w-8" />
        </div>
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-6 w-6" />
        </div>
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2.5">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-6 w-6" />
        </div>
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-4" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function StatTile({
  icon,
  label,
  count,
  loading,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  count: number | null;
  loading: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      title={`Open ${label.toLowerCase()} in Testomat.io`}
      className={cn(
        "group flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40",
        active ? "border-primary/50 bg-primary/10" : "bg-muted/20"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon name={icon} className="size-3.5" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <Icon
          name="open_in_new"
          className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
        />
        {loading && count === null ? (
          <Skeleton className="h-6 w-10" />
        ) : (
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              active && "text-primary"
            )}
          >
            {count === null ? "—" : count.toLocaleString()}
          </span>
        )}
      </span>
    </button>
  );
}

function LinkTile({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open ${label.toLowerCase()} in Testomat.io`}
      className="group flex items-center gap-1.5 rounded-md border bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 hover:text-foreground"
    >
      <Icon name={icon} className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <Icon
        name="open_in_new"
        className="ml-auto size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}

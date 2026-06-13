"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { SectionShell } from "../SectionShell";
import { TestomatioLogin } from "@/components/TestomatioLogin";
import { useProjectService } from "@/lib/services/StoreProvider";
import type { PanelSectionProps } from "@/lib/panel/types";

/**
 * Project service view — the Testomat.io project the active session is open on:
 * title (opens the project), and Tests / Runs counts (open their pages). All
 * data + links come from ProjectService; this is a thin observer.
 */
export const ProjectSection = observer(function ProjectSection({
  active,
  onToggle,
}: PanelSectionProps) {
  const project = useProjectService();
  const [authOpen, setAuthOpen] = useState(false);
  const current = project.currentProject;
  const links = project.currentLinks;

  return (
    <SectionShell
      icon={<Icon name="folder_managed" className="size-4" />}
      title="Project"
      active={active}
      onToggle={onToggle}
    >
      {current && links ? (
        <div className="space-y-3 px-4 py-3">
          <button
            type="button"
            onClick={() => project.openExternal(links.project)}
            title="Open project in Testomat.io"
            className="group flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:text-primary"
          >
            <Icon name="folder_managed" className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">{current.title}</span>
            <Icon
              name="open_in_new"
              className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon="science"
              label="Tests"
              count={current.testsCount}
              onClick={() => project.showResource("tests")}
            />
            <StatTile
              icon="play_circle"
              label="Runs"
              count={current.runsCount}
              onClick={() => project.showResource("runs")}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon="assignment"
              label="Plans"
              count={current.plansCount}
              onClick={() => project.showResource("plans")}
            />
            <StatTile
              icon="rule"
              label="Requirements"
              count={current.requirementsCount}
              onClick={() => project.showResource("requirements")}
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
        <div className="space-y-3 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {project.connected
              ? "Select a Testomat.io project to load its tests into the workspace."
              : "Connect a Testomat.io project to load its tests into the workspace."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setAuthOpen(true)}
          >
            {project.connected ? "Open a project" : "Connect a project"}
          </Button>
        </div>
      )}

      <TestomatioLogin open={authOpen} onOpenChange={setAuthOpen} />
    </SectionShell>
  );
});

function StatTile({
  icon,
  label,
  count,
  onClick,
}: {
  icon: string;
  label: string;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open ${label.toLowerCase()} in Testomat.io`}
      className="group flex flex-col gap-1 rounded-md border bg-muted/20 px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon name={icon} className="size-3.5" />
        {label}
        <Icon
          name="open_in_new"
          className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </span>
      <span className="text-lg font-semibold tabular-nums">
        {count === null ? "—" : count.toLocaleString()}
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

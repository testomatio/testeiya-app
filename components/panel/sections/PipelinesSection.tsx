"use client";

import { MdiIcon } from "@/components/icons";
import { mdiSourceBranch } from "@mdi/js";
import { SectionShell } from "../SectionShell";
import type { PanelSectionProps } from "@/lib/panel/types";

/** Pipelines service (shell) — placeholder for an upcoming CI/CD integration. */
export function PipelinesSection({ active, onToggle }: PanelSectionProps) {
  return (
    <SectionShell
      icon={<MdiIcon path={mdiSourceBranch} className="size-4" />}
      title="Pipelines"
      active={active}
      onToggle={onToggle}
    >
      <div className="p-3">
        <p className="text-xs text-muted-foreground">
          Pipelines are coming soon.
        </p>
      </div>
    </SectionShell>
  );
}

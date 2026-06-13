"use client";

import { Icon } from "@/lib/icons";
import { SectionShell } from "../SectionShell";
import type { PanelSectionProps } from "@/lib/panel/types";

/** Pipelines service (shell) — placeholder for an upcoming CI/CD integration. */
export function PipelinesSection({ active, onToggle }: PanelSectionProps) {
  return (
    <SectionShell
      icon={<Icon name="account_tree" className="size-4" />}
      title="Pipelines"
      active={active}
      onToggle={onToggle}
    >
      <div className="px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Pipelines are coming soon.
        </p>
      </div>
    </SectionShell>
  );
}

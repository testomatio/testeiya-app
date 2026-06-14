"use client";

import { Icon } from "@/lib/icons";
import { SectionShell } from "../SectionShell";
import type { PanelSectionProps } from "@/lib/panel/types";

export function PipelinesSection({ active, onToggle, initializing: _initializing }: PanelSectionProps) {
  return (
    <SectionShell
      title="Pipelines"
      active={active}
      onToggle={onToggle}
    >
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon name="account_tree" className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Pipelines coming soon</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          CI/CD pipeline integration will appear here once it's available.
        </p>
      </div>
    </SectionShell>
  );
}

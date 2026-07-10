"use client";

import { Icon } from "@/lib/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionShell } from "../SectionShell";
import type { PanelSectionProps } from "@/lib/panel/types";

export function PipelinesSection({ active, onToggle, initializing: _initializing }: PanelSectionProps) {
  return (
    <SectionShell
      title="Pipelines"
      active={active}
      onToggle={onToggle}
    >
      <EmptyState
        icon={<Icon name="account_tree" className="size-5 text-muted-foreground" />}
        title="Pipelines coming soon"
        description="CI/CD pipeline integration will appear here once it's available."
      />
    </SectionShell>
  );
}

"use client";

import { observer } from "mobx-react-lite";
import { useProjectService } from "@/lib/services/StoreProvider";
import { cn } from "@/lib/utils";
import { FeaturesTable } from "./FeaturesTable";
import type { ProjectInfo } from "@/lib/services/types";

/*
 * Widget body for the Configuration project page, opened from its tile in the
 * Project sidebar section. Labels, Tags and Environments are browse tables now
 * (`lib/data-browse/schemas/project-info.tsx`), and so are the enabled features
 * — `/info` returns those as one flat list, so there was never a second group
 * for the accordion to hold. The facts grid below stays presentational.
 */

export const ConfigurationView = observer(function ConfigurationView() {
  const info = useProjectService().projectInfo;
  if (!info) return <ConfigEmpty />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="max-h-1/2 shrink-0 overflow-auto">
        <ConfigurationDetails info={info} />
      </div>
      <div className="min-h-0 flex-1">
        <FeaturesTable features={info.features ?? []} />
      </div>
    </div>
  );
});

export function ConfigurationDetails({ info }: { info: ProjectInfo }) {
  const facts = buildFacts(info);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 p-4">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="min-w-0 rounded-md border bg-muted/20 px-3 py-2"
        >
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {fact.label}
          </div>
          <div
            className={cn("mt-1 truncate text-sm font-medium", fact.mono && "font-mono")}
            title={fact.value}
          >
            {fact.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfigEmpty() {
  return (
    <p className="p-4 text-sm text-muted-foreground">
      Project configuration is not loaded yet.
    </p>
  );
}

function buildFacts(
  info: ProjectInfo
): { label: string; value: string; mono?: boolean }[] {
  const facts: { label: string; value: string; mono?: boolean }[] = [];
  facts.push({ label: "Title", value: info.title });
  facts.push({ label: "ID", value: info.project_id, mono: true });
  if (info.subscription) facts.push({ label: "Plan", value: info.subscription });
  if (info.framework) facts.push({ label: "Framework", value: info.framework });
  if (info.language) facts.push({ label: "Language", value: info.language });
  if (info.status) facts.push({ label: "Status", value: info.status });
  let artifacts = "Disabled";
  if (info.artifacts_storage_enabled) artifacts = "Enabled";
  facts.push({ label: "Artifacts", value: artifacts });
  if (info.repository_url) {
    facts.push({ label: "Repository", value: info.repository_url });
  }
  return facts;
}


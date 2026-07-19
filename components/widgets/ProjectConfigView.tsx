"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Icon } from "@/lib/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTestomatio } from "@/lib/agent-output/use-testomatio";
import { useProjectService } from "@/lib/services/StoreProvider";
import { cn } from "@/lib/utils";
import { LabelChip } from "./label-chip";
import type { ProjectInfo } from "@/lib/services/types";

/*
 * Widget bodies for the `/info`-backed project pages — Labels, Tags,
 * Environments, and Configuration — each opened from its own tile in the
 * Project sidebar section. The observer views read the store's projectInfo;
 * the presentational pieces below them are storied.
 */

export const LabelsView = observer(function LabelsView() {
  const project = useProjectService();
  const info = project.projectInfo;
  const { data } = useTestomatio<ProjectLabel[]>("labels", { per_page: 200 });
  if (!info) return <ConfigEmpty />;
  const labels: ProjectLabel[] =
    data ?? (info.labels ?? []).map((l) => ({ id: l.slug, title: l.title }));
  return <LabelsGrid labels={labels} />;
});

export const TagsView = observer(function TagsView() {
  const info = useProjectService().projectInfo;
  if (!info) return <ConfigEmpty />;
  return <TagChips tags={info.tags ?? []} />;
});

export const EnvironmentsView = observer(function EnvironmentsView() {
  const info = useProjectService().projectInfo;
  if (!info) return <ConfigEmpty />;
  return <EnvironmentChips environments={info.environments ?? []} />;
});

export const ConfigurationView = observer(function ConfigurationView() {
  const info = useProjectService().projectInfo;
  if (!info) return <ConfigEmpty />;
  return <ConfigurationDetails info={info} />;
});

export function LabelsGrid({ labels }: { labels: ProjectLabel[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-4">
      {labels.map((label) => (
        <LabelChip key={label.id} title={label.title} color={label.color} />
      ))}
    </div>
  );
}

export function TagChips({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 p-4">
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          @{tag}
        </span>
      ))}
    </div>
  );
}

export function EnvironmentChips({ environments }: { environments: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-4">
      {environments.map((env, i) => (
        <span
          key={`${env}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/20 px-2 py-0.5 text-xs"
        >
          <Icon name="cloud" className="size-3 text-muted-foreground" />
          {env}
        </span>
      ))}
    </div>
  );
}

export function ConfigurationDetails({ info }: { info: ProjectInfo }) {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const facts = buildFacts(info);
  const features = info.features ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="min-w-0 rounded-md border bg-muted/20 px-3 py-2"
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {fact.label}
            </div>
            <div
              className={cn("mt-1 truncate text-sm font-medium", fact.mono && "font-mono text-xs leading-5")}
              title={fact.value}
            >
              {fact.value}
            </div>
          </div>
        ))}
      </div>

      {features.length > 0 && (
        <Collapsible open={featuresOpen} onOpenChange={setFeaturesOpen}>
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-left transition-colors hover:border-primary/50"
              >
                <Icon
                  name={featuresOpen ? "keyboard_arrow_down" : "keyboard_arrow_right"}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="text-xs font-medium">Enabled features</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {features.length}
                </span>
              </button>
            }
          />
          <CollapsibleContent>
            <div className="flex flex-wrap gap-1.5 px-1 py-3">
              {features.map((feature) => (
                <span
                  key={feature}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/20 px-2 py-0.5 text-xs"
                >
                  <Icon name="check" className="size-3 text-primary" />
                  {humanize(feature)}
                </span>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
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

function humanize(slug: string): string {
  const words = slug.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ProjectLabel {
  id: string;
  title: string;
  color?: string;
  /** Where the label is displayed in Testomat.io (`filter`, `list`). */
  visibility?: string[];
  list?: boolean;
}

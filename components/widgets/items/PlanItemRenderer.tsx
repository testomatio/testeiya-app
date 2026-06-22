"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { ClipboardListIcon, Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { CreateRunDialog } from "../CreateRunDialog";
import { LabelsRow, MetaPill } from "../status-pill";
import SuitesListRenderer from "../SuitesListRenderer";
import TestsListRenderer from "../TestsListRenderer";
import { resolveType, TypeIcon } from "../type-icons";

const streamdownPlugins = { cjk, code, math, mermaid };

interface McpPlanDetail {
  id?: string;
  title?: string;
  description?: string;
  kind?: string;
  hidden?: boolean;
  tests_count?: number;
  suites_count?: number;
  runs_count?: number;
  tests?: unknown[];
  suites?: unknown[];
  labels?: unknown;
}

export default function PlanItemRenderer({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const p = data as McpPlanDetail;
  const title = p.title ?? p.id ?? "(untitled plan)";
  const tests = Array.isArray(p.tests) ? p.tests : [];
  const suites = Array.isArray(p.suites) ? p.suites : [];
  const [launchOpen, setLaunchOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {(() => {
            const kind = resolveType({ kind: p.kind });
            return kind ? (
              <TypeIcon type={kind} />
            ) : (
              <ClipboardListIcon className="size-4 text-muted-foreground" />
            );
          })()}
          <div className="text-base font-semibold">{title}</div>
          {p.id && (
            <Button
              size="sm"
              className="ml-auto h-7 gap-1 px-2 text-xs"
              onClick={() => setLaunchOpen(true)}
            >
              <Icon name="rocket_launch" className="size-3.5" />
              Launch run
            </Button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {p.hidden && (
            <MetaPill className="text-amber-600 dark:text-amber-400">
              hidden
            </MetaPill>
          )}
          {p.runs_count != null && (
            <MetaPill>
              {p.runs_count} run{p.runs_count === 1 ? "" : "s"}
            </MetaPill>
          )}
          <LabelsRow labels={p.labels} />
        </div>
      </div>

      {p.description && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Streamdown plugins={streamdownPlugins}>{p.description}</Streamdown>
        </div>
      )}

      {tests.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tests in this plan ({tests.length})
          </div>
          <TestsListRenderer json={{ data: tests }} />
        </div>
      )}

      {suites.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Suites in this plan ({suites.length})
          </div>
          <SuitesListRenderer json={{ data: suites }} />
        </div>
      )}

      {tests.length === 0 && suites.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This plan has no tests or suites attached.
        </p>
      )}

      <CreateRunDialog
        open={launchOpen}
        onOpenChange={setLaunchOpen}
        plan={{ id: p.id, title: p.title, kind: p.kind }}
      />
    </div>
  );
}

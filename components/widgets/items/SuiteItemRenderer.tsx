"use client";

import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { resizableTableComponents } from "@/components/ai-elements/resizable-table";
import { LabelsRow, MetaPill } from "../status-pill";
import { SuiteKindIcon } from "../type-icons";
import TestsListRenderer from "../TestsListRenderer";

const streamdownPlugins = { cjk, code, math, mermaid };

interface McpSuiteDetail {
  id?: string;
  title?: string;
  emoji?: string | null;
  file_type?: "file" | "folder";
  parent_id?: string | null;
  description?: string;
  tests_count?: number;
  tests_total_count?: number;
  labels?: unknown;
  tests?: unknown[];
}

export default function SuiteItemRenderer({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const s = data as McpSuiteDetail;
  const title = s.title ?? s.id ?? "(untitled suite)";
  const isFolder = s.file_type === "folder";
  const count = s.tests_total_count ?? s.tests_count;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {s.emoji ? (
            <span>{s.emoji}</span>
          ) : (
            <SuiteKindIcon
              fileType={s.file_type}
              isRoot={s.parent_id == null && isFolder}
            />
          )}
          <div className="text-base font-semibold">{title}</div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          <MetaPill>{isFolder ? "folder" : "file"}</MetaPill>
          {count != null && (
            <MetaPill>
              {count} test{count === 1 ? "" : "s"}
            </MetaPill>
          )}
          <LabelsRow labels={s.labels} />
        </div>
      </div>

      {s.description && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Streamdown
            plugins={streamdownPlugins}
            components={resizableTableComponents}
          >
            {s.description}
          </Streamdown>
        </div>
      )}

      {Array.isArray(s.tests) && s.tests.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tests
          </div>
          <TestsListRenderer json={{ data: s.tests }} />
        </div>
      )}
    </div>
  );
}

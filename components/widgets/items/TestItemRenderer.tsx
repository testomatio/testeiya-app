"use client";

import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { resizableTableComponents } from "@/components/ai-elements/resizable-table";
import type { BundledLanguage } from "shiki";
import { PriorityIcon } from "../priority-icon";
import { LabelsRow, MetaPill } from "../status-pill";
import { resolveType, TypeIcon } from "../type-icons";

const streamdownPlugins = { cjk, code, math, mermaid };

interface McpTestDetail {
  id?: string;
  title?: string;
  clean_title?: string;
  emoji?: string | null;
  suite_id?: string;
  suite_title?: string;
  suite?: { title?: string };
  priority?: string;
  state?: string;
  status?: string;
  code?: string;
  script?: string;
  body?: string;
  description?: string;
  steps_count?: number;
  runs_count?: number;
  passed_count?: number;
  failed_count?: number;
  labels?: unknown;
  tags?: unknown;
}

// Returns a Shiki language id. "text" is a valid runtime special language but
// isn't part of the `BundledLanguage` union, so callers cast at the use site.
function detectLanguage(code: string): string {
  const trimmed = code.trim();
  if (/^(Feature:|Scenario:|Given |When |Then )/m.test(trimmed)) return "gherkin";
  if (/^\s*(it|describe|test)\s*\(/m.test(trimmed)) return "javascript";
  if (/^\s*def\s+|^\s*class\s+/m.test(trimmed)) return "python";
  if (/^\s*public\s+(class|void)/m.test(trimmed)) return "java";
  return "text";
}

export default function TestItemRenderer({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const t = data as McpTestDetail;
  const title = t.title ?? t.clean_title ?? t.id ?? "(untitled test)";
  const body = t.code ?? t.script ?? t.body;
  const suite = t.suite_title ?? t.suite?.title ?? undefined;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {t.emoji ? (
            <span>{t.emoji}</span>
          ) : (() => {
            const kind = resolveType({ state: t.state });
            return kind ? <TypeIcon type={kind} /> : null;
          })()}
          <PriorityIcon priority={t.priority} />
          <div className="text-base font-semibold">{title}</div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {t.state &&
            t.state !== "manual" &&
            t.state !== "automated" && <MetaPill>{t.state}</MetaPill>}
          {suite && <MetaPill title="suite">{suite}</MetaPill>}
          {typeof t.steps_count === "number" && t.steps_count > 0 && (
            <MetaPill>
              {t.steps_count} step{t.steps_count === 1 ? "" : "s"}
            </MetaPill>
          )}
          {typeof t.runs_count === "number" && t.runs_count > 0 && (
            <MetaPill>{t.runs_count} runs</MetaPill>
          )}
          <LabelsRow labels={t.labels} />
        </div>
      </div>

      {t.description && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Streamdown
            plugins={streamdownPlugins}
            components={resizableTableComponents}
          >
            {t.description}
          </Streamdown>
        </div>
      )}

      {body && (
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Body
          </div>
          <CodeBlock code={body} language={detectLanguage(body) as BundledLanguage} />
        </div>
      )}
    </div>
  );
}

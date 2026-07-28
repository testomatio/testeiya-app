"use client";

import { useMemo } from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/widgets/list-row";
import { PriorityIcon } from "@/components/widgets/priority-icon";
import { MetaPill } from "@/components/widgets/status-pill";
import { SuiteGlyph, TypeIcon } from "@/components/icons";
import { parseSuite, type SuiteTest } from "@/lib/test-md";
import { cn } from "@/lib/utils";

export type SuiteTocProps = {
  content: string;
  /** Shown as the heading when the suite has no `#` title of its own. */
  fallbackTitle: string;
  onOpenTest: (test: SuiteTest) => void;
  className?: string;
};

export function SuiteToc({ content, fallbackTitle, onOpenTest, className }: SuiteTocProps) {
  const suite = useMemo(() => parseSuite(content), [content]);

  return (
    <div className={cn("@container h-full w-full overflow-auto", className)}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
        <header className="flex items-start gap-3">
          {suite.emoji && (
            <span className="text-2xl leading-none" aria-hidden>
              {suite.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl">{suite.title ?? fallbackTitle}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                {suite.tests.length} {pluralTests(suite.tests.length)}
              </span>
              {suite.id && <MetaPill className="font-mono">{suite.id}</MetaPill>}
              {suite.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          </div>
        </header>

        {suite.description && (
          <Streamdown className="text-sm text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {suite.description}
          </Streamdown>
        )}

        {suite.tests.length === 0 && (
          <EmptyState
            icon={<SuiteGlyph className="size-5 text-muted-foreground" />}
            title="No tests in this file"
            description="Switch to the editor to add one."
          />
        )}

        {suite.tests.length > 0 && (
          <div className="flex flex-col">
            {suite.tests.map((test, index) => (
              <ListRow key={test.id ?? `${test.title}-${index}`} onOpen={() => onOpenTest(test)}>
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <TypeIcon type={test.type} className="shrink-0" />
                <PriorityIcon priority={test.priority} />
                <span className="truncate" title={test.title}>
                  {test.title || "(untitled)"}
                </span>
                {test.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {test.id && (
                    <span className="hidden font-mono text-[10px] text-muted-foreground @[34rem]:inline">
                      {test.id}
                    </span>
                  )}
                </span>
              </ListRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <Badge
      variant="outline"
      className="h-4 shrink-0 rounded px-1 py-0 text-[10px] font-normal leading-none text-muted-foreground"
    >
      {tag}
    </Badge>
  );
}

function pluralTests(count: number): string {
  if (count === 1) return "test";
  return "tests";
}

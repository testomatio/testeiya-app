"use client";

import { observer } from "mobx-react-lite";
import { XIcon } from "@/lib/icons";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSearchService } from "@/lib/services/StoreProvider";
import type { SearchFileResult, SearchMatch } from "@/lib/services/types";

/**
 * Full-height main-area view that lists workspace search matches grouped by
 * file, each with a few lines of context. A thin `observer` over SearchService;
 * clicking a match opens the file in the editor (scrolled to the match).
 */
export const SearchResults = observer(function SearchResults({
  className,
}: {
  className?: string;
}) {
  const search = useSearchService();
  const results = search.results;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-md border bg-background",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Tooltip>
          <TooltipTrigger render={
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0"
              onClick={() => search.closeSearch()}
              aria-label="Close search"
            >
              <XIcon className="size-4" />
            </Button>
          } />
          <TooltipContent><p>Close</p></TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-sm font-medium">Search</span>
          {results?.query && (
            <span className="truncate text-xs text-muted-foreground">
              “{results.query}”
            </span>
          )}
          {results && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              · {results.totalMatches} matches in {results.totalFiles} files ·{" "}
              {results.scope === "manual" ? "manual tests" : "all files"}
              {results.truncated && " · truncated"}
            </span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {search.searching && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}
        {!search.searching && search.searchError && (
          <p className="text-sm text-destructive">{search.searchError}</p>
        )}
        {!search.searching &&
          !search.searchError &&
          results &&
          results.files.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No matches for “{results.query}”.
            </p>
          )}
        {!search.searching && !search.searchError && results && (
          <div className="flex flex-col gap-4">
            {results.files.map((file) => (
              <FileGroup
                key={file.path}
                file={file}
                onOpen={search.openResult}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function FileGroup({
  file,
  onOpen,
}: {
  file: SearchFileResult;
  onOpen: (path: string, line: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-medium">
          {basename(file.path)}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {file.path}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {file.matches.map((match, i) => (
          <button
            key={`${match.lineNumber}-${i}`}
            type="button"
            onClick={() => onOpen(file.path, match.line)}
            className="block w-full overflow-hidden rounded-md border bg-muted/30 text-left font-mono text-xs transition-colors hover:border-primary/50 hover:bg-muted/60"
          >
            <MatchLines match={match} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchLines({ match }: { match: SearchMatch }) {
  const rows = [
    ...match.before.map((c) => ({ ...c, hit: false })),
    { lineNumber: match.lineNumber, line: match.line, hit: true },
    ...match.after.map((c) => ({ ...c, hit: false })),
  ];
  return (
    <div className="divide-y divide-border/50">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-3 whitespace-pre-wrap break-words px-2 py-0.5",
            row.hit ? "bg-primary/10 text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="shrink-0 select-none tabular-nums text-muted-foreground/60">
            {row.lineNumber}
          </span>
          <span className="min-w-0 flex-1">{row.line || " "}</span>
        </div>
      ))}
    </div>
  );
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  if (i < 0) return p;
  return p.slice(i + 1);
}

"use client";

import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { FolderGlyph, SuiteGlyph } from "@/components/agent-output/type-icons";

export {
  ManualGlyph,
  AutomatedGlyph,
  MixedGlyph,
  SuiteGlyph,
  FolderGlyph,
  FolderRootGlyph,
  FileGlyph,
  DocumentationGlyph,
  ProjectGlyph,
  StepsGlyph,
  TemplatesGlyph,
  AiStarsGlyph,
  TypeIcon,
  SuiteKindIcon,
  resolveType,
} from "@/components/agent-output/type-icons";

/** Material Design glyph rendered from an `@mdi/js` path string. */
export function MdiIcon({
  path,
  className,
  title,
}: {
  path: string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("size-4", className)}
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}

const KIND_GLYPH: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  suite: FolderGlyph,
  suites: FolderGlyph,
  test: SuiteGlyph,
  tests: SuiteGlyph,
};

const KIND_SYMBOL: Record<string, string> = {
  plan: "assignment",
  plans: "assignment",
  run: "play_circle",
  runs: "bar_chart",
  testrun: "rocket_launch",
  testruns: "rocket_launch",
};

/** Maps a `render_*` kind to its brand glyph, falling back to a Material Symbol. */
export function RenderKindIcon({
  kind,
  className,
}: {
  kind?: string | null;
  className?: string;
}) {
  const k = (kind ?? "").toLowerCase();
  const Glyph = KIND_GLYPH[k];
  if (Glyph) return <Glyph className={cn("size-4", className)} />;
  return <Icon name={KIND_SYMBOL[k] ?? "draft"} className={cn("size-4", className)} />;
}

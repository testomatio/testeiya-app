"use client";

import type { ComponentType, SVGProps } from "react";
import {
  mdiChartBoxOutline,
  mdiClipboardTextOutline,
  mdiFileDocumentOutline,
  mdiPlayCircleOutline,
  mdiRocketLaunchOutline,
} from "@mdi/js";
import { cn } from "@/lib/utils";
import { FolderGlyph, SuiteGlyph } from "@/components/agent-output/type-icons";

/*
 * Single import surface for the agent's icon system. Brand glyphs (vendored
 * `currentColor` SVGs) live in `type-icons.tsx` and are re-exported here;
 * `MdiIcon` renders a Material Design path for the cases the brand set has no
 * equivalent for. Everything is inline SVG + `currentColor` so it inherits the
 * theme and survives `next export`.
 */

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

// Brand glyph per render kind (singular + plural). Suites read as folders,
// tests as brand files — matching the list renderers.
const KIND_GLYPH: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  suite: FolderGlyph,
  suites: FolderGlyph,
  test: SuiteGlyph,
  tests: SuiteGlyph,
};

// Material Design fallback per render kind (no brand equivalent).
const KIND_MDI: Record<string, string> = {
  plan: mdiClipboardTextOutline,
  plans: mdiClipboardTextOutline,
  run: mdiPlayCircleOutline,
  runs: mdiChartBoxOutline,
  testrun: mdiRocketLaunchOutline,
  testruns: mdiRocketLaunchOutline,
};

/** Maps a `render_*` kind to its brand glyph, falling back to an MDI icon. */
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
  return <MdiIcon path={KIND_MDI[k] ?? mdiFileDocumentOutline} className={className} />;
}

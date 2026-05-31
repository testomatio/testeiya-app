import type { ComponentType } from "react";

export type PanelSectionId = "workspace" | "project" | "connections" | "pipelines";

/** Props every panel section receives from the SidebarPanel container. */
export interface PanelSectionProps {
  /** Whether this section is the currently-expanded one (fills the height). */
  active: boolean;
  /** Toggle this section open/closed (single-open accordion). */
  onToggle: () => void;
}

/**
 * A sidebar "service". Each section is a self-contained module that renders its
 * own header + body (via {@link SectionShell}) given `{ active, onToggle }`.
 * The registry (`sections/registry.ts`) lists them in display order — adding a
 * new service is one entry there plus its component.
 */
export interface PanelSectionDef {
  id: PanelSectionId;
  Section: ComponentType<PanelSectionProps>;
}

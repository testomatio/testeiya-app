import type { ComponentType, ReactNode } from "react";

export type PanelSectionId =
  | "workspace"
  | "project"
  | "connections"
  | "pipelines"
  | "settings"
  | "debug";

/** Props every panel section receives from the SidebarPanel container. */
export interface PanelSectionProps {
  active: boolean;
  onToggle: () => void;
  initializing: boolean;
}

export interface PanelSectionDef {
  id: PanelSectionId;
  title: string;
  icon: ReactNode;
  Section: ComponentType<PanelSectionProps>;
}

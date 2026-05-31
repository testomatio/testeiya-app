import type { PanelSectionDef } from "@/lib/panel/types";
import { WorkspaceSection } from "./WorkspaceSection";
import { ProjectSection } from "./ProjectSection";
import { ConnectionsSection } from "./ConnectionsSection";
import { PipelinesSection } from "./PipelinesSection";

/**
 * Ordered list of sidebar services rendered by SidebarPanel. Add a new service
 * by writing its `*Section.tsx` component (using SectionShell) and appending an
 * entry here.
 */
export const PANEL_SECTIONS: PanelSectionDef[] = [
  { id: "workspace", Section: WorkspaceSection },
  { id: "project", Section: ProjectSection },
  { id: "connections", Section: ConnectionsSection },
  { id: "pipelines", Section: PipelinesSection },
];

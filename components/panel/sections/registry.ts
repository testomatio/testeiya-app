"use client";

import { createElement } from "react";
import { MdiIcon, ProjectGlyph } from "@/components/icons";
import {
  mdiFileTreeOutline,
  mdiConnection,
  mdiSourceBranch,
} from "@mdi/js";
import type { PanelSectionDef } from "@/lib/panel/types";
import { WorkspaceSection } from "./WorkspaceSection";
import { ProjectSection } from "./ProjectSection";
import { ConnectionsSection } from "./ConnectionsSection";
import { PipelinesSection } from "./PipelinesSection";

export const PANEL_SECTIONS: PanelSectionDef[] = [
  {
    id: "workspace",
    title: "Workspace",
    icon: createElement(MdiIcon, { path: mdiFileTreeOutline, className: "size-4" }),
    Section: WorkspaceSection,
  },
  {
    id: "project",
    title: "Project",
    icon: createElement(ProjectGlyph, { className: "size-4" }),
    Section: ProjectSection,
  },
  {
    id: "connections",
    title: "Connections",
    icon: createElement(MdiIcon, { path: mdiConnection, className: "size-4" }),
    Section: ConnectionsSection,
  },
  {
    id: "pipelines",
    title: "Pipelines",
    icon: createElement(MdiIcon, { path: mdiSourceBranch, className: "size-4" }),
    Section: PipelinesSection,
  },
];

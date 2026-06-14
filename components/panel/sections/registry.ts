"use client";

import { createElement } from "react";
import { Icon } from "@/lib/icons";
import type { PanelSectionDef } from "@/lib/panel/types";
import { WorkspaceSection } from "./WorkspaceSection";
import { ProjectSection } from "./ProjectSection";
import { ConnectionsSection } from "./ConnectionsSection";
import { PipelinesSection } from "./PipelinesSection";
import { SettingsSection } from "./SettingsSection";

export const PANEL_SECTIONS: PanelSectionDef[] = [
  {
    id: "workspace",
    title: "Workspace",
    icon: createElement(Icon, { name: "folder_open", className: "size-4" }),
    Section: WorkspaceSection,
  },
  {
    id: "project",
    title: "Project",
    icon: createElement(Icon, { name: "folder_managed", className: "size-4" }),
    Section: ProjectSection,
  },
  {
    id: "connections",
    title: "Connections",
    icon: createElement(Icon, { name: "linked_services", className: "size-4" }),
    Section: ConnectionsSection,
  },
  {
    id: "pipelines",
    title: "Pipelines",
    icon: createElement(Icon, { name: "account_tree", className: "size-4" }),
    Section: PipelinesSection,
  },
  {
    id: "settings",
    title: "Settings",
    icon: createElement(Icon, { name: "settings", className: "size-4" }),
    Section: SettingsSection,
  },
];

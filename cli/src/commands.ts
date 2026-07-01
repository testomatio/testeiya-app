// Slash-command extension for Testeiya.
//
// All in-session commands register through the SDK's
// `pi.registerCommand(name, { description, handler })` surface. Handlers get an
// ExtensionCommandContext with proper UI primitives (ctx.ui.select / notify /
// input / confirm), so we never have to inspect raw input shapes or fight the
// TUI by writing to stdout.
//
// Add new commands by writing a `register<Name>Command(pi)` function below and
// calling it from `createCommandsExtension()`.

import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

import {
  fetchProjects,
  loadStoredAuth,
  saveStoredAuth,
  UnauthorizedError,
  type Project,
} from "./testomatio-auth.js";

export function createCommandsExtension(): ExtensionFactory {
  return ((pi: any) => {
    registerProjectCommand(pi);
  }) as ExtensionFactory;
}

function registerProjectCommand(pi: any): void {
  pi.registerCommand("project", {
    description: "Switch the active Testomat.io project",
    async handler(_args: string, ctx: any): Promise<void> {
      const stored = loadStoredAuth();
      if (!stored?.token) {
        ctx.ui.notify(
          "No stored Testomat.io credentials. Restart testeiya to authorize.",
          "error",
        );
        return;
      }

      let projects: Project[];
      try {
        projects = await fetchProjects(stored.token, stored.baseUrl);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          ctx.ui.notify(
            "Stored Testomat.io token was rejected. Restart testeiya to re-authorize.",
            "error",
          );
          return;
        }
        ctx.ui.notify(
          `Failed to fetch projects: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        return;
      }

      if (projects.length === 0) {
        ctx.ui.notify("No Testomat.io projects available for this account.", "warning");
        return;
      }

      const labels = projects.map(formatProjectLabel);
      const picked = await ctx.ui.select("Switch Testomat.io project", labels);
      if (!picked) return; // user cancelled

      const idx = labels.indexOf(picked);
      if (idx < 0) return;
      const chosen = projects[idx]!;

      if (chosen.id === stored.projectId) {
        ctx.ui.notify(`Already on ${chosen.title} (${chosen.id}).`, "info");
        return;
      }

      saveStoredAuth({ ...stored, projectId: chosen.id });
      ctx.ui.notify(
        `Project switched to ${chosen.title} (${chosen.id}). Restart testeiya to apply.`,
        "info",
      );
    },
  });
}

function formatProjectLabel(p: Project): string {
  const fw = p.framework ? `  ·  ${p.framework}` : "";
  return `${p.title}  (${p.id})${fw}`;
}

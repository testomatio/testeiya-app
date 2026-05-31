"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProjectGlyph } from "@/components/icons";
import { SectionShell } from "../SectionShell";
import { TestomatioLogin } from "@/components/TestomatioLogin";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";
import type { PanelSectionProps } from "@/lib/panel/types";

/**
 * Project service (shell). Full inline project details land in a later
 * iteration; for now it owns the connect/switch entry point that used to live
 * in the header, opening the existing Testomat.io login dialog. On selecting a
 * project we navigate to its session (same as the old header flow).
 */
export function ProjectSection({ active, onToggle }: PanelSectionProps) {
  const router = useRouter();
  const { sessionId } = useWorkspace();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <SectionShell
      icon={<ProjectGlyph className="size-4" />}
      title="Project"
      active={active}
      onToggle={onToggle}
    >
      <div className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground">
          {sessionId
            ? "A project is loaded. Switch to a different Testomat.io project below — richer project details are coming soon."
            : "Connect a Testomat.io project to load its tests into the workspace."}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setAuthOpen(true)}
        >
          {sessionId ? "Switch project" : "Connect a project"}
        </Button>
      </div>

      <TestomatioLogin
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSession={(id) =>
          router.replace(`/?session=${encodeURIComponent(id)}&ws=1`)
        }
      />
    </SectionShell>
  );
}

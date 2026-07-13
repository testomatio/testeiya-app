"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { SectionShell } from "../SectionShell";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { WorkflowPrompts } from "@/components/workflows/WorkflowPrompts";
import { useWorkflowsService } from "@/lib/services/StoreProvider";
import type { PanelSectionProps } from "@/lib/panel/types";

export const WorkflowsSection = observer(function WorkflowsSection({
  active,
  onToggle,
}: PanelSectionProps) {
  const workflows = useWorkflowsService();
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const categories = workflows.categories;

  const overviewAction = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => workflows.setDialogOpen(true)}
            aria-label="Workflow overview"
          >
            <Icon name="open_in_full" className="size-4" />
          </Button>
        }
      />
      <TooltipContent>
        <p>Workflow overview</p>
      </TooltipContent>
    </Tooltip>
  );

  if (categories.length === 0) {
    return (
      <SectionShell title="Workflows" active={active} onToggle={onToggle} actions={overviewAction}>
        <EmptyState
          className="py-6"
          icon={<Icon name="schema" className="size-5 text-muted-foreground" />}
          title="No workflows available"
          description="Open a workspace or connect a project to see workflows."
        />
      </SectionShell>
    );
  }

  const resolvedOpen = openId === undefined ? categories[0].id : openId;
  const value = resolvedOpen ? [resolvedOpen] : [];

  return (
    <SectionShell title="Workflows" active={active} onToggle={onToggle} actions={overviewAction}>
      <Accordion
        className="gap-2 px-4 py-2"
        multiple={false}
        value={value}
        onValueChange={(next) => setOpenId((next as string[])[0] ?? null)}
      >
        {categories.map((category) => {
          const open = resolvedOpen === category.id;
          return (
            <AccordionItem
              key={category.id}
              value={category.id}
              className={cn(
                "rounded-lg border transition-colors",
                open
                  ? "border-primary/50 bg-primary/5"
                  : "hover:border-primary/30 hover:bg-muted/50"
              )}
            >
              <AccordionTrigger className="items-center px-3 py-2.5 hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    <Icon
                      name={category.icon}
                      className={cn("size-4", open ? "text-primary" : "text-muted-foreground")}
                    />
                  </span>
                  <span className="font-semibold">{category.title}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-1.5">
                <WorkflowPrompts category={category} onRun={workflows.run} layout="stack" />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </SectionShell>
  );
});

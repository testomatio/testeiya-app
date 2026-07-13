"use client";

import { observer } from "mobx-react-lite";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WorkflowsDiagram } from "@/components/workflows/WorkflowsDiagram";
import { useWorkflowsService } from "@/lib/services/StoreProvider";

export const WorkflowsDiagramDialog = observer(function WorkflowsDiagramDialog() {
  const workflows = useWorkflowsService();

  const runAndClose = (text: string) => {
    workflows.run(text);
    workflows.setDialogOpen(false);
  };

  return (
    <Dialog open={workflows.dialogOpen} onOpenChange={workflows.setDialogOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogTitle className="sr-only">The Testeiya workflow</DialogTitle>
        <WorkflowsDiagram categories={workflows.schema} onRun={runAndClose} />
      </DialogContent>
    </Dialog>
  );
});

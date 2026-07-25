"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon, XIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useContextService } from "@/lib/services/StoreProvider";

/**
 * The "Add to Workspace" modal: one place to hand extra material to the agent —
 * drop/browse files, or point at a local folder / git repository via a single
 * smart input (a git URL clones, anything else is treated as a folder path).
 */
export const AddToWorkspaceDialog = observer(function AddToWorkspaceDialog() {
  const ctx = useContextService();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <Dialog
      open={ctx.modalOpen}
      onOpenChange={(open) => {
        if (!open) ctx.closeModal();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Add to Workspace</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-6 px-6 py-6">
          <DialogDescription>
            Files, folders and repositories you add here become part of the
            workspace. The agent gets access to them and uses them as context —
            requirements, specs, designs, source code.
          </DialogDescription>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              fileRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              ctx.stageFiles(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40",
              dragOver && "border-primary bg-primary/5 text-primary"
            )}
          >
            <Icon name="upload_file" className="size-6" />
            <span>Drop files here or click to browse</span>
            <span className="text-xs text-muted-foreground/70">
              Requirements, specs, designs — PDF, Markdown, images…
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              ctx.stageFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {ctx.pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ctx.pendingFiles.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1 rounded-md border bg-muted/40 py-1 pr-1 pl-2 text-xs"
                >
                  <Icon name="description" className="size-3.5 text-muted-foreground" />
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => ctx.unstageFile(i)}
                    className="flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Remove ${file.name}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="space-y-2.5">
            <div className="text-sm font-medium text-muted-foreground">
              Or add a folder / git repository
            </div>
            <div className="flex gap-2.5">
              <Input
                value={ctx.pathValue}
                onChange={(e) => ctx.setPathValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void ctx.submit();
                }}
                placeholder="/path/to/folder or https://github.com/org/repo.git"
              />
              <Button variant="outline" onClick={() => void ctx.pickFolder()}>
                <Icon name="folder_open" className="size-4" />
                Browse
              </Button>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => ctx.closeModal()}>
            Cancel
          </Button>
          <Button disabled={!ctx.canSubmit || !!ctx.busy} onClick={() => void ctx.submit()}>
            Add to Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

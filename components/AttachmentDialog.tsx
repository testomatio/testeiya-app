"use client";

import { Button } from "@/components/ui/button";
import { UploadIcon, XIcon } from "@/lib/icons";
import { useCallback, useEffect, useRef, type ChangeEvent } from "react";

export interface AttachmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (files: File[]) => void;
  accept?: string;
}

/**
 * Modal attach surface: a drop zone plus a "Choose files" picker. Drag/drop is
 * handled on `window` (always, even while closed) so dropping a file anywhere
 * pops the modal and attaches it — and the browser never falls back to opening
 * the dropped file. Stays mounted to keep listening; the overlay only renders
 * while `open`.
 */
export function AttachmentDialog({
  open,
  onOpenChange,
  onAdd,
  accept,
}: AttachmentDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      onOpenChange(true);
    };
    const onDragOver = (e: DragEvent) => {
      // Prevent default so a drop fires here instead of the browser opening
      // (navigating to) the dropped file.
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      // relatedTarget is null only when the pointer leaves the window entirely.
      if (e.relatedTarget === null) onOpenChange(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const dropped = e.dataTransfer?.files;
      if (dropped && dropped.length > 0) onAdd([...dropped]);
      onOpenChange(false);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onAdd, onOpenChange]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.currentTarget.files) onAdd([...e.currentTarget.files]);
      e.currentTarget.value = "";
      onOpenChange(false);
    },
    [onAdd, onOpenChange]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">Attach files</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-muted-foreground/30 px-6 py-10 text-center">
          <UploadIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drop files anywhere</p>
          <p className="text-xs text-muted-foreground">or</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={handleChange}
            aria-label="Upload files"
          />
        </div>
      </div>
    </div>
  );
}

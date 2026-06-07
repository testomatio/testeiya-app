"use client";

import { useEffect, useRef } from "react";
import OverType, { type OverTypeInstance } from "overtype";
import { cn } from "@/lib/utils";

export type OverTypeEditorProps = {
  /** Markdown source. Seeded on mount; reseeded when it diverges. */
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  theme?: "light" | "dark";
  /** Fired on Cmd/Ctrl+S. */
  onSaveShortcut?: () => void;
  className?: string;
};

export function OverTypeEditor({
  value,
  onChange,
  readOnly,
  theme = "light",
  onSaveShortcut,
  className,
}: OverTypeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<OverTypeInstance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const [instance] = new OverType(containerRef.current, {
      value,
      theme: overtypeTheme(theme),
      fontSize: "13px",
      fontFamily: "var(--font-mono)",
      padding: "1rem",
      autoResize: false,
      showStats: false,
      toolbar: false,
      onChange: (markdown) => onChangeRef.current(markdown),
    });
    instanceRef.current = instance;
    return () => {
      instance?.destroy();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reseed when the external value diverges (mode switch / reload).
  useEffect(() => {
    const instance = instanceRef.current;
    if (instance && value !== instance.getValue()) instance.setValue(value);
  }, [value]);

  useEffect(() => {
    instanceRef.current?.setTheme(overtypeTheme(theme));
  }, [theme]);

  useEffect(() => {
    const textarea = instanceRef.current?.textarea;
    if (textarea) textarea.readOnly = Boolean(readOnly);
  }, [readOnly]);

  return (
    <div
      className={cn(
        "testeiya-overtype-editor h-full w-full overflow-auto",
        className
      )}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSaveShortcut?.();
        }
      }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function overtypeTheme(theme: "light" | "dark") {
  if (theme === "dark") return "cave";
  return "solar";
}

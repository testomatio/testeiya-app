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

const tw = {
  // neutral
  n50:  "var(--color-neutral-50)",
  n100: "var(--color-neutral-100)",
  n200: "var(--color-neutral-200)",
  n300: "var(--color-neutral-300)",
  n400: "var(--color-neutral-400)",
  n500: "var(--color-neutral-500)",
  n600: "var(--color-neutral-600)",
  n700: "var(--color-neutral-700)",
  n800: "var(--color-neutral-800)",
  n900: "var(--color-neutral-900)",
  n950: "var(--color-neutral-950)",
  // indigo
  i200: "var(--color-indigo-200)",
  i300: "var(--color-indigo-300)",
  i400: "var(--color-indigo-400)",
  i500: "var(--color-indigo-500)",
  i600: "var(--color-indigo-600)",
  i700: "var(--color-indigo-700)",
} as const;

function overtypeTheme(theme: "light" | "dark") {
  if (theme === "dark") {
    return {
      name: "cave",
      colors: {
        bgPrimary:    tw.n900,
        bgSecondary:  tw.n900,
        text:         tw.n200,
        textPrimary:  tw.n200,
        textSecondary:tw.n400,
        h1:           tw.i300,
        h2:           tw.i300,
        h3:           tw.i300,
        strong:       tw.i200,
        em:           tw.i300,
        del:          tw.n500,
        link:         tw.i400,
        code:         tw.n200,
        codeBg:       tw.n800,
        blockquote:   tw.n400,
        hr:           tw.n700,
        syntaxMarker: tw.n600,
        syntax:       tw.n600,
        cursor:       tw.n200,
        selection:    "rgba(99, 102, 241, 0.25)",
        listMarker:   tw.i400,
        rawLine:      tw.n400,
        border:       tw.n800,
        hoverBg:      tw.n800,
        primary:      tw.i400,
        toolbarBg:    tw.n900,
        toolbarIcon:  tw.n400,
        toolbarHover: tw.n800,
        toolbarActive:tw.n700,
        placeholder:  tw.n600,
      },
    };
  }
  return {
    name: "solar",
    colors: {
      bgPrimary:    tw.n50,
      bgSecondary:  tw.n50,
      text:         tw.n900,
      textPrimary:  tw.n900,
      textSecondary:tw.n600,
      h1:           tw.i600,
      h2:           tw.i600,
      h3:           tw.i600,
      strong:       tw.n900,
      em:           tw.n700,
      del:          tw.n500,
      link:         tw.i500,
      code:         tw.n900,
      codeBg:       "rgba(99, 102, 241, 0.08)",
      blockquote:   tw.n500,
      hr:           tw.n200,
      syntaxMarker: tw.n500,
      syntax:       tw.n500,
      cursor:       tw.i500,
      selection:    "rgba(99, 102, 241, 0.15)",
      listMarker:   tw.i500,
      rawLine:      tw.n500,
      border:       tw.n200,
      hoverBg:      tw.n100,
      primary:      tw.i500,
      toolbarBg:    tw.n50,
      toolbarIcon:  tw.n600,
      toolbarHover: tw.n100,
      toolbarActive:tw.n200,
      placeholder:  tw.n400,
    },
  };
}

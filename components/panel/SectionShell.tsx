"use client";

import type { ReactNode } from "react";
import { useLayoutNode } from "@/lib/debug/layout-registry";

export function SectionShell({
  title,
  active,
  actions,
  titleAccessory,
  children,
}: {
  title: string;
  active: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  titleAccessory?: ReactNode;
  children?: ReactNode;
}) {
  const layoutRef = useLayoutNode(title);
  if (!active) return null;

  return (
    <div ref={layoutRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-4">
        <span className="min-w-0 shrink truncate text-sm font-semibold text-foreground">
          {title}
        </span>
        {titleAccessory}
        <div className="min-w-0 flex-1" />
        {actions && (
          <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

export function SectionShell({
  title,
  active,
  actions,
  children,
}: {
  title: string;
  active: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  if (!active) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 px-4">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </span>
        {actions && (
          <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </div>
  );
}

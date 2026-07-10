import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Centered empty-state block for panel sections: muted icon circle, title,
 * optional description, optional action (button) below.
 */
export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-8 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

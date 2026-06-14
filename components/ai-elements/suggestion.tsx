"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";
import { useCallback } from "react";

export type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export const Suggestions = ({
  className,
  children,
}: SuggestionsProps) => (
  <div className={cn("flex flex-wrap justify-center gap-2 px-0.5 py-0.5", className)}>
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn("h-auto cursor-pointer whitespace-normal break-words rounded-full px-4 py-1.5 text-left", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      <span>{children || suggestion}</span>
    </Button>
  );
};

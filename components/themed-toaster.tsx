"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

/** Sonner toaster bound to the app theme so toasts match light/dark. */
export function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} />;
}

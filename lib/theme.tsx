"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useHost } from "./host-bridge";

export type Theme = "light" | "dark";

const STORAGE_KEY = "testclaw.theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  /** True when the host (embedded mode) controls the theme — the toggle is hidden. */
  locked: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Theme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyClass(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

/**
 * Single source of truth for light/dark theme. Applies `.dark`/`.light` to
 * <html> so the shadcn CSS variables switch, and exposes the resolved theme to
 * components that theme themselves (e.g. the markdown editor). When embedded in
 * the Testomat.io host, the host theme wins and the toggle is hidden.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const host = useHost();
  const locked = !!host?.isEmbedded;

  // Start from a deterministic value so the server render and the first client
  // render are identical — otherwise theme-dependent UI (e.g. the toggle's
  // Sun/Moon icon) mismatches and React throws a hydration error. The *visual*
  // theme is already applied to <html> before hydration by the inline script in
  // layout.tsx; we adopt it into React state on mount below.
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Adopt the real theme on mount (it matches what the inline script applied).
  useEffect(() => {
    setMounted(true);
    if (host?.isEmbedded) return; // embedded theme handled by the effect below
    setThemeState(readStored() ?? systemTheme());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only sync
  }, []);

  // When embedded, follow the host's theme.
  useEffect(() => {
    if (host?.isEmbedded) setThemeState(host.theme);
  }, [host?.isEmbedded, host?.theme]);

  // Keep <html> in sync once mounted. The inline script owns the pre-hydration
  // class, so we don't re-apply on the first render (which would fight it).
  useEffect(() => {
    if (mounted) applyClass(theme);
  }, [theme, mounted]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      if (!locked) {
        try {
          window.localStorage.setItem(STORAGE_KEY, t);
        } catch {
          /* storage unavailable */
        }
      }
    },
    [locked]
  );

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, locked }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PanelSectionId } from "./types";

interface PanelContextValue {
  /** Whether the whole sidebar panel is visible. */
  open: boolean;
  togglePanel(): void;
  setOpen(open: boolean): void;
  /** Which section is expanded (single-open accordion), or null if all collapsed. */
  activeSection: PanelSectionId | null;
  setActiveSection(id: PanelSectionId | null): void;
  /** Open the panel and expand a section in one call (e.g. from the empty state). */
  openSection(id: PanelSectionId): void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

const OPEN_KEY = "testclaw.sidebar.open";
const SECTION_KEY = "testclaw.sidebar.section";
const SECTION_IDS: PanelSectionId[] = [
  "workspace",
  "project",
  "connections",
  "pipelines",
];

function readOpen(fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(OPEN_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {}
  return fallback;
}

function readSection(fallback: PanelSectionId | null): PanelSectionId | null {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(SECTION_KEY);
    if (v === "none") return null;
    if (v && (SECTION_IDS as string[]).includes(v)) return v as PanelSectionId;
  } catch {}
  return fallback;
}

export function PanelProvider({
  defaultOpen = false,
  defaultSection = "workspace",
  children,
}: {
  /** Open the panel on mount (e.g. when a project was just loaded via `ws=1`). */
  defaultOpen?: boolean;
  defaultSection?: PanelSectionId;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState<boolean>(
    () => defaultOpen || readOpen(false)
  );
  const [activeSection, setActiveSectionState] =
    useState<PanelSectionId | null>(() => readSection(defaultSection));

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {}
  }, [open]);
  useEffect(() => {
    try {
      window.localStorage.setItem(SECTION_KEY, activeSection ?? "none");
    } catch {}
  }, [activeSection]);

  const setOpen = useCallback((v: boolean) => setOpenState(v), []);
  const togglePanel = useCallback(() => setOpenState((v) => !v), []);
  const setActiveSection = useCallback(
    (id: PanelSectionId | null) => setActiveSectionState(id),
    []
  );
  const openSection = useCallback((id: PanelSectionId) => {
    setActiveSectionState(id);
    setOpenState(true);
  }, []);

  const value = useMemo(
    () => ({
      open,
      togglePanel,
      setOpen,
      activeSection,
      setActiveSection,
      openSection,
    }),
    [open, togglePanel, setOpen, activeSection, setActiveSection, openSection]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    // No-op fallback so consumers can be used outside a provider (mirrors
    // useWorkspace) without crashing.
    return {
      open: false,
      togglePanel: () => {},
      setOpen: () => {},
      activeSection: null,
      setActiveSection: () => {},
      openSection: () => {},
    };
  }
  return ctx;
}

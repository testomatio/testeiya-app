"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /** Whether the chat column is visible (toggled from the top bar). */
  chatOpen: boolean;
  toggleChat(): void;
  setChatOpen(open: boolean): void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

const OPEN_KEY = "testeiya.sidebar.open";
const SECTION_KEY = "testeiya.sidebar.section";
const CHAT_OPEN_KEY = "testeiya.chat.open";
const SECTION_IDS: PanelSectionId[] = [
  "workspace",
  "project",
  "connections",
  "pipelines",
];

/** Read persisted open state; null when nothing is stored. */
function readStoredOpen(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(OPEN_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {}
  return null;
}

/** Read persisted active section; undefined when nothing is stored. */
function readStoredSection(): PanelSectionId | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const v = window.localStorage.getItem(SECTION_KEY);
    if (v === "none") return null;
    if (v && (SECTION_IDS as string[]).includes(v)) return v as PanelSectionId;
  } catch {}
  return undefined;
}

/** Read persisted chat-open state; null when nothing is stored. */
function readStoredChatOpen(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CHAT_OPEN_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {}
  return null;
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
  // Initialize from the SSR-deterministic props only — reading localStorage in
  // the initializer would make the first client render diverge from the server
  // (hydration mismatch). Persisted values are applied after mount.
  const [open, setOpenState] = useState<boolean>(defaultOpen);
  const [activeSection, setActiveSectionState] =
    useState<PanelSectionId | null>(defaultSection);
  const [chatOpen, setChatOpenState] = useState<boolean>(true);

  // Apply persisted UI state once, after hydration. `hydrated` gates the
  // persist effects so they don't write the default over storage on the way in.
  const [hydrated, setHydrated] = useState(false);
  const didHydrate = useRef(false);
  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const storedOpen = readStoredOpen();
    if (storedOpen !== null) setOpenState(defaultOpen || storedOpen);
    const storedSection = readStoredSection();
    if (storedSection !== undefined) setActiveSectionState(storedSection);
    const storedChatOpen = readStoredChatOpen();
    if (storedChatOpen !== null) setChatOpenState(storedChatOpen);
    setHydrated(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {}
  }, [open, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SECTION_KEY, activeSection ?? "none");
    } catch {}
  }, [activeSection, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? "1" : "0");
    } catch {}
  }, [chatOpen, hydrated]);

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
  const setChatOpen = useCallback((v: boolean) => setChatOpenState(v), []);
  const toggleChat = useCallback(() => setChatOpenState((v) => !v), []);

  const value = useMemo(
    () => ({
      open,
      togglePanel,
      setOpen,
      activeSection,
      setActiveSection,
      openSection,
      chatOpen,
      toggleChat,
      setChatOpen,
    }),
    [
      open,
      togglePanel,
      setOpen,
      activeSection,
      setActiveSection,
      openSection,
      chatOpen,
      toggleChat,
      setChatOpen,
    ]
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
      chatOpen: true,
      toggleChat: () => {},
      setChatOpen: () => {},
    };
  }
  return ctx;
}

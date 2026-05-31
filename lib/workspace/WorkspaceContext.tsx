"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Which file (if any) is currently shown in the workspace editor panel. */
export interface OpenFile {
  /** Path relative to session.cwd. */
  path: string;
  /**
   * Optional seed content. When the agent writes a file, we pre-fill the
   * editor with the content it *intended* to write so the user sees it
   * immediately, even if the filesystem hasn't fsynced yet.
   */
  initialContent?: string;
  /** Monotonically increasing key so the editor re-mounts on re-open. */
  key: number;
  /**
   * Show the editor filling the whole content area (and hide the chat) instead
   * of as a strip above it. Set when the user explicitly opens a file from the
   * sidebar; left off when the agent auto-opens a file mid-chat (so the
   * conversation stays visible).
   */
  fullHeight?: boolean;
}

interface WorkspaceContextValue {
  sessionId: string | null;
  openFile: OpenFile | null;
  open(
    path: string,
    initialContent?: string,
    opts?: { fullHeight?: boolean }
  ): void;
  /** Toggle the open file between full-height and strip layout in place
   *  (keeps the editor mounted, so unsaved edits are preserved). */
  setFullHeight(fullHeight: boolean): void;
  close(): void;
  /** Incremented whenever the tree should refetch. */
  refreshCounter: number;
  triggerRefresh(): void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const keyRef = useRef(0);

  const open = useCallback(
    (path: string, initialContent?: string, opts?: { fullHeight?: boolean }) => {
      setOpenFile({
        path,
        initialContent,
        fullHeight: opts?.fullHeight,
        key: ++keyRef.current,
      });
    },
    []
  );

  const setFullHeight = useCallback((fullHeight: boolean) => {
    setOpenFile((prev) => (prev ? { ...prev, fullHeight } : prev));
  }, []);

  const close = useCallback(() => setOpenFile(null), []);
  const triggerRefresh = useCallback(() => setRefreshCounter((v) => v + 1), []);

  const value = useMemo(
    () => ({
      sessionId,
      openFile,
      open,
      setFullHeight,
      close,
      refreshCounter,
      triggerRefresh,
    }),
    [sessionId, openFile, open, setFullHeight, close, refreshCounter, triggerRefresh]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Allow usage in trees that aren't wrapped — return a no-op context.
    return {
      sessionId: null,
      openFile: null,
      open: () => {},
      setFullHeight: () => {},
      close: () => {},
      refreshCounter: 0,
      triggerRefresh: () => {},
    };
  }
  return ctx;
}

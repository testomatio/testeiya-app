"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { RootStore } from "./root-store";

const StoreContext = createContext<RootStore | null>(null);

/**
 * Provides the singleton RootStore (and its services) to the React tree. The
 * active `sessionId` is mirrored from the URL (passed by the page) into the
 * store so services react to session changes; `navigate` lets services switch
 * sessions through the app router.
 */
export function ServicesProvider({
  sessionId = null,
  navigate,
  children,
}: {
  sessionId?: string | null;
  navigate?: (sessionId: string) => void;
  children: ReactNode;
}) {
  const [store] = useState(() => new RootStore());

  useEffect(() => {
    store.setSessionId(sessionId ?? null);
  }, [store, sessionId]);

  useEffect(() => {
    if (navigate) store.setNavigate(navigate);
  }, [store, navigate]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useRootStore(): RootStore {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStores must be used within a <ServicesProvider>");
  }
  return ctx;
}

export const useStores = useRootStore;
export const useWorkspaceService = () => useRootStore().workspace;
export const useSearchService = () => useRootStore().search;
export const useProjectService = () => useRootStore().project;
export const useConnectionsService = () => useRootStore().connections;
export const useProvidersService = () => useRootStore().providers;
export const useSkillsService = () => useRootStore().skills;

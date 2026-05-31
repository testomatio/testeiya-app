"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

export interface HostContextValue {
  jwt: string;
  projectSlug: string;
  apiUrl: string;
  isEmbedded: boolean;
  theme: Theme;
  railsEnv: string;
}

const HostContext = createContext<HostContextValue | null>(null);

export function HostProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<HostContextValue | null>(() => {
    if (typeof window === "undefined") return null;
    const apiUrl = process.env.NEXT_PUBLIC_TESTOMATIO_API_URL;
    const slug = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_SLUG;
    if (apiUrl && slug && window.parent === window) {
      return {
        jwt: "",
        projectSlug: slug,
        apiUrl,
        isEmbedded: false,
        theme: "dark",
        railsEnv: "development",
      };
    }
    return null;
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "testomatio:init") return;
      if (typeof data.jwt !== "string" || typeof data.projectSlug !== "string") return;
      const theme: Theme = data.theme === "light" ? "light" : "dark";
      setValue({
        jwt: data.jwt,
        projectSlug: data.projectSlug,
        apiUrl: data.apiUrl,
        isEmbedded: true,
        theme,
        railsEnv: typeof data.railsEnv === "string" ? data.railsEnv : "production",
      });
    };

    window.addEventListener("message", onMessage);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "testomatio:ready" }, "*");
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Theme application is owned by ThemeProvider (lib/theme.tsx), which reads
  // this context and follows the host theme when embedded.

  return (
    <HostContext.Provider value={value}>{children}</HostContext.Provider>
  );
}

export function useHost(): HostContextValue | null {
  return useContext(HostContext);
}

export function postToHost(message: { type: string } & Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  window.parent.postMessage(message, "*");
}

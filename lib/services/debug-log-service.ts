import { makeAutoObservable, observable } from "mobx";
import {
  setExternalLogSink,
  initConsoleCapture,
  type DebugLogEntry,
} from "@/lib/debug/external-log";
import { serviceSnapshot } from "@/lib/debug/store-snapshot";
import type { RootStore } from "./root-store";

const STORAGE_KEY = "testeiya.debug-panel.enabled";
const MAX_ENTRIES = 300;
const REPORT_INTERVAL_MS = 15000;
const ERROR_DEBOUNCE_MS = 1500;
const MAX_STORE_BYTES = 300000;

/**
 * Collects the unified activity log (from `lib/debug/external-log`) for the
 * sidebar Debug panel: outbound Testomat.io requests, same-origin `/api/*`
 * requests, and pi/WS agent events. `enabled` (persisted to localStorage)
 * controls whether the panel is shown; entries are always captured so history
 * is present the moment the panel is opened.
 */
export class DebugLogService {
  enabled = false;
  entries: DebugLogEntry[] = [];
  stream: EventSource | null = null;
  reportTimer: ReturnType<typeof setInterval> | null = null;
  errorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      {
        root: false,
        entries: observable.shallow,
        stream: false,
        reportTimer: false,
        errorTimer: false,
      },
      { autoBind: true }
    );
    setExternalLogSink(this.record);
  }

  /**
   * Apply the persisted `enabled` flag. Called once after mount (not in the
   * constructor, which runs during the first client render) so the server HTML
   * and the first client render agree — reading localStorage at construction
   * makes the Debug section appear client-only and throws a hydration mismatch.
   */
  hydrate(): void {
    initConsoleCapture();
    this.enabled = loadEnabled();
    this.report("load");
    if (this.enabled) {
      this.connectStream();
      this.startReporting();
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    saveEnabled(value);
    if (value) {
      this.connectStream();
      this.startReporting();
      this.report("panel-open");
      return;
    }
    this.disconnectStream();
    this.stopReporting();
  }

  clear(): void {
    this.entries = [];
  }

  record(entry: DebugLogEntry): void {
    const next = [entry, ...this.entries];
    if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
    this.entries = next;
    if (isError(entry)) this.scheduleErrorReport();
  }

  /**
   * Push the current activity log + a MobX store snapshot to the server so the
   * agent (via `GET /api/debug/snapshot`) sees the browser's view of the world.
   * Raw `fetch` (not the `http` helper) so it never logs itself or loops.
   */
  report(reason: string): void {
    if (typeof window === "undefined") return;
    const store = serviceSnapshot(this.root);
    delete store.debug;
    const body = JSON.stringify({
      sessionId: this.root.sessionId,
      reason,
      entries: this.entries,
      store: boundStore(store),
      meta: pageMeta(),
    });
    try {
      void fetch("/api/debug/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  /**
   * Subscribe to server-side Testomat.io requests over SSE and feed them into
   * the same log. Idempotent and a no-op on the server / where EventSource is
   * unavailable. The endpoint replays its recent ring buffer on connect.
   */
  connectStream(): void {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    if (this.stream) return;
    const es = new EventSource("/api/debug/stream");
    es.onmessage = (event) => {
      if (!event.data) return;
      try {
        this.record(JSON.parse(event.data) as DebugLogEntry);
      } catch {}
    };
    this.stream = es;
  }

  disconnectStream(): void {
    if (!this.stream) return;
    this.stream.close();
    this.stream = null;
  }

  startReporting(): void {
    if (this.reportTimer) return;
    if (typeof window === "undefined") return;
    this.reportTimer = setInterval(() => this.report("interval"), REPORT_INTERVAL_MS);
  }

  stopReporting(): void {
    if (!this.reportTimer) return;
    clearInterval(this.reportTimer);
    this.reportTimer = null;
  }

  scheduleErrorReport(): void {
    if (typeof window === "undefined" || this.errorTimer) return;
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null;
      this.report("error");
    }, ERROR_DEBOUNCE_MS);
  }
}

function isError(entry: DebugLogEntry): boolean {
  if (entry.kind !== "request") return !entry.ok;
  return !entry.ok || (entry.status !== null && entry.status >= 400);
}

function boundStore(store: Record<string, unknown>): unknown {
  try {
    const json = JSON.stringify(store);
    if (json.length <= MAX_STORE_BYTES) return store;
    return { truncated: true, bytes: json.length, keys: Object.keys(store) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function pageMeta(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const root = document.documentElement;
  return {
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    theme: root.classList.contains("dark") ? "dark" : "light",
    embedded: window.self !== window.top,
  };
}

function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {}
}

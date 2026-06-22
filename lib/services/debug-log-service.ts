import { makeAutoObservable, observable } from "mobx";
import {
  setExternalLogSink,
  type DebugLogEntry,
} from "@/lib/debug/external-log";
import type { RootStore } from "./root-store";

const STORAGE_KEY = "testeiya.debug-panel.enabled";
const MAX_ENTRIES = 300;

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

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      { root: false, entries: observable.shallow, stream: false },
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
    this.enabled = loadEnabled();
    if (this.enabled) this.connectStream();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    saveEnabled(value);
    if (value) this.connectStream();
    else this.disconnectStream();
  }

  clear(): void {
    this.entries = [];
  }

  record(entry: DebugLogEntry): void {
    const next = [entry, ...this.entries];
    if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
    this.entries = next;
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

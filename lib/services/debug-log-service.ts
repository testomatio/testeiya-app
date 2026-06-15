import { makeAutoObservable, observable } from "mobx";
import {
  setExternalLogSink,
  type ExternalLogEntry,
} from "@/lib/debug/external-log";
import type { RootStore } from "./root-store";

const STORAGE_KEY = "testeiya.debug-panel.enabled";
const MAX_ENTRIES = 300;

/**
 * Collects the outbound Testomat.io request log (from `lib/debug/external-log`)
 * for the sidebar Debug panel. `enabled` (persisted to localStorage) controls
 * whether the panel is shown; entries are always captured so history is present
 * the moment the panel is opened.
 */
export class DebugLogService {
  enabled = false;
  entries: ExternalLogEntry[] = [];

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      { root: false, entries: observable.shallow },
      { autoBind: true }
    );
    this.enabled = loadEnabled();
    setExternalLogSink(this.record);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    saveEnabled(value);
  }

  clear(): void {
    this.entries = [];
  }

  record(entry: ExternalLogEntry): void {
    const next = [entry, ...this.entries];
    if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
    this.entries = next;
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

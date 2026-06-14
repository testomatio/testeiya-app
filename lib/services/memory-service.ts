import { makeAutoObservable, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type { RootStore } from "./root-store";

/**
 * Per-project memory (the SDK's autonomous memory store, keyed by the session
 * `cwd`). Read-only from the UI: the agent consolidates durable facts from past
 * sessions into `MEMORY.md`; here we fetch it for viewing and expose rebuild /
 * clear. Loaded on demand when the memory dialog opens.
 */
export class MemoryService {
  enabled = true;
  content: string | null = null;
  summary: string | null = null;
  exists = false;
  loading = false;
  busy = false;
  error: string | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false }, { autoBind: true });
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  async load(): Promise<void> {
    const sessionId = this.root.sessionId;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : "";
    try {
      const data = await getJson<{
        enabled: boolean;
        content: string | null;
        summary: string | null;
        exists: boolean;
      }>(`/api/memory${query}`);
      runInAction(() => {
        this.enabled = data.enabled;
        this.content = data.content;
        this.summary = data.summary;
        this.exists = data.exists;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const previous = this.enabled;
    runInAction(() => {
      this.enabled = enabled;
    });
    try {
      await postJson("/api/memory", { action: enabled ? "enable" : "disable" });
      toast.success(
        `Project memory ${enabled ? "enabled" : "disabled"} — applies on next session`
      );
    } catch (err) {
      runInAction(() => {
        this.enabled = previous;
      });
      toast.error(err instanceof Error ? err.message : "Failed to update memory setting");
    }
  }

  async rebuild(): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    runInAction(() => {
      this.busy = true;
    });
    try {
      await postJson(`/api/memory?session=${encodeURIComponent(sessionId)}`, {
        action: "rebuild",
      });
      toast.success("Memory rebuild queued — runs when a new session starts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue rebuild");
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  async clear(): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    runInAction(() => {
      this.busy = true;
    });
    try {
      await postJson(`/api/memory?session=${encodeURIComponent(sessionId)}`, {
        action: "clear",
      });
      runInAction(() => {
        this.content = null;
        this.summary = null;
        this.exists = false;
      });
      toast.success("Project memory cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear memory");
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }
}

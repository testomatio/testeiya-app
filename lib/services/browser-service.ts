import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type { RootStore } from "./root-store";

// How often to re-check the live session, so the status dot stays accurate and a
// crashed or user-closed browser surfaces quickly (instead of a stuck "recording").
const POLL_MS = 5000;

/**
 * Drives the live Playwright CLI browser session from the UI: start/stop the
 * browser, start/stop video recording, and grab a screenshot. Thin over the
 * `/api/playwright/*` endpoints — the server runs `playwright-cli` against the
 * session the agent is using.
 *
 * While a session is active it polls `/api/playwright/status`, so the header
 * status dot reflects reality and a browser crash / user-closed window resets
 * the controls (and tells the user) rather than leaving them stuck.
 */
export class BrowserService {
  recording = false;
  browserOpen = false;
  incognito = false;
  busy = false;

  pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false, pollTimer: false }, { autoBind: true });

    // Each session is its own workspace/browser — drop state, re-seed, re-poll.
    reaction(
      () => this.root.sessionId,
      () => {
        this.reset();
        if (!this.root.sessionId) return;
        void this.refreshStatus();
        this.startPolling();
      }
    );
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  toggleBrowser() {
    if (this.browserOpen) return this.close();
    return this.open();
  }

  toggleRecording() {
    if (this.recording) return this.stop();
    return this.record();
  }

  async open() {
    await this.run("/api/playwright/open", () => {
      runInAction(() => {
        this.browserOpen = true;
      });
      toast.success("Browser started");
    }, "Failed to start browser");
  }

  async close() {
    await this.run("/api/playwright/close", () => {
      runInAction(() => {
        this.browserOpen = false;
        this.recording = false;
      });
      toast.success("Browser stopped");
    }, "Failed to stop browser");
  }

  async record() {
    await this.run("/api/playwright/record", (data) => {
      runInAction(() => {
        this.recording = true;
        this.browserOpen = true;
      });
      let message = "Recording started";
      if (data.file) message = `Recording → ${relName(data.file)}`;
      toast.success(message);
    }, "Failed to start recording");
  }

  async stop() {
    await this.run("/api/playwright/stop", (data) => {
      runInAction(() => {
        this.recording = false;
      });
      let message = "Recording stopped";
      if (data.browserClosed) message = "Browser was closed — recording ended";
      else if (data.file) message = `Saved ${relName(data.file)}`;
      toast.success(message);
    }, "Failed to stop recording");
  }

  async screenshot() {
    await this.run("/api/playwright/screenshot", (data) => {
      let message = "Screenshot saved";
      if (data.file) message = `Screenshot → ${relName(data.file)}`;
      toast.success(message);
    }, "Failed to take screenshot");
  }

  async setIncognito(incognito: boolean) {
    await this.run("/api/playwright/incognito", (data) => {
      runInAction(() => {
        this.incognito = incognito;
        if (typeof data.browserOpen === "boolean") this.browserOpen = data.browserOpen;
      });
      toast.success(incognito ? "Incognito mode on — nothing is stored" : "Persistent session on");
    }, "Failed to change mode", { incognito });
  }

  async refreshStatus() {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    try {
      const data = await getJson<BrowserStatus>(
        `/api/playwright/status?session=${encodeURIComponent(sessionId)}`
      );
      runInAction(() => {
        this.browserOpen = !!data.browserOpen;
        this.incognito = !!data.incognito;
        // The server reports recording false once the browser is gone; if we
        // still thought we were recording, the session crashed or was closed.
        if (this.recording && !data.recording) {
          this.recording = false;
          toast.error("Browser closed — recording stopped");
        }
      });
    } catch {
      // best-effort — leave state as-is until the next poll/action
    }
  }

  private async run(
    url: string,
    onOk: (data: BrowserActionResult) => void,
    failMessage: string,
    body: Record<string, unknown> = {}
  ) {
    if (!this.sessionId || this.busy) return;
    this.busy = true;
    try {
      const data = await postJson<BrowserActionResult>(url, { session: this.sessionId, ...body });
      onOk(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failMessage);
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.refreshStatus(), POLL_MS);
  }

  private stopPolling() {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private reset() {
    this.stopPolling();
    this.recording = false;
    this.browserOpen = false;
    this.incognito = false;
  }
}

function relName(file: string): string {
  const idx = file.lastIndexOf("/.testeiya/");
  if (idx >= 0) return file.slice(idx + 1);
  return file.split("/").pop() || file;
}

interface BrowserActionResult {
  ok?: boolean;
  file?: string | null;
  browserClosed?: boolean;
  browserOpen?: boolean;
}

interface BrowserStatus {
  ok?: boolean;
  browserOpen?: boolean;
  recording?: boolean;
  incognito?: boolean;
}

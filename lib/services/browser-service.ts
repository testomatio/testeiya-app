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
  capturing = false;
  signals: CaptureSignals | null = null;

  pollTimer: ReturnType<typeof setInterval> | null = null;
  signalsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      { root: false, pollTimer: false, signalsTimer: false },
      { autoBind: true }
    );

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

  async focus() {
    await this.run("/api/playwright/focus", () => {
      toast.success("Switched to browser");
    }, "Failed to switch to browser");
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

  /**
   * Begin capturing evidence for a manual test (trace + fresh console/request
   * lists) and start polling the live signal counts for the badge.
   */
  async startCapture(): Promise<boolean> {
    const sessionId = this.sessionId;
    if (!sessionId || this.capturing) return this.capturing;
    try {
      await postJson("/api/playwright/capture/start", { session: sessionId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start capturing");
      return false;
    }
    runInAction(() => {
      this.capturing = true;
      this.signals = null;
    });
    this.startSignalsPolling();
    return true;
  }

  /** Stop the capture and return its harvested evidence (or null). */
  async stopCapture(): Promise<CaptureResult | null> {
    const sessionId = this.sessionId;
    this.stopSignalsPolling();
    if (!sessionId || !this.capturing) return null;
    runInAction(() => {
      this.capturing = false;
      this.signals = null;
    });
    try {
      return await postJson<CaptureResult>("/api/playwright/capture/stop", {
        session: sessionId,
      });
    } catch {
      return null;
    }
  }

  async refreshSignals() {
    const sessionId = this.sessionId;
    if (!sessionId || !this.capturing) return;
    try {
      const data = await getJson<SignalsStatus>(
        `/api/playwright/signals?session=${encodeURIComponent(sessionId)}`
      );
      runInAction(() => {
        if (!data.capturing) {
          this.capturing = false;
          this.signals = null;
          this.stopSignalsPolling();
          return;
        }
        this.signals = {
          consoleErrors: data.consoleErrors ?? 0,
          failedRequests: data.failedRequests ?? 0,
          elapsedMs: data.elapsedMs ?? 0,
        };
      });
    } catch {
      // best-effort — leave state as-is until the next poll
    }
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
        // Same for a capture — the server drops it with the browser.
        if (this.capturing && !data.capturing) {
          this.capturing = false;
          this.signals = null;
          this.stopSignalsPolling();
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

  private startSignalsPolling() {
    if (this.signalsTimer) return;
    this.signalsTimer = setInterval(() => void this.refreshSignals(), POLL_MS);
  }

  private stopSignalsPolling() {
    if (!this.signalsTimer) return;
    clearInterval(this.signalsTimer);
    this.signalsTimer = null;
  }

  private reset() {
    this.stopPolling();
    this.stopSignalsPolling();
    this.recording = false;
    this.browserOpen = false;
    this.incognito = false;
    this.capturing = false;
    this.signals = null;
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
  capturing?: boolean;
  incognito?: boolean;
}

export interface CaptureSignals {
  consoleErrors: number;
  failedRequests: number;
  elapsedMs: number;
}

export interface CaptureResult {
  ok?: boolean;
  durationMs?: number;
  browserClosed?: boolean;
  consoleErrors?: number;
  consoleText?: string;
  failedRequests?: FailedRequestInfo[];
  tracePath?: string | null;
}

export interface FailedRequestInfo {
  method: string;
  url: string;
  status: string;
  statusText: string;
}

interface SignalsStatus {
  ok?: boolean;
  capturing?: boolean;
  browserClosed?: boolean;
  consoleErrors?: number;
  failedRequests?: number;
  elapsedMs?: number;
}

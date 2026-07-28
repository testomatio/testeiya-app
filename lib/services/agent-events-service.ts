import { makeAutoObservable } from "mobx";
import type { RootStore } from "./root-store";

/**
 * Lets UI features start an agent turn without a user-typed message — e.g. the
 * manual-run executor asking the agent to analyze a failed test's captured
 * browser signals. The chat page injects `sender` (a hidden prompt send) and
 * mirrors the agent's busy state; an event fired mid-turn is queued
 * (latest-wins) and flushed when the agent goes idle.
 *
 * Event text must be one paired-tag block (e.g. `<manual-run-event>…</…>`) —
 * the server's replay strip drops such messages, so they never appear as user
 * bubbles when a conversation is reopened.
 */
export class AgentEventsService {
  // Injected by the chat page; returns false when the send was refused.
  sender: (text: string) => boolean = () => false;
  busy = false;
  pending: string | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false, sender: false }, { autoBind: true });
  }

  emit(text: string): void {
    if (!this.busy && this.sender(text)) return;
    this.pending = text;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    if (busy || !this.pending) return;
    const text = this.pending;
    this.pending = null;
    if (!this.sender(text)) this.pending = text;
  }

  setSender(sender: (text: string) => boolean): void {
    this.sender = sender;
  }
}

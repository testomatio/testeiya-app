/**
 * Per-connection registry of in-flight `ui_widget` calls.
 *
 * `ui_widget`'s `execute()` blocks on `wait(toolCallId)` while the client runs
 * the command against the live widget (paginate, filter, open, …) and ships the
 * resulting data back. The WebSocket connection calls `respond(toolCallId,
 * result)` when the `widget_result` frame arrives; that resolves the pending
 * promise and the SAME turn continues with the data as the tool result.
 *
 * Mirrors `AskChannel` — the difference is the value is the command's JSON
 * result (a string) rather than a user-picked option.
 */
const CANCELLED =
  '{"ok":false,"error":"The widget command was cancelled (the turn was aborted or the widget closed)."}';

export class WidgetCommandChannel {
  private pending = new Map<string, (value: string) => void>();

  wait(toolCallId: string, signal?: AbortSignal): Promise<string> {
    const { promise, resolve } = Promise.withResolvers<string>();
    this.pending.set(toolCallId, resolve);
    if (!signal) return promise;
    if (signal.aborted) {
      this.settle(toolCallId, CANCELLED);
      return promise;
    }
    signal.addEventListener("abort", () => this.settle(toolCallId, CANCELLED), {
      once: true,
    });
    return promise;
  }

  respond(toolCallId: string, value: string): boolean {
    return this.settle(toolCallId, value);
  }

  cancelAll(): void {
    for (const id of Array.from(this.pending.keys())) {
      this.settle(id, CANCELLED);
    }
  }

  private settle(toolCallId: string, value: string): boolean {
    const resolve = this.pending.get(toolCallId);
    if (!resolve) return false;
    this.pending.delete(toolCallId);
    resolve(value);
    return true;
  }
}

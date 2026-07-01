/**
 * Per-connection registry of in-flight `ask_question` calls.
 *
 * `ask_question`'s `execute()` blocks on `wait(toolCallId)`, so the agent loop
 * is genuinely parked while the user picks an option — mirroring the SDK's
 * built-in `ask`/`await` tools, which also block inside `execute`. The
 * WebSocket connection calls `answer(toolCallId, value)` when the user clicks
 * a pill; that resolves the pending promise, the chosen option becomes the
 * tool result, and the SAME turn continues.
 *
 * Without this the tool returned immediately, the loop kept running, and the
 * model emitted filler text ("Awaiting selection…", "Blocked until…") instead
 * of actually stopping.
 */
const DISMISSED =
  "[The user dismissed this question without picking an option. Ask again only if you still need the answer; otherwise continue.]";

export class AskChannel {
  private pending = new Map<string, (value: string) => void>();

  wait(toolCallId: string, signal?: AbortSignal): Promise<string> {
    const { promise, resolve } = Promise.withResolvers<string>();
    this.pending.set(toolCallId, resolve);
    if (!signal) return promise;
    if (signal.aborted) {
      this.settle(toolCallId, DISMISSED);
      return promise;
    }
    signal.addEventListener("abort", () => this.settle(toolCallId, DISMISSED), {
      once: true,
    });
    return promise;
  }

  answer(toolCallId: string, value: string): boolean {
    return this.settle(toolCallId, value);
  }

  cancelAll(): void {
    for (const id of Array.from(this.pending.keys())) {
      this.settle(id, DISMISSED);
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

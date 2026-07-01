// Testeiya branded loader: gradient shimmer + rotating QA-themed verbs.
// Hooks an InteractiveMode instance — when its loadingAnimation appears,
// we replace its messageColorFn with a green shimmer and start cycling verbs.

import { visibleWidth } from "@oh-my-pi/pi-tui";

const PALETTE = [
  [0x00, 0xa8, 0x49], // #00a849 dark green
  [0x21, 0xc4, 0x4f],
  [0x4d, 0xff, 0x4f], // #4dff4f bright
  [0x86, 0xff, 0x9b],
  [0xa8, 0xff, 0xe9], // #a8ffe9 pale
  [0x86, 0xff, 0x9b],
  [0x4d, 0xff, 0x4f],
  [0x21, 0xc4, 0x4f],
];

const RESET = "\x1b[0m";

export const TESTEIYA_VERBS = [
  "Investigating",
  "Crawling tests",
  "Probing",
  "Asserting",
  "Tracing flows",
  "Locating selectors",
  "Inspecting steps",
  "Sniffing bugs",
];

export function gradientShimmer(): (text: string) => string {
  let phase = 0;
  return (text: string): string => {
    phase = (phase + 1) % PALETTE.length;
    let out = "";
    let i = 0;
    for (const ch of text) {
      const [r, g, b] = PALETTE[(phase + i) % PALETTE.length];
      out += `\x1b[38;2;${r};${g};${b}m${ch}`;
      i++;
    }
    return out + RESET;
  };
}

interface Watchable {
  loadingAnimation?: { setMessage(m: string): void; messageColorFn?: (s: string) => string } | null;
}

export function attachBrandedLoader(interactive: Watchable, opts?: { rotateMs?: number; pollMs?: number }): () => void {
  const rotateMs = opts?.rotateMs ?? 2500;
  const pollMs = opts?.pollMs ?? 100;

  let lastLoader: unknown = null;
  let rotationTimer: NodeJS.Timeout | undefined;
  let verbIdx = 0;

  const stopRotation = () => {
    if (rotationTimer) {
      clearInterval(rotationTimer);
      rotationTimer = undefined;
    }
  };

  const watcher = setInterval(() => {
    const cur = interactive.loadingAnimation;
    if (cur && cur !== lastLoader) {
      lastLoader = cur;
      // Apply gradient color over message
      cur.messageColorFn = gradientShimmer();
      // Start with a fresh verb and rotate
      verbIdx = Math.floor(Math.random() * TESTEIYA_VERBS.length);
      cur.setMessage(TESTEIYA_VERBS[verbIdx]);
      stopRotation();
      rotationTimer = setInterval(() => {
        verbIdx = (verbIdx + 1) % TESTEIYA_VERBS.length;
        try {
          cur.setMessage(TESTEIYA_VERBS[verbIdx]);
        } catch {
          stopRotation();
        }
      }, rotateMs);
    } else if (!cur && lastLoader) {
      lastLoader = null;
      stopRotation();
    }
  }, pollMs);

  return () => {
    clearInterval(watcher);
    stopRotation();
  };
}

// Silence unused-import warning while keeping the helper available for future use.
void visibleWidth;

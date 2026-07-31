// Testeiya branded loader: gradient shimmer + rotating QA-themed verbs.
// Hooks an InteractiveMode instance — when its loadingAnimation appears,
// we replace its messageColorFn with a violet shimmer and start cycling verbs.

import { visibleWidth } from "@oh-my-pi/pi-tui";

const PALETTE = [
  [0x6d, 0x28, 0xd9], // #6d28d9 deep violet
  [0x7c, 0x3a, 0xed],
  [0x8b, 0x5c, 0xf6], // #8b5cf6 brand primary
  [0xa7, 0x8b, 0xfa],
  [0xdd, 0xd6, 0xfe], // #ddd6fe pale violet
  [0xa7, 0x8b, 0xfa],
  [0x8b, 0x5c, 0xf6],
  [0x7c, 0x3a, 0xed],
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

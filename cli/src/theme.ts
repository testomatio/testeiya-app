// Testeiya branding: theme selection + input border styling.
// Keeps all raw ANSI / color concerns out of main.ts.

import { setTheme } from "@oh-my-pi/pi-coding-agent";
import { theme as themeSingleton } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";

const TC_VIOLET = "\x1b[38;2;139;92;246m"; // #8b5cf6 brand primary
const TC_RESET = "\x1b[0m";

/** Colorize a string in the Testeiya input-border violet. */
export const testeiyaBorder = (s: string): string => `${TC_VIOLET}${s}${TC_RESET}`;

interface ThemableInteractive {
  editor: { setBorderVisible(v: boolean): void; borderColor: (s: string) => string };
}

/**
 * Apply the Testeiya look: obsidian base theme + violet input border that
 * survives bash/python mode exits (the SDK restores the "off" thinking border).
 */
export function applyTesteiyaTheme(interactive: ThemableInteractive): void {
  setTheme("obsidian"); // alternatives: "dark-sakura", "dark-tokyo-night"
  interactive.editor.setBorderVisible(true);

  const origThinkingBorder = themeSingleton.getThinkingBorderColor.bind(themeSingleton);
  (themeSingleton as any).getThinkingBorderColor = (level: any) =>
    level === "off" ? testeiyaBorder : origThinkingBorder(level);

  interactive.editor.borderColor = testeiyaBorder;
}

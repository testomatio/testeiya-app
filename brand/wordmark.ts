// The Testeiya wordmark, rendered as ANSI rows. Shared so every surface that
// greets a user — the desktop TUI and the command-line agent — prints the same
// mark. No model reads this; it is here because it is pure data.

const SHADOW = "\x1b[38;2;46;16;101m"; // #2e1065 — deep violet
const RESET = "\x1b[0m";

// Top-to-bottom gradient: brightest at the first row, darkening downward.
const GRAD_TOP = [196, 181, 253]; // #c4b5fd light violet
const GRAD_BOT = [109, 40, 217]; // #6d28d9 deep violet

// 5-line block-letter "TESTEIYA".
export const WORDMARK_LINES = [
  "████████ ███████ ███████ ████████ ███████ ██████ ██    ██  █████",
  "   ██    ██      ██         ██    ██        ██    ██  ██  ██   ██",
  "   ██    █████   ███████    ██    █████     ██     ████   ███████",
  "   ██    ██           ██    ██    ██        ██       ██    ██   ██",
  "   ██    ███████ ███████    ██    ███████ ██████    ██    ██   ██",
];

const SHADOW_DX = 1;
const SHADOW_DY = 1;
const FG_BLOCK = "█";
const SH_BLOCK = "█";

// Programmatic drop shadow: clones the wordmark offset (dx, dy) in dark violet,
// gradient foreground on top. Returns rendered ANSI lines + visible width.
export function buildShadowedWordmark(): { lines: string[]; width: number } {
  const srcW = WORDMARK_LINES.reduce((m, l) => Math.max(m, l.length), 0);
  const padded = WORDMARK_LINES.map(l => l.padEnd(srcW, " "));
  const totalRows = padded.length + SHADOW_DY;
  const totalCols = srcW + SHADOW_DX;

  const lines: string[] = [];
  for (let r = 0; r < totalRows; r++) {
    let out = "";
    for (let c = 0; c < totalCols; c++) {
      const fg = padded[r]?.[c] ?? " ";
      const sr = r - SHADOW_DY;
      const sc = c - SHADOW_DX;
      const sh = sr >= 0 && sc >= 0 ? (padded[sr]?.[sc] ?? " ") : " ";
      if (fg === FG_BLOCK) out += `${gradientFg(r, padded.length)}${FG_BLOCK}${RESET}`;
      else if (sh === FG_BLOCK) out += `${SHADOW}${SH_BLOCK}${RESET}`;
      else out += " ";
    }
    lines.push(out);
  }
  return { lines, width: totalCols };
}

function gradientFg(row: number, rows: number): string {
  const t = rows <= 1 ? 0 : row / (rows - 1);
  const r = Math.round(GRAD_TOP[0] + (GRAD_BOT[0] - GRAD_TOP[0]) * t);
  const g = Math.round(GRAD_TOP[1] + (GRAD_BOT[1] - GRAD_TOP[1]) * t);
  const b = Math.round(GRAD_TOP[2] + (GRAD_BOT[2] - GRAD_TOP[2]) * t);
  return `\x1b[38;2;${r};${g};${b}m`;
}

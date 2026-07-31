import { type Component, padding, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";

const BRIGHT = "\x1b[38;2;158;102;255m"; // #9e66ff — brand light violet
const SHADOW = "\x1b[38;2;46;16;101m"; // #2e1065 — deep violet
const PALE = "\x1b[38;2;221;214;254m"; // #ddd6fe — pale violet

// Top-to-bottom gradient: brightest at the first row, darkening downward.
const GRAD_TOP = [196, 181, 253]; // #c4b5fd light violet
const GRAD_BOT = [109, 40, 217]; // #6d28d9 deep violet

function gradientFg(row: number, rows: number): string {
  const t = rows <= 1 ? 0 : row / (rows - 1);
  const r = Math.round(GRAD_TOP[0] + (GRAD_BOT[0] - GRAD_TOP[0]) * t);
  const g = Math.round(GRAD_TOP[1] + (GRAD_BOT[1] - GRAD_TOP[1]) * t);
  const b = Math.round(GRAD_TOP[2] + (GRAD_BOT[2] - GRAD_TOP[2]) * t);
  return `\x1b[38;2;${r};${g};${b}m`;
}
const DIM = "\x1b[38;2;107;114;128m";
const RESET = "\x1b[0m";

// 5-line block-letter "TESTEIYA".
const WORDMARK_LINES = [
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

// Programmatic drop shadow: clones the wordmark offset (dx, dy) in dark green,
// foreground bright green on top. Returns rendered ANSI lines + visible width.
function buildShadowedWordmark(): { lines: string[]; width: number } {
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

const SHADOWED = buildShadowedWordmark();
const WORDMARK_WIDTH = SHADOWED.width;

// The Testeiya logo mark (violet circle + white check) as a 12×12 pixel bitmap.
// L = light violet #9e66ff, P = deep violet #7e33ff, W = white #f5f3ff, . = transparent.
const LOGO_PIXELS = [
  "....LLLP....",
  "..LLLLLPPPWW",
  ".LLLLLLPPWW.",
  ".LLLLLLPWWP.",
  "LLLLLLLWWPPP",
  "LWWLLLWWPPPP",
  "LLWWLWWPPPPP",
  "LLLWWWLPPPPP",
  ".LLWWLLPPPP.",
  ".LLLLLLPPPP.",
  "..LLLLLPPP..",
  "....LLLP....",
];

const LOGO_FG: Record<string, string> = {
  L: "\x1b[38;2;158;102;255m",
  P: "\x1b[38;2;126;51;255m",
  W: "\x1b[38;2;245;243;255m",
};

const LOGO_BG: Record<string, string> = {
  L: "\x1b[48;2;158;102;255m",
  P: "\x1b[48;2;126;51;255m",
  W: "\x1b[48;2;245;243;255m",
};

// Renders the bitmap with half-blocks: each character cell stacks two pixel
// rows (▀ fg = top pixel, bg = bottom pixel), so the 12×12 logo takes 6 lines.
function buildLogo(): { lines: string[]; width: number } {
  const lines: string[] = [];
  for (let r = 0; r < LOGO_PIXELS.length; r += 2) {
    const top = LOGO_PIXELS[r];
    const bot = LOGO_PIXELS[r + 1] ?? "";
    let out = "";
    for (let c = 0; c < top.length; c++) {
      const t = top[c] ?? ".";
      const b = bot[c] ?? ".";
      if (t === "." && b === ".") {
        out += " ";
      } else if (b === ".") {
        out += `${LOGO_FG[t]}▀${RESET}`;
      } else if (t === ".") {
        out += `${LOGO_FG[b]}▄${RESET}`;
      } else if (t === b) {
        out += `${LOGO_FG[t]}█${RESET}`;
      } else {
        out += `${LOGO_FG[t]}${LOGO_BG[b]}▀${RESET}`;
      }
    }
    lines.push(out);
  }
  return { lines, width: LOGO_PIXELS[0].length };
}

const LOGO = buildLogo();
const LOGO_GAP = 1;

const COMPACT_MARK = "▰ TESTEIYA ▰";

export class TesteiyaWelcome implements Component {
  constructor(
    private readonly version: string,
    private modelName: string,
    private providerName: string,
    private skills: string[] = [],
  ) {}

  invalidate(): void {}

  setModel(modelName: string, providerName: string): void {
    this.modelName = modelName;
    this.providerName = providerName;
  }

  setLspServers(_servers: unknown[]): void {}

  render(termWidth: number): string[] {
    const width = Math.min(80, termWidth);
    if (width < 20) return [];

    const lines: string[] = [""];

    const combinedWidth = LOGO.width + LOGO_GAP + WORDMARK_WIDTH;
    if (width >= combinedWidth) {
      const leftPad = padding(Math.floor((width - combinedWidth) / 2));
      for (let i = 0; i < SHADOWED.lines.length; i++) {
        const logoRow = LOGO.lines[i] ?? padding(LOGO.width);
        lines.push(this.#fit(`${leftPad}${logoRow}${padding(LOGO_GAP)}${SHADOWED.lines[i]}`, width));
      }
    } else if (width >= WORDMARK_WIDTH + 2) {
      const leftPad = padding(Math.floor((width - WORDMARK_WIDTH) / 2));
      for (const row of SHADOWED.lines) {
        lines.push(this.#fit(`${leftPad}${row}`, width));
      }
    } else {
      lines.push(this.#center(`${BRIGHT}${COMPACT_MARK}${RESET}`, width));
    }

    lines.push("");
    lines.push(this.#center(`${PALE}AI Testing Agent${RESET} ${DIM}·${RESET} ${PALE}Testomat.io${RESET}`, width));
    lines.push("");

    lines.push(this.#center(`${DIM}${this.modelName} via ${this.providerName}${RESET}`, width));

    if (this.skills.length > 0) {
      const skillList = this.skills.slice(0, 6).join(`${DIM} · ${RESET}`);
      lines.push(this.#center(`${DIM}skills:${RESET} ${skillList}`, width));
    }

    lines.push("");
    lines.push(this.#center(`${DIM}/model switch · /project switch · /skills list · /help${RESET}`, width));
    lines.push("");

    return lines;
  }

  #fit(str: string, width: number): string {
    const w = visibleWidth(str);
    if (w > width) return truncateToWidth(str, width);
    return str + padding(width - w);
  }

  #center(str: string, width: number): string {
    const w = visibleWidth(str);
    if (w >= width) return truncateToWidth(str, width);
    const left = Math.floor((width - w) / 2);
    return padding(left) + str + padding(width - w - left);
  }
}

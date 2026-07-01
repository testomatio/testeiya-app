import { type Component, padding, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";

const BRIGHT = "\x1b[38;2;77;255;79m"; // #4dff4f
const SHADOW = "\x1b[38;2;0;70;28m"; // #00461c — deep forest green
const PALE = "\x1b[38;2;168;255;233m"; // #a8ffe9

// Top-to-bottom gradient: brightest at the first row, darkening downward.
const GRAD_TOP = [120, 255, 130]; // light spring green
const GRAD_BOT = [16, 110, 44]; // deep forest green

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

    if (width >= WORDMARK_WIDTH + 2) {
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

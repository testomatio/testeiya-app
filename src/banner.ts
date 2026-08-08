import { buildShadowedWordmark } from "../brand/wordmark.js";

/**
 * The full wordmark for a human at a terminal, a single line for a CI log.
 * Stderr, because stdout carries the report.
 */
export function banner(model: string, cwd: string): string {
  if (!process.stderr.isTTY || process.env.NO_COLOR) {
    return `  Testeiya · ${model} · ${cwd}\n`;
  }
  const { lines } = buildShadowedWordmark();
  return `${lines.join("\n")}\n\n  ${model} · ${cwd}\n`;
}

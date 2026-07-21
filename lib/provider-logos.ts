/**
 * Frontend presentation for LLM providers — logos only.
 *
 * The provider LIST and all config (models, transports, auth) come from the SDK
 * at runtime via `GET /api/providers` — nothing about providers is curated here.
 * This map only attaches a brand logo to a few well-known ids; every other
 * provider falls back to a generic mark. Brand marks are a deliberate exception
 * to the violet-only palette.
 *
 * Logos are SVGs in `public/providers/<file>` (served at `/providers/...`).
 */

const LOGO_BY_ID: Record<string, string> = {
  openai: "/providers/openai.svg",
  "openai-codex": "/providers/openai.svg",
  anthropic: "/providers/anthropic.svg",
  google: "/providers/google.svg",
  "google-gemini-cli": "/providers/google.svg",
  "google-antigravity": "/providers/google.svg",
  "github-copilot": "/providers/github-copilot.svg",
  openrouter: "/providers/openrouter.svg",
};

export function providerLogo(id: string): string {
  return LOGO_BY_ID[id] ?? "/providers/generic.svg";
}

import assert from "node:assert/strict";
import { test } from "node:test";
import attributionExtension from "../dist/src/attribution-extension.js";

test("openrouter requests are credited to Testeiya, not pi", () => {
  const headers = { "HTTP-Referer": "https://pi.dev", "X-OpenRouter-Title": "pi" };
  fire(headers, { provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" });

  assert.equal(headers["HTTP-Referer"], "https://testomat.ai/testeiya/");
  assert.equal(headers["X-OpenRouter-Title"], "Testeiya");
  assert.equal(headers["X-OpenRouter-Categories"], "cli-agent");
});

test("cloudflare names Testeiya as the client", () => {
  const headers = { "User-Agent": "pi-coding-agent" };
  fire(headers, { provider: "cloudflare-ai-gateway", baseUrl: "https://gateway.ai.cloudflare.com/v1/a/g" });

  assert.deepEqual(headers, { "User-Agent": "Testeiya" });
});

test("every other provider is left alone", () => {
  const headers = { "anthropic-version": "2023-06-01" };
  fire(headers, { provider: "anthropic", baseUrl: "https://api.anthropic.com/v1" });

  assert.deepEqual(headers, { "anthropic-version": "2023-06-01" });
});

function fire(headers, model) {
  let handler;
  attributionExtension({
    on: (event, fn) => {
      if (event === "before_provider_headers") handler = fn;
    },
  });
  handler({ type: "before_provider_headers", headers }, { model });
}

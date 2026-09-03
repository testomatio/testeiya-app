import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// pi names itself on the providers that publish a client identity (its own
// `core/provider-attribution.ts`), so without this every Testeiya run is
// credited to pi. `before_provider_headers` fires for every provider, hence the
// model check.
const OPENROUTER = {
  // OpenRouter identifies an app by its `HTTP-Referer`: that URL is the app's
  // page and its row in the openrouter.ai/apps rankings.
  "HTTP-Referer": "https://testomat.ai/testeiya/",
  "X-OpenRouter-Title": "Testeiya",
  "X-OpenRouter-Categories": "cli-agent",
};

// Cloudflare names the client by `User-Agent` in the AI Gateway logs.
const CLOUDFLARE = { "User-Agent": "Testeiya" };

/** Credit Testeiya, not pi, wherever a provider records who is calling. */
export default function attributionExtension(pi: ExtensionAPI): void {
  pi.on("before_provider_headers", (event, ctx: ExtensionContext) => {
    const attribution = attributionFor(ctx.model);
    if (attribution) Object.assign(event.headers, attribution);
  });
}

function attributionFor(model: ExtensionContext["model"]): Record<string, string> | undefined {
  if (!model) return undefined;
  if (model.provider === "openrouter" || model.baseUrl.includes("openrouter.ai")) return OPENROUTER;
  if (model.provider.startsWith("cloudflare") || model.baseUrl.includes("cloudflare.com")) return CLOUDFLARE;
  return undefined;
}

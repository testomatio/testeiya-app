import { createRuntime } from "./session.js";

export async function runModels(pattern: string | undefined, json?: boolean): Promise<number> {
  const runtime = await createRuntime();
  // Providers with a key, from the SDK catalog. getAvailable() probes the
  // network for every provider and one bad response takes the whole list down.
  const available = runtime
    .getProviders()
    .filter((provider) => runtime.hasConfiguredAuth(provider.id))
    .flatMap((provider) => runtime.getModels(provider.id));

  const ids = available
    .map((model) => `${model.provider}/${model.id}`)
    .filter((id) => !pattern || id.toLowerCase().includes(pattern.toLowerCase()))
    .sort();

  if (json) {
    process.stdout.write(`${JSON.stringify({ models: ids }, null, 2)}\n`);
    return 0;
  }

  if (ids.length === 0) {
    if (available.length > 0) {
      process.stdout.write(`  no model matches "${pattern}"\n`);
      return 1;
    }
    process.stdout.write("  no provider key found — see: testeiya doctor\n");
    return 1;
  }

  let provider = "";
  for (const id of ids) {
    const current = id.slice(0, id.indexOf("/"));
    if (current !== provider) {
      provider = current;
      process.stdout.write(`\n  ${provider}\n`);
    }
    process.stdout.write(`    ${id}\n`);
  }
  process.stdout.write("\n  Pass one with --model, or set TESTEIYA_MODEL.\n");
  return 0;
}

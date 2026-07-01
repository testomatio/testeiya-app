// Read a Testomat.io token from a folder's own `.env` (the check-tests
// convention) — the last-resort credential when no project is linked.

import fs from "node:fs";
import path from "node:path";
import { normalizeBaseUrl } from "../testomatio-auth.js";

export function readEnvToken(cwd: string): { token: string; baseUrl: string } | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(cwd, ".env"), "utf8");
  } catch {
    return null;
  }
  const env = parseEnv(raw);
  const token = env.TESTOMATIO;
  if (!token) return null;
  return { token, baseUrl: normalizeBaseUrl(env.TESTOMATIO_URL) };
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

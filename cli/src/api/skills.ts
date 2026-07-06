import {
  loadBundledSkills,
  loadCustomSkills,
  ensureCustomSkillsDir,
  dedupeSkillsByName,
  type CategorizedSkill,
} from "../skills.js";
import { getSession } from "../session-store.js";

/**
 * Lists the skills available to the agent, from two sources:
 *   1. prebuilt skills vendored from GitHub into `cli/skills` (per `skills.yaml`),
 *   2. the user's custom skills (`~/.testeiya/skills`, `<cwd>/.testeiya/skills`).
 * Pass `?session=<id>` to also include the workspace's per-project skills. Each
 * entry carries its `source` and its `category` for grouping — bundled skills get
 * it from their `cli/skills/<category>/` folder, custom skills from the folder.
 */
export function skillsList(req: Request): Response {
  const sessionId = new URL(req.url).searchParams.get("session");
  const session = sessionId ? getSession(sessionId) : null;
  const all: CategorizedSkill[] = [
    ...loadBundledSkills(),
    ...loadCustomSkills(session?.cwd),
  ];
  const skills = dedupeSkillsByName(all).map((s) => ({
    name: s.name,
    description: s.description,
    source: s.source,
    category: categoryFor(s),
  }));
  return Response.json({ skills });
}

/**
 * Opens the global custom-skills folder in the OS file manager so the user can
 * drop or symlink skills into it. Mirrors `open-external`: only the desktop
 * runtime can reveal a native folder, so web mode returns `opened: false` and
 * the client shows the path instead.
 */
export async function skillsOpen(): Promise<Response> {
  const path = ensureCustomSkillsDir();
  if (process.env.TESTEIYA_RUNTIME !== "desktop") {
    return Response.json({ opened: false, path });
  }
  try {
    const { Utils } = await import("electrobun/bun");
    Utils.openPath(path);
    return Response.json({ opened: true, path });
  } catch {
    return Response.json({ opened: false, path });
  }
}

function categoryFor(skill: CategorizedSkill): string {
  if (skill.category) return skill.category;
  if (skill.source === "custom") return "Custom";
  return "Other";
}

import { loadTestomatioSkills, loadPlaywrightCliSkill } from "../skills.js";

/**
 * Lists the skills bundled with the agent (from `@testomatio/skills` plus the
 * `playwright-cli` skill) so the UI can offer them in the prompt input's Skills
 * menu. Static — not session-bound.
 */
export function skillsList(): Response {
  const skills = [...loadTestomatioSkills(), ...loadPlaywrightCliSkill()].map((s) => ({
    name: s.name,
    description: s.description,
  }));
  return Response.json({ skills });
}

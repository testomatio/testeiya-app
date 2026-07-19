import * as cli from "./cli/Bunoshfile.js";

/**
 * Update the vendored external skills (cli/skills.yaml) into cli/skills/<vendor>/.
 * Folders the manifest does not own (e.g. cli/skills/testeiya/) are internal and never touched.
 * @param {string} vendor - only update this vendor (folder, owner, or owner/repo)
 */
export function update(vendor = "") {
  return cli.skillsUpdate(vendor);
}

/**
 * Scaffold a new internal skill at cli/skills/testeiya/<name>/SKILL.md.
 * @param {string} name - the new skill's name (slug)
 */
export function create(name) {
  return cli.skillsCreate(name);
}

/** List the skills tree (cli/skills) grouped by vendor. */
export function list() {
  return cli.skillsList();
}

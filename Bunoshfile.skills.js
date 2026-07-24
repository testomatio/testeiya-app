import * as cli from "./cli/Bunoshfile.js";

/**
 * Update the vendored external skills (cli/skills.yaml) into cli/skills/<vendor>/.
 * Folders the manifest does not own (e.g. cli/skills/testeiya/) are internal and never touched.
 * @param {string} vendor - only update this vendor (folder, owner, or owner/repo)
 * @param {object} options
 * @param {string} [options.repo=""] - update one source from a branch, as <owner/repo:branch>; fails when the repo or branch does not exist
 */
export function update(vendor = "", options = { repo: "" }) {
  return cli.skillsUpdate(vendor, options);
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

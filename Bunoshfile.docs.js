import * as cli from "./cli/Bunoshfile.js";

/**
 * Vendor the Testomat.io documentation (github.com/testomatio/docs) into the
 * internal testomatio-docs skill: the markdown under src/content/docs lands in
 * cli/skills/testeiya/testomatio-docs/docs/ with a generated INDEX.md, pinned
 * to a commit in docs.lock.json. Re-run on release to keep the skill current.
 * @param {object} options
 * @param {boolean} [options.force=false] - Re-download even when the pinned commit is unchanged
 */
export function update(options = { force: false }) {
  return cli.docsUpdate(options);
}

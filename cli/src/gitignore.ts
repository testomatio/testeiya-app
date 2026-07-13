// Reads a workspace's `.gitignore` files so the file tree and the workspace
// classifier can skip git-ignored paths (e.g. a Rails `storage/` blob cache).
//
// A chain accumulates one matcher per `.gitignore` found on the way down from
// the root, each rooted at the dir it lives in. `descend` extends the chain
// with a subdir's `.gitignore` as the walk enters it, so nested rules apply to
// exactly the subtree they belong to. Paths passed to `ignores` are POSIX and
// relative to the chain's root.

import fs from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";

export function loadGitignore(root: string): GitignoreChain {
  return chain(root, readMatchers(root, ""));
}

function chain(root: string, matchers: Matcher[]): GitignoreChain {
  return {
    ignores(relPosix) {
      for (const m of matchers) {
        const sub = m.base === "" ? relPosix : relPosix.slice(m.base.length + 1);
        if (m.ig.ignores(sub)) return true;
      }
      return false;
    },
    descend(dirRelPosix) {
      const extra = readMatchers(root, dirRelPosix);
      if (extra.length === 0) return this;
      return chain(root, [...matchers, ...extra]);
    },
  };
}

function readMatchers(root: string, baseRel: string): Matcher[] {
  let content: string;
  try {
    content = fs.readFileSync(path.join(root, baseRel, ".gitignore"), "utf8");
  } catch {
    return [];
  }
  return [{ base: baseRel, ig: ignore().add(content) }];
}

export interface GitignoreChain {
  ignores(relPosix: string): boolean;
  descend(dirRelPosix: string): GitignoreChain;
}

interface Matcher {
  base: string; // POSIX path of the .gitignore's dir, relative to root ("" = root)
  ig: Ignore;
}

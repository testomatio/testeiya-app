import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "ft-home-"));
process.env.HOME = home;
const store = await import("../src/session-store.js");
const { filesTree } = await import("../src/api/files-tree.js");

const MIXED = `<!-- suite
id: @Sabc12345
-->
# Notifications

<!-- test
id: @T00000001
type: manual
-->
# Manual one

<!-- test
id: @T00000002
type: automated
-->
# Automated one

<!-- test
id: @T00000003
-->
# Typeless counts as manual
`;

test("a mixed suite lists every test, tagged with its type", async () => {
  const cwd = makeWorkspace({ "mixed.test.md": MIXED });
  store.createSession(makeData("ft1", cwd));
  const tree = await fetchTree("ft1");
  const tests = find(tree, "mixed.test.md")?.children ?? [];
  expect(tests.map((t) => [t.name, t.testType])).toEqual([
    ["Manual one", "manual"],
    ["Automated one", "automated"],
    ["Typeless counts as manual", "manual"],
  ]);
});

test("a workspace holding both kinds shows one tab labelled tests", async () => {
  const cwd = makeWorkspace({ "mixed.test.md": MIXED });
  store.createSession(makeData("ft2", cwd));
  const tree = await fetchTree("ft2");
  expect(tree.types).toEqual([{ type: "manual", dir: "", label: "tests" }]);
});

test("an all-manual workspace keeps the plain manual tab", async () => {
  const cwd = makeWorkspace({
    "only.test.md": "<!-- test\nid: @T5\ntype: manual\n-->\n# Just manual\n",
  });
  store.createSession(makeData("ft3", cwd));
  const tree = await fetchTree("ft3");
  expect(tree.types).toEqual([{ type: "manual", dir: "" }]);
});

function makeWorkspace(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ws-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, "utf8");
  }
  return dir;
}

function makeData(sessionId: string, cwd: string) {
  return { sessionId, cwd, createdAt: Date.now(), projects: [], tokens: {} } as never;
}

async function fetchTree(session: string) {
  const res = await filesTree(new Request(`http://x/api/files/tree?session=${session}`));
  return res.json();
}

function find(tree: { nodes: Node[] }, name: string): Node | undefined {
  return tree.nodes.find((n) => n.name === name);
}

interface Node {
  name: string;
  testType?: string;
  children?: Node[];
}

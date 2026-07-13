import { test, expect, describe, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectManualProject,
  detectWorkspaceType,
  describeWorkspace,
  resolveManualTestsDir,
} from "../src/workspace-model.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("detectManualProject", () => {
  test("empty dir is not a manual project", () => {
    const d = tmp();
    expect(detectManualProject(d)).toBe(false);
    expect(resolveManualTestsDir(d)).toBeNull();
  });

  test("all *.test.md at the root is a manual project", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    expect(detectManualProject(d)).toBe(true);
    expect(resolveManualTestsDir(d)).toBe("");
  });

  test("exactly 90% test files is inclusive", () => {
    const d = tmp();
    for (let i = 0; i < 9; i++) write(d, `t${i}.test.md`, "# t");
    write(d, "readme.md", "# readme");
    expect(detectManualProject(d)).toBe(true);
  });

  test("below 90% test files is not a manual project", () => {
    const d = tmp();
    for (let i = 0; i < 9; i++) write(d, `t${i}.test.md`, "# t");
    write(d, "readme.md", "# readme");
    write(d, "license.md", "# license");
    expect(detectManualProject(d)).toBe(false);
  });

  test("vendor dirs are excluded from detection", () => {
    const d = tmp();
    write(d, "node_modules/x.test.md", "# x");
    write(d, "code.js", "// code");
    expect(detectManualProject(d)).toBe(false);
  });

  test("dotfiles and dot-dirs are skipped", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, ".hidden/junk1.md", "# j");
    write(d, ".hidden/junk2.md", "# j");
    expect(detectManualProject(d)).toBe(true);
  });
});

describe("gitignore filtering", () => {
  test("a git-ignored subtree (Rails storage) is excluded from classification", () => {
    const d = tmp();
    write(d, ".gitignore", "/storage/*\n");
    write(d, "a.test.md", "# a");
    for (let i = 0; i < 50; i++) write(d, `storage/${i}/blob`, "x");
    // Without gitignore the 50 extensionless blobs would sink the test-file
    // ratio below 90% and it would no longer read as a manual project.
    expect(detectManualProject(d)).toBe(true);
  });

  test("a root .gitignore keeps code out of the code bucket", () => {
    const d = tmp();
    write(d, ".gitignore", "generated/\n");
    write(d, "a.test.md", "# a");
    for (let i = 0; i < 50; i++) write(d, `generated/gen${i}.ts`, "// gen");
    expect(detectWorkspaceType(d)).toBe("manual");
  });

  test("a nested .gitignore applies only to its own subtree", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "src/.gitignore", "generated/\n");
    for (let i = 0; i < 50; i++) write(d, `src/generated/gen${i}.ts`, "// gen");
    expect(detectWorkspaceType(d)).toBe("manual");
  });
});

describe("resolveManualTestsDir", () => {
  test("the .testeiya/manual-tests cache wins even over a code repo", () => {
    const d = tmp();
    write(d, "code.js", "// code");
    write(d, ".testeiya/manual-tests/foo.md", "# foo");
    expect(resolveManualTestsDir(d)).toBe(".testeiya/manual-tests");
  });
});

describe("detectWorkspaceType", () => {
  test("empty and assets-only dirs are files", () => {
    expect(detectWorkspaceType(tmp())).toBe("files");
    const d = tmp();
    write(d, "shot.png", "x");
    write(d, "clip.mp4", "x");
    expect(detectWorkspaceType(d)).toBe("files");
  });

  test("only *.test.md (case-insensitive) is manual", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "B.TEST.MD", "# b");
    expect(detectWorkspaceType(d)).toBe("manual");
  });

  test("test.md plus image/video assets is still manual", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    write(d, "screenshot.png", "x");
    write(d, "recording.mp4", "x");
    expect(detectWorkspaceType(d)).toBe("manual");
  });

  test("9 test.md + 1 readme is manual, 8 + 2 is not", () => {
    const a = tmp();
    for (let i = 0; i < 9; i++) write(a, `t${i}.test.md`, "# t");
    write(a, "readme.md", "# r");
    expect(detectWorkspaceType(a)).toBe("manual");
    const b = tmp();
    for (let i = 0; i < 8; i++) write(b, `t${i}.test.md`, "# t");
    write(b, "readme.md", "# r");
    write(b, "license.md", "# l");
    expect(detectWorkspaceType(b)).toBe("files");
  });

  test("a folder of automated tests across ecosystems is automated", () => {
    const d = tmp();
    for (const name of [
      "a.spec.ts", "b.test.js", "c.cy.ts", "FooTest.java", "BarIT.kt",
      "x_test.go", "test_y.py", "z_spec.rb", "LoginTest.php", "login.feature",
    ]) {
      write(d, name, "x");
    }
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("a plain source file is not an automated test", () => {
    const d = tmp();
    write(d, "Unit.java", "class Unit {}");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("mostly source with a few specs is code", () => {
    const d = tmp();
    for (let i = 0; i < 8; i++) write(d, `mod${i}.js`, "// code");
    write(d, "a.spec.js", "x");
    write(d, "b.spec.js", "x");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("manual + automated tests together is mixed", () => {
    const d = tmp();
    write(d, "login.test.md", "# login");
    write(d, "login.spec.js", "x");
    expect(detectWorkspaceType(d)).toBe("mixed");
  });

  test("source-only is code, docs-only is files", () => {
    const src = tmp();
    write(src, "a.ts", "export {}");
    write(src, "b.java", "class B {}");
    expect(detectWorkspaceType(src)).toBe("code");
    const docs = tmp();
    write(docs, "readme.md", "# r");
    write(docs, "notes.txt", "notes");
    expect(detectWorkspaceType(docs)).toBe("files");
  });

  test("tests inside vendor and dot dirs do not count", () => {
    const d = tmp();
    write(d, "node_modules/a.spec.js", "x");
    write(d, ".hidden/b.spec.js", "x");
    expect(detectWorkspaceType(d)).toBe("files");
  });

  test("9 test.md + 1 spec.js stays manual (manual wins the tie)", () => {
    const d = tmp();
    for (let i = 0; i < 9; i++) write(d, `t${i}.test.md`, "# t");
    write(d, "stray.spec.js", "x");
    expect(detectWorkspaceType(d)).toBe("manual");
    expect(detectManualProject(d)).toBe(true);
  });

  test("CodeceptJS-style *_test.js files are automated tests", () => {
    const d = tmp();
    write(d, "tests/login_test.js", "x");
    write(d, "tests/logout_test.js", "x");
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("a framework config beats a mostly-code ratio", () => {
    const d = tmp();
    for (let i = 0; i < 20; i++) write(d, `src/mod${i}.ts`, "// code");
    write(d, "tests/login.test.ts", "x");
    write(d, "codecept.conf.ts", "export const config = {}");
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("playwright.config.ts marks an automated project even with no tests yet", () => {
    const d = tmp();
    write(d, "playwright.config.ts", "export default {}");
    write(d, "src/app.ts", "// code");
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("a test framework in package.json deps marks it automated", () => {
    const d = tmp();
    for (let i = 0; i < 10; i++) write(d, `src/mod${i}.ts`, "// code");
    write(d, "package.json", JSON.stringify({ devDependencies: { playwright: "^1.60.0" } }));
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("a config plus manual tests is mixed", () => {
    const d = tmp();
    write(d, "cypress.config.js", "module.exports = {}");
    write(d, "smoke.test.md", "# smoke");
    write(d, "src/app.js", "// code");
    expect(detectWorkspaceType(d)).toBe("mixed");
  });

  test("app config files that are not test frameworks stay code", () => {
    const d = tmp();
    write(d, "app.config.js", "module.exports = {}");
    write(d, "package.json", JSON.stringify({ scripts: { test: 'echo "no tests" && exit 1' } }));
    for (let i = 0; i < 5; i++) write(d, `src/mod${i}.ts`, "// code");
    expect(detectWorkspaceType(d)).toBe("code");
  });
});

describe("describeWorkspace types", () => {
  test("a manual project offers a single manual toggle", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    expect(describeWorkspace(d).types).toEqual([{ type: "manual", dir: "" }]);
  });

  test("automated root + manual-tests + code + other files", () => {
    const d = tmp();
    write(d, "a.spec.js", "x");
    write(d, "b.spec.js", "x");
    write(d, "c.spec.js", "x");
    write(d, "helper.js", "// code");
    write(d, ".testeiya/manual-tests/login.test.md", "# login");
    write(d, ".testeiya/code/util.js", "// code");
    const info = describeWorkspace(d);
    expect(info.manualTestsDir).toBe(".testeiya/manual-tests");
    expect(info.types).toEqual([
      { type: "automated", dir: "" },
      { type: "manual", dir: ".testeiya/manual-tests" },
      { type: "code", dir: ".testeiya/code" },
      { type: "files", dir: "" },
    ]);
  });

  test("a code repo with a manual-tests overlay offers code, manual and files", () => {
    const d = tmp();
    write(d, "go.mod", "module x");
    write(d, "main.go", "package main");
    write(d, "util.go", "package main");
    write(d, ".testeiya/manual-tests/login.test.md", "# login");
    const info = describeWorkspace(d);
    expect(info.type).toBe("code");
    expect(info.types).toEqual([
      { type: "code", dir: "" },
      { type: "manual", dir: ".testeiya/manual-tests" },
      { type: "files", dir: "" },
    ]);
  });

  test("a pure code repo has no separate files toggle", () => {
    const d = tmp();
    write(d, "go.mod", "module x");
    write(d, "main.go", "package main");
    write(d, "util.go", "package main");
    expect(describeWorkspace(d).types).toEqual([{ type: "code", dir: "" }]);
  });

  test("a mixed root offers automated, manual and a browse toggle", () => {
    const d = tmp();
    write(d, "login.test.md", "# login");
    write(d, "login.spec.js", "x");
    write(d, "helper.js", "// code");
    expect(describeWorkspace(d).types).toEqual([
      { type: "automated", dir: "" },
      { type: "manual", dir: "" },
      { type: "files", dir: "" },
    ]);
  });

  test("a pure automated folder has no browse toggle", () => {
    const d = tmp();
    write(d, "a.spec.js", "x");
    write(d, "b.spec.js", "x");
    expect(describeWorkspace(d).types).toEqual([{ type: "automated", dir: "" }]);
  });

  test("empty .testeiya subdirs are skipped and skills ignored", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    fs.mkdirSync(path.join(d, ".testeiya", "code"), { recursive: true });
    write(d, ".testeiya/skills/readme.md", "# skills");
    expect(describeWorkspace(d).types).toEqual([{ type: "manual", dir: "" }]);
  });

  test("a root manual project can also expose .testeiya/code", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    write(d, ".testeiya/code/util.js", "// code");
    const info = describeWorkspace(d);
    expect(info.isProject).toBe(true);
    expect(info.types).toEqual([
      { type: "manual", dir: "" },
      { type: "code", dir: ".testeiya/code" },
    ]);
  });

  test("a manual root whose cache also has markdown yields one manual entry", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    write(d, ".testeiya/manual-tests/x.md", "# x");
    expect(describeWorkspace(d).types).toEqual([{ type: "manual", dir: "" }]);
  });
});

describe("application repos are code, e2e repos are automated", () => {
  test("a Rails app with an rspec suite is code, not automated", () => {
    const d = tmp();
    write(d, "Gemfile", "gem 'rails'");
    write(d, "config.ru", "run App");
    write(d, "Rakefile", "task :default");
    write(d, ".rspec", "--require spec_helper");
    write(d, "app/models/user.rb", "class User; end");
    write(d, "app/models/post.rb", "class Post; end");
    write(d, "app/controllers/app_controller.rb", "class AppController; end");
    write(d, "config/routes.rb", "Rails.routes");
    write(d, "app/views/index.html.erb", "<h1></h1>");
    write(d, "app/views/show.html.erb", "<h1></h1>");
    write(d, "config/database.yml", "development:");
    write(d, "spec/models/user_spec.rb", "describe User");
    write(d, "spec/models/post_spec.rb", "describe Post");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("a Django app with a pytest suite is code, not automated", () => {
    const d = tmp();
    write(d, "manage.py", "def main(): pass");
    write(d, "pyproject.toml", "[project]");
    write(d, "pytest.ini", "[pytest]");
    write(d, "conftest.py", "import pytest");
    write(d, "app/models.py", "class Model: pass");
    write(d, "app/views.py", "def index(): pass");
    write(d, "app/urls.py", "urlpatterns = []");
    for (const t of ["base", "home", "list", "detail"]) write(d, `templates/${t}.html`, "<html></html>");
    write(d, "tests/test_models.py", "def test_x(): pass");
    write(d, "tests/test_views.py", "def test_y(): pass");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("a PHP app with a phpunit suite is code, not automated", () => {
    const d = tmp();
    write(d, "composer.json", JSON.stringify({ require: { "php": "^8.2" } }));
    write(d, "phpunit.xml", "<phpunit/>");
    write(d, "src/User.php", "<?php class User {}");
    write(d, "src/Post.php", "<?php class Post {}");
    write(d, "src/Controller.php", "<?php class Controller {}");
    for (const v of ["home", "about", "contact"]) write(d, `resources/${v}.html`, "<html></html>");
    write(d, "tests/UserTest.php", "<?php class UserTest {}");
    write(d, "tests/PostTest.php", "<?php class PostTest {}");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("a jest/TS library is code, not automated", () => {
    const d = tmp();
    write(d, "package.json", JSON.stringify({ name: "lib", devDependencies: { jest: "^29" } }));
    write(d, "tsconfig.json", "{}");
    write(d, "jest.config.js", "module.exports = {}");
    for (let i = 0; i < 6; i++) write(d, `src/mod${i}.ts`, "export const x = 1");
    write(d, "src/index.test.ts", "test('x', () => {})");
    write(d, "README.md", "# lib");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("a small manifest-marked repo diluted by data is still code", () => {
    const d = tmp();
    write(d, "go.mod", "module x");
    write(d, "main.go", "package main");
    write(d, "util.go", "package main");
    write(d, "Dockerfile", "FROM scratch");
    for (let i = 0; i < 6; i++) write(d, `data/f${i}.yml`, "k: v");
    write(d, "README.md", "# x");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("a page-object-heavy Playwright repo is automated", () => {
    const d = tmp();
    write(d, "playwright.config.ts", "export default {}");
    write(d, "package.json", JSON.stringify({ devDependencies: { "@playwright/test": "^1.60" } }));
    for (const p of ["login", "home", "cart", "checkout", "profile"]) {
      write(d, `pages/${p}.page.ts`, "export class Page {}");
    }
    write(d, "tests/login.spec.ts", "test('login', () => {})");
    write(d, "tests/checkout.spec.ts", "test('checkout', () => {})");
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("a Cypress config alone marks an automated project", () => {
    const d = tmp();
    write(d, "cypress.config.js", "module.exports = {}");
    write(d, "src/app.js", "// code");
    expect(detectWorkspaceType(d)).toBe("automated");
  });

  test("a unit-test config alone does not force automated", () => {
    const d = tmp();
    write(d, ".rspec", "--require spec_helper");
    write(d, "Gemfile", "gem 'rspec'");
    for (let i = 0; i < 5; i++) write(d, `lib/mod${i}.rb`, "class M; end");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("source files below the ratio without a manifest stay files", () => {
    const d = tmp();
    write(d, "one.go", "package main");
    write(d, "two.go", "package main");
    for (let i = 0; i < 8; i++) write(d, `notes/n${i}.txt`, "notes");
    expect(detectWorkspaceType(d)).toBe("files");
  });

  test("a manifest without any source code is not code", () => {
    const d = tmp();
    write(d, "Makefile", "all:");
    write(d, "README.md", "# docs");
    write(d, "guide.md", "# guide");
    expect(detectWorkspaceType(d)).toBe("files");
  });

  test("source files below the ratio are code inside a git repo", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".git"));
    write(d, "one.go", "package main");
    write(d, "two.go", "package main");
    for (let i = 0; i < 8; i++) write(d, `notes/n${i}.txt`, "notes");
    expect(detectWorkspaceType(d)).toBe("code");
  });

  test("a git repo without any source code is not code", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".git"));
    write(d, "README.md", "# docs");
    write(d, "guide.md", "# guide");
    expect(detectWorkspaceType(d)).toBe("files");
  });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "wm-"));
  dirs.push(d);
  return d;
}

function write(dir: string, rel: string, content: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

import { join } from "node:path";

const { shell, task } = global.bunosh;

const CLI_ROOT = join(import.meta.dir, "cli");

/** Run the web UI (:3050, hot reload) and the agent app-server (:3210) together. */
export async function dev() {
  await Promise.all([
    shell`next dev -p 3050`,
    shell`bun --watch src/app-server.ts`.cwd(CLI_ROOT).env({ PORT: "3210" }),
  ]);
}

/** Build the static UI into out/ (next export). */
export async function build() {
  await shell`next build`.env({ NEXT_EXPORT: "1" });
}

/** Build the static UI, then open the Electrobun desktop shell (dev). */
export async function desktopDev() {
  const built = await shell`next build`.env({ NEXT_EXPORT: "1" });
  if (built.hasFailed) return;
  await task.try(() => shell`find cli/node_modules -type l ! -exec test -e {} \\; -delete`);
  await shell`electrobun dev`.env({ GLIBC_TUNABLES: "glibc.rtld.optional_static_tls=20480" });
}

/** Build the static UI and package the desktop installers. */
export async function desktopBuild() {
  const pre = await shell`bash .github/packaging/pre-desktop-build.sh`;
  if (pre.hasFailed) return;
  const built = await shell`next build`.env({ NEXT_EXPORT: "1" });
  if (built.hasFailed) return;
  await shell`electrobun build`;
}

/** Build and package a stable desktop release, then fix the macOS min-OS field. */
export async function desktopRelease() {
  const pre = await shell`bash .github/packaging/pre-desktop-build.sh`;
  if (pre.hasFailed) return;
  const built = await shell`next build`.env({ NEXT_EXPORT: "1" });
  if (built.hasFailed) return;
  const packaged = await shell`electrobun build --env=stable`;
  if (packaged.hasFailed) return;
  await shell`bash .github/packaging/fix-macos-minos.sh`;
}

/** Lint the codebase (eslint). */
export async function lint() {
  await shell`eslint`;
}

/** Typecheck the frontend (tsc --noEmit). */
export async function typecheck() {
  await shell`tsc --noEmit`;
}

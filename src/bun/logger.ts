/**
 * Persistent file logging for the desktop shell.
 *
 * Importing this module (it must be the FIRST import in the Electrobun main
 * entry) opens the shared `~/.testeiya/logs/` file log — teeing every
 * `console.*` call and recording uncaught exceptions — before anything else
 * runs, so a packaged app that crashes on launch leaves a trace on disk instead
 * of dying silently behind the window. The actual logging lives in the shared
 * `cli/src/file-log.ts` so desktop, web, and the terminal CLI all log the same.
 */
import { migrateLegacyHomeDir } from "../../cli/src/project-dir";
import { initFileLog, appLogPath } from "../../cli/src/file-log";

migrateLegacyHomeDir();
initFileLog("desktop");

export const logPath = appLogPath() ?? "";

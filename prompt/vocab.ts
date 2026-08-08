/**
 * The per-project config directory name, as the agent knows it. Part of the
 * vocabulary the system prompt teaches — every path the prompt names below it
 * (`.testeiya/manual-tests`, `.testeiya/project-info.json`, …) is built from
 * this constant, so the prompt and the harness can never disagree about it.
 */
export const TESTEIYA_DIR_NAME = ".testeiya";

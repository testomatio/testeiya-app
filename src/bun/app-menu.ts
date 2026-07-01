/**
 * Native application menu for the desktop shell.
 *
 * On macOS the standard text-editing shortcuts (Cmd+C/V/X/Z/A …) only reach the
 * webview when the app has an Edit menu whose items carry the matching native
 * roles + key equivalents. Electrobun maps each `role` to its NSResponder
 * selector, but the key equivalent comes from the explicit `accelerator`, so we
 * set both here. Without this menu the shortcuts silently do nothing.
 */
import { ApplicationMenu } from "electrobun/bun";

export function installApplicationMenu(appName: string): void {
  if (process.platform !== "darwin") return;

  ApplicationMenu.setApplicationMenu([
    {
      label: appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide", accelerator: "CmdOrCtrl+H" },
        { role: "hideOthers", accelerator: "CmdOrCtrl+Option+H" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit", accelerator: "CmdOrCtrl+Q" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", accelerator: "CmdOrCtrl+Z" },
        { role: "redo", accelerator: "CmdOrCtrl+Shift+Z" },
        { type: "separator" },
        { role: "cut", accelerator: "CmdOrCtrl+X" },
        { role: "copy", accelerator: "CmdOrCtrl+C" },
        { role: "paste", accelerator: "CmdOrCtrl+V" },
        { role: "pasteAndMatchStyle", accelerator: "CmdOrCtrl+Shift+V" },
        { role: "delete" },
        { role: "selectAll", accelerator: "CmdOrCtrl+A" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "toggleFullScreen", accelerator: "Control+CmdOrCtrl+F" }],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize", accelerator: "CmdOrCtrl+M" },
        { role: "zoom" },
        { type: "separator" },
        { role: "close", accelerator: "CmdOrCtrl+W" },
      ],
    },
  ]);
}

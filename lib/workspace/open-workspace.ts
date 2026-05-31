import { toast } from "sonner";

/**
 * Open a local directory as the agent's workspace and switch the app to the new
 * session. Uses Electrobun's native folder picker when available (desktop),
 * falling back to a prompt for the path (browser/standalone). `presetPath`
 * skips the picker (used when the caller already has a path).
 */
export async function openWorkspaceFlow(presetPath?: string): Promise<void> {
  let path: string | null = presetPath?.trim() || null;

  if (!path) {
    try {
      const res = await fetch("/api/workspace/pick", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (data.available) {
        path = data.path; // null if the user cancelled the native dialog
      } else {
        path = window.prompt("Enter the folder path to open as workspace:")?.trim() || null;
      }
    } catch {
      path = window.prompt("Enter the folder path to open as workspace:")?.trim() || null;
    }
  }

  if (!path) return; // cancelled

  try {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    toast.success(`Opening ${data.cwd}`);
    // Switch the app to the new workspace session (reloads the SPA).
    window.location.search = `?session=${encodeURIComponent(data.sessionId)}`;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to open workspace");
  }
}

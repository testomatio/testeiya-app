import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type { SkillInfo } from "./types";
import type { RootStore } from "./root-store";

/**
 * Lists the agent's skills (from `GET /api/skills`) for the prompt input's
 * Skills menu — the bundled skills plus the user's custom ones. The list is
 * fetched lazily and cached; switching workspaces invalidates the cache so
 * per-project skills reload. `refresh()` forces a reload (the menu's Refresh
 * button) and `openFolder()` reveals the custom-skills folder.
 */
export class SkillsService {
  skills: SkillInfo[] = [];
  loading = false;
  loaded = false;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false }, { autoBind: true });
    reaction(
      () => this.root.sessionId,
      () => runInAction(() => {
        this.loaded = false;
      })
    );
  }

  async load() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    const session = this.root.sessionId ?? "";
    try {
      const data = await getJson<{ skills: SkillInfo[] }>(
        `/api/skills?session=${encodeURIComponent(session)}`
      );
      runInAction(() => {
        this.skills = data.skills;
        this.loaded = true;
      });
    } catch {
      /* leave empty; the menu just shows nothing */
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async refresh() {
    runInAction(() => {
      this.loaded = false;
    });
    await this.load();
  }

  async openFolder() {
    try {
      const data = await postJson<{ opened: boolean; path: string }>("/api/skills/open");
      if (!data.opened) toast(`Add or symlink skills in ${data.path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open skills folder");
    }
  }
}

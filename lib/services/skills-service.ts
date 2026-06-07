import { makeAutoObservable, runInAction } from "mobx";
import { getJson } from "./http";
import type { SkillInfo } from "./types";
import type { RootStore } from "./root-store";

/**
 * Lists the agent's bundled skills (from `GET /api/skills`) for the prompt
 * input's Skills menu. The list is static across sessions, so it's fetched once
 * and cached; the views only read `skills` and call `load()`.
 */
export class SkillsService {
  skills: SkillInfo[] = [];
  loading = false;
  loaded = false;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false }, { autoBind: true });
  }

  async load() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    try {
      const data = await getJson<{ skills: SkillInfo[] }>("/api/skills");
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
}

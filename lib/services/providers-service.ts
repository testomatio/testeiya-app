import { makeAutoObservable, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type {
  Current,
  LoginState,
  ProviderInfo,
  ProviderModel,
  ThinkingLevel,
} from "./types";
import type { RootStore } from "./root-store";

const POLL_MS = 2000;

/**
 * Providers & models business logic: list providers, discover models, select a
 * provider/model, save API keys, and the OAuth sign-in flow (start + poll +
 * manual code). Selection applies on the next session start. Views read/call.
 */
export class ProvidersService {
  providers: ProviderInfo[] = [];
  current: Current | null = null;
  loading = false;
  models = new Map<string, ProviderModel[]>();
  login: LoginState | null = null;
  // Agent reasoning effort (global, applies on next session). Options come from
  // the server so the list stays in sync with the SDK.
  thinkingLevel: ThinkingLevel | null = null;
  thinkingLevels: ThinkingLevel[] = [];
  /** Set after a sign-in auto-selects a provider — surfaces a "reload" banner. */
  applied: Current | null = null;

  // public so it can be excluded in the overrides map (`keyof this` omits privates)
  pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      { root: false, pollTimer: false },
      { autoBind: true }
    );
  }

  get label(): string | null {
    return this.current ? `${this.current.provider}/${this.current.model}` : null;
  }

  async refresh(): Promise<void> {
    runInAction(() => {
      this.loading = true;
    });
    try {
      const data = await getJson<{
        providers?: ProviderInfo[];
        current?: Current | null;
        thinkingLevel?: ThinkingLevel | null;
        thinkingLevels?: ThinkingLevel[];
      }>("/api/providers");
      runInAction(() => {
        this.providers = data.providers ?? [];
        this.current = data.current ?? null;
        this.thinkingLevel = data.thinkingLevel ?? null;
        if (data.thinkingLevels) this.thinkingLevels = data.thinkingLevels;
      });
    } catch {
      runInAction(() => {
        this.providers = [];
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async loadModels(provider: string): Promise<ProviderModel[]> {
    const data = await getJson<{ models?: ProviderModel[]; default?: string }>(
      `/api/providers/models?provider=${encodeURIComponent(provider)}`
    );
    const models = data.models ?? [];
    runInAction(() => {
      this.models.set(provider, models);
    });
    return models;
  }

  /** Default model the server suggests for a provider (best-effort cache read). */
  modelsFor(provider: string): ProviderModel[] {
    return this.models.get(provider) ?? [];
  }

  async select(provider: string, model?: string): Promise<void> {
    const data = await postJson<{ current?: Current }>("/api/providers/select", {
      provider,
      ...(model ? { model } : {}),
    });
    runInAction(() => {
      if (data.current) this.current = data.current;
    });
    if (model) {
      toast.success(
        `Now using ${provider} / ${model} — applies on next session (clear chat or reload)`
      );
    }
  }

  /** Set the agent thinking level (applies on the next session start). */
  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    const prev = this.thinkingLevel;
    runInAction(() => {
      this.thinkingLevel = level; // optimistic
    });
    try {
      await postJson("/api/providers/thinking", { thinkingLevel: level });
      toast.success(
        `Thinking set to ${level} — applies on next session (clear chat or reload)`
      );
    } catch (err) {
      runInAction(() => {
        this.thinkingLevel = prev; // revert on failure
      });
      toast.error(err instanceof Error ? err.message : "Failed to set thinking level");
    }
  }

  async saveKey(provider: string, apiKey: string): Promise<void> {
    await postJson("/api/providers/key", { provider, apiKey });
    toast.success(`Key saved for ${provider}`);
    await this.refresh();
  }

  async logout(provider: string): Promise<void> {
    await postJson("/api/providers/logout", { provider });
    runInAction(() => {
      if (this.login?.provider === provider) this.login = null;
    });
    toast.success(`Removed credentials for ${provider}`);
    await this.refresh();
  }

  async startLogin(provider: string): Promise<void> {
    runInAction(() => {
      this.login = { provider, status: "pending" };
    });
    try {
      const data = await postJson<LoginState>("/api/providers/login", {
        provider,
      });
      runInAction(() => {
        this.login = {
          provider,
          status: data.status,
          authUrl: data.authUrl,
          instructions: data.instructions,
          error: data.error,
        };
      });
      // Desktop opens the browser server-side; in a plain browser we open it too.
      if (data.authUrl && typeof window !== "undefined") {
        window.open(data.authUrl, "_blank", "noopener");
      }
      if (data.status === "pending") this.startPoll(provider);
    } catch (err) {
      runInAction(() => {
        this.login = {
          provider,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      });
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  async submitCode(provider: string, code: string): Promise<void> {
    try {
      await postJson(`/api/providers/login/${encodeURIComponent(provider)}/code`, {
        code,
      });
      toast.success("Code submitted — finishing sign-in…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit code");
    }
  }

  // --- OAuth polling ---
  private startPoll(provider: string) {
    this.stopPoll();
    this.pollTimer = setInterval(() => void this.poll(provider), POLL_MS);
  }

  private stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(provider: string): Promise<void> {
    if (this.login?.provider !== provider || this.login.status !== "pending") {
      this.stopPoll();
      return;
    }
    let data: LoginState;
    try {
      data = await getJson<LoginState>(
        `/api/providers/login/${encodeURIComponent(provider)}`
      );
    } catch {
      return; // transient — keep polling
    }
    if (this.login?.provider !== provider) return;
    if (data.status === "done") {
      this.stopPoll();
      runInAction(() => {
        this.login = null;
      });
      toast.success(`Signed in to ${provider}`);
      await this.applyLogin(provider);
    } else if (data.status === "error") {
      this.stopPoll();
      runInAction(() => {
        this.login = { provider, status: "error", error: data.error };
      });
      toast.error(data.error || "Sign-in failed");
    } else {
      runInAction(() => {
        if (this.login && this.login.provider === provider) {
          this.login = {
            ...this.login,
            authUrl: data.authUrl ?? this.login.authUrl,
            instructions: data.instructions ?? this.login.instructions,
            progress: data.progress ?? this.login.progress,
          };
        }
      });
    }
  }

  // On sign-in, make that provider active (SDK default model) + show a banner.
  private async applyLogin(provider: string): Promise<void> {
    try {
      const data = await postJson<{ current?: Current }>(
        "/api/providers/select",
        { provider }
      );
      runInAction(() => {
        if (data.current) {
          this.current = data.current;
          this.applied = data.current;
        }
      });
    } catch {
      /* best-effort — refresh still reflects the new credential */
    }
    await this.refresh();
  }
}

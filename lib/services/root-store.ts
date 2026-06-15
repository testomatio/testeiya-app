import { makeAutoObservable } from "mobx";
import { WorkspaceService } from "./workspace-service";
import { SearchService } from "./search-service";
import { ProjectService } from "./project-service";
import { ConnectionsService } from "./connections-service";
import { ProvidersService } from "./providers-service";
import { SkillsService } from "./skills-service";
import { BrowserService } from "./browser-service";
import { MemoryService } from "./memory-service";
import { SessionsService } from "./sessions-service";
import { WidgetService } from "./widget-service";
import { DebugLogService } from "./debug-log-service";

/**
 * Composition root for the client service layer. Owns the shared, observable
 * `sessionId` (mirrored from the URL by ServicesProvider) — services react to
 * it — and a `navigate` callback (injected from React) so services can switch
 * sessions without importing the router. The single place to wire cross-service
 * dependencies (project ↔ workspace) later.
 */
export class RootStore {
  sessionId: string | null = null;
  navigate: (sessionId: string) => void = () => {};

  workspace: WorkspaceService;
  search: SearchService;
  project: ProjectService;
  connections: ConnectionsService;
  providers: ProvidersService;
  skills: SkillsService;
  browser: BrowserService;
  memory: MemoryService;
  sessions: SessionsService;
  widget: WidgetService;
  debug: DebugLogService;

  constructor() {
    // Only `sessionId` is observable here; service instances are assigned after
    // (so their reactions see an already-observable sessionId) and stay plain.
    makeAutoObservable(this, { navigate: false });
    this.workspace = new WorkspaceService(this);
    this.search = new SearchService(this);
    this.project = new ProjectService(this);
    this.connections = new ConnectionsService(this);
    this.providers = new ProvidersService(this);
    this.skills = new SkillsService(this);
    this.browser = new BrowserService(this);
    this.memory = new MemoryService(this);
    this.sessions = new SessionsService(this);
    this.widget = new WidgetService(this);
    this.debug = new DebugLogService(this);
  }

  setSessionId(id: string | null) {
    this.sessionId = id;
  }

  setNavigate(fn: (sessionId: string) => void) {
    this.navigate = fn;
  }
}

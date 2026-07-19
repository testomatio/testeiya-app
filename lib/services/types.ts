// Shared client-side types for the service layer.

/** Which file (if any) is shown in the workspace editor panel. */
export interface OpenFile {
  /** Path relative to session.cwd. */
  path: string;
  /** Seed content (used when the agent just wrote this file). */
  initialContent?: string;
  /** Monotonically increasing key so the editor re-mounts on re-open. */
  key: number;
  /** Fill the content area (hide the chat) vs. a strip above it. */
  fullHeight?: boolean;
  /** Text to scroll to and highlight once the editor renders (search result). */
  scrollToText?: string;
}

export type FileStatus = "created" | "changed";

export interface TreeNode {
  name: string;
  kind: "folder" | "file" | "test";
  path: string;
  anchor?: string;
  /** `@S…` when the file/test belongs to a suite that exists on Testomat.io. */
  suiteId?: string;
  /** Emoji from the `<!-- suite` block, shown as the suite's tree icon. */
  emoji?: string;
  /** Set when the file differs from the last Testomat.io sync (un-pushed). */
  status?: FileStatus;
  /** True when the file is tracked by git and unmodified — safely restorable. */
  committed?: boolean;
  children?: TreeNode[];
}

/** The Testomat.io project a workspace represents (from `.testeiya/testeiya.json`). */
export interface WorkspaceProjectMeta {
  projectId: string;
  baseUrl: string;
  title?: string;
}

export type WorkspaceType = "manual" | "automated" | "mixed" | "code" | "files";

/** One selectable tree view: a type mapped to its dir (`""` = root, else `.testeiya/<sub>`). */
export interface WorkspaceTypeEntry {
  type: WorkspaceType;
  dir: string;
}

/** GET /api/files/tree response: the tree plus workspace classification. */
export interface WorkspaceTree {
  cwd: string;
  /** The workspace's checked-out git branch; null when not a git repo / detached. */
  branch?: string | null;
  nodes: TreeNode[];
  /** Manual-test files changed since the last Testomat.io sync. */
  changedCount?: number;
  /** `""` (root), `".testeiya/manual-tests"`, or `null` when nothing is loaded. */
  manualTestsDir: string | null;
  isProject: boolean;
  project: WorkspaceProjectMeta | null;
  /** Root workspace classification. */
  type?: WorkspaceType;
  /** Selectable tree views; a toggle is shown when more than one. */
  types?: WorkspaceTypeEntry[];
  /** The view the server actually applied (may differ from a stale request). */
  activeType?: WorkspaceType;
}

export type SearchScope = "manual" | "all";

export interface SearchContextLine {
  lineNumber: number;
  line: string;
}

export interface SearchMatch {
  lineNumber: number;
  line: string;
  before: SearchContextLine[];
  after: SearchContextLine[];
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

/** GET /api/workspace/search response. */
export interface SearchResponse {
  query: string;
  scope: SearchScope;
  /** Search root relative to cwd: `""` (root) or `".testeiya/manual-tests"`. */
  scopePath: string;
  totalMatches: number;
  totalFiles: number;
  truncated: boolean;
  files: SearchFileResult[];
}

export type SyncAction = "pull" | "push";

export interface SyncResult {
  ok: boolean;
  action: SyncAction;
  dir?: string;
  /** True when the server had nothing to push (no creds, no changes, or local-only). */
  skipped?: boolean;
  output?: string;
}

export interface TestomatioProject {
  id: string;
  title: string;
  framework?: string;
  testsCount?: number;
}

/** The project the active session is open on, with live counts + base URL for links. */
export interface CurrentProject {
  id: string;
  title: string;
  baseUrl: string;
  testsCount: number | null;
  runsCount: number | null;
  plansCount: number | null;
  requirementsCount: number | null;
}

/** One CI profile configured on the project (raw API shape). */
export interface CiProfile {
  profile_name: string;
  service: string | null;
  config: Record<string, unknown> | null;
  pass_testomatio_key: boolean;
  pass_testomatio_url: boolean;
  pass_run_id: boolean;
}

/** Project configuration from `GET /api/v2/{project_id}/info` (raw API shape). */
export interface ProjectInfo {
  title: string;
  project_id: string;
  framework: string | null;
  language: string | null;
  status: string | null;
  repository_url: string | null;
  artifacts_storage_enabled: boolean;
  environments: string[];
  labels: { title: string; slug: string }[];
  tags: string[];
  subscription: string | null;
  features: string[];
  ci_profiles: CiProfile[];
}

export interface TestomatioAuthState {
  connected: boolean;
  baseUrl: string;
  signInUrl: string;
  /** True when a previously stored token was rejected by the server. */
  rejected?: boolean;
  selectedProjectId?: string;
  projects?: TestomatioProject[];
}

export interface CreatedSession {
  sessionId: string;
  cwd: string;
  backendUrl: string;
  project: { id: string; title: string };
}

export type McpTransport = "http" | "sse" | "stdio";

export interface McpServer {
  name: string;
  enabled: boolean;
  type: McpTransport;
  command?: string;
  url?: string;
  envKeys?: string[];
  headerKeys?: string[];
  auth?: "oauth" | "apikey";
  /** True once an OAuth token is stored for this server (never the token itself). */
  authenticated?: boolean;
  source: "project" | "user";
  removable: boolean;
}

export type McpConnectionStatus = "connected" | "disconnected" | "unknown";

export interface OauthState {
  status: "idle" | "pending" | "done" | "error";
  authUrl?: string | null;
  instructions?: string | null;
  progress?: string | null;
  error?: string | null;
}

export interface CatalogSecret {
  env: string;
  label: string;
  placeholder?: string;
}

export interface CatalogService {
  id: string;
  label: string;
  transport: McpTransport;
  auth: "oauth" | "apikey" | "none";
  secrets?: CatalogSecret[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  canLogin: boolean;
  canKey: boolean;
  defaultModel: string | null;
  configured: boolean;
  loggedIn: boolean;
  group: "subscription" | "api";
}

export interface ProviderModel {
  id: string;
  name: string;
}

export interface Current {
  provider: string;
  model: string;
}

/** Agent reasoning effort — mirrors the SDK's ThinkingLevel (server is source). */
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type LoginStatus = "pending" | "done" | "error";

export interface LoginState {
  provider: string;
  status: LoginStatus;
  authUrl?: string | null;
  instructions?: string | null;
  progress?: string | null;
  error?: string | null;
}

/** An agent skill, as listed by `GET /api/skills`. */
export interface SkillInfo {
  name: string;
  description: string;
  source?: string;
  category?: string;
}

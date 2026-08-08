/**
 * A project's configuration as Testomat.io reports it (`GET /api/v2/{id}/info`).
 * Rendered into the system prompt by `projectSettings` so the agent assigns only
 * labels that exist, reuses the project's tags and environments, and matches its
 * framework when writing automated tests.
 */
export interface TestomatioProjectInfo {
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
  ci_profiles: TestomatioCiProfile[];
}

export interface TestomatioCiProfile {
  profile_name: string;
  service: string | null;
  config: Record<string, unknown> | null;
  pass_testomatio_key: boolean;
  pass_testomatio_url: boolean;
  pass_run_id: boolean;
}

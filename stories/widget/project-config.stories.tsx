import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConfigurationDetails } from "@/components/widgets/ProjectConfigView";
import type { ProjectLabel } from "@/lib/data-browse/schemas/project-info";
import type { ProjectInfo } from "@/lib/services/types";

const labels: ProjectLabel[] = [
  { id: "severity", title: "Severity", color: "#ffe9ad" },
  { id: "component", title: "Component", color: "#e2eecd" },
  { id: "to-review", title: "To Review", color: "#e5b6e7" },
  { id: "flaky", title: "🍿 Flaky", color: "#ecc6d0" },
  { id: "deprecated", title: "Deprecated", color: "#d9d7d4" },
  { id: "plain", title: "No color" },
];

const info: ProjectInfo = {
  title: "Web Shop",
  project_id: "web-shop",
  framework: "playwright",
  language: "javascript",
  status: "active",
  repository_url: "https://github.com/acme/web-shop-tests",
  artifacts_storage_enabled: true,
  environments: ["dev", "staging", "production", "Chrome", "Firefox", "MacOS"],
  labels: labels.map((l) => ({ title: l.title, slug: l.id })),
  tags: ["smoke", "regression", "checkout", "auth", "billing", "mobile", "api"],
  subscription: "Enterprise",
  features: [
    "analytics",
    "living_documentation",
    "requirements",
    "ai",
    "public_reports",
    "branches",
    "milestones",
  ],
  ci_profiles: [],
};

const meta = {
  title: "Widget/ProjectConfig",
  component: ConfigurationDetails,
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl rounded-md border">
        <Story />
      </div>
    ),
  ],
  args: { info },
} satisfies Meta<typeof ConfigurationDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

// Labels, Tags, Environments and the enabled features all render as browse data
// tables now, which need a DataTableProvider — only the facts grid is storied.
export const Configuration: Story = {};

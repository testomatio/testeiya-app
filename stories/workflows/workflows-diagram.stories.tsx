import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WorkflowsDiagram } from "@/components/workflows/WorkflowsDiagram";
import type { ResolvedWorkflowCategory } from "@/lib/workflows/types";

const CATEGORIES: ResolvedWorkflowCategory[] = [
  {
    id: "analysis-planning",
    title: "Analysis & Planning",
    icon: "assignment",
    prompts: [
      row("🔍", "Review requirements"),
      row("⚠️", "Risk-based focus"),
      row("🔀", "Analyze PR requirements"),
      row("🔬", "Analyze PR diff"),
    ],
  },
  {
    id: "test-design-management",
    title: "Test Design & Management",
    icon: "checklist",
    prompts: [
      row("✍️", "Write test cases"),
      row("✨", "Improve test cases"),
      row("🔁", "Find duplicates"),
      { emoji: "🔄", title: "Sync to Testomat.io", text: "", disabled: true, disabledTooltip: "Connect a Testomat.io project to sync" },
    ],
  },
  {
    id: "test-execution-automation",
    title: "Test Execution & Automation",
    icon: "automation",
    prompts: [
      row("🤖", "Automate test cases"),
      row("🔧", "Fix flaky tests"),
      row("🔎", "Scan project"),
    ],
  },
  {
    id: "reporting-ci-quality-gates",
    title: "Reporting, CI/CD & Quality Gates",
    icon: "rocket_launch",
    prompts: [
      row("📈", "Set up reporting"),
      row("🛠️", "Fix CI tests"),
      row("🗺️", "Map coverage"),
    ],
  },
  {
    id: "metrics-release-analytics",
    title: "Metrics, Release & Analytics",
    icon: "insights",
    prompts: [row("📊", "Analyze runs"), row("🚑", "Triage failures")],
  },
];

const meta = {
  title: "Workflows/Diagram",
  component: WorkflowsDiagram,
  parameters: { layout: "fullscreen" },
  args: { categories: CATEGORIES },
} satisfies Meta<typeof WorkflowsDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="mx-auto max-w-5xl rounded-xl bg-popover ring-1 ring-foreground/10">
      <WorkflowsDiagram {...args} />
    </div>
  ),
};

function row(emoji: string, title: string) {
  return { emoji, title, text: "", disabled: false, disabledTooltip: null };
}

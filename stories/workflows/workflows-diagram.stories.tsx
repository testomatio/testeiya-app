import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WorkflowsDiagram } from "@/components/workflows/WorkflowsDiagram";
import type { ResolvedWorkflowCategory } from "@/lib/workflows/categories";

const CATEGORIES: ResolvedWorkflowCategory[] = [
  {
    id: "requirements",
    title: "Requirements",
    icon: "assignment",
    prompts: [
      row("🔍", "Review requirements"),
      row("⚠️", "Risk-based focus"),
      row("🔀", "Analyze PR requirements"),
    ],
  },
  {
    id: "test-cases",
    title: "Test Cases",
    icon: "checklist",
    prompts: [
      row("✍️", "Write test cases"),
      row("✨", "Improve test cases"),
      row("🔁", "Find duplicates"),
      { emoji: "🔄", title: "Sync to Testomat.io", text: "", disabled: true, disabledTooltip: "Connect a Testomat.io project to sync" },
    ],
  },
  {
    id: "automation",
    title: "Automation",
    icon: "automation",
    prompts: [
      row("🤖", "Automate test cases"),
      row("🗺️", "Map coverage"),
      row("🔧", "Fix flaky tests"),
      row("🔎", "Scan project"),
    ],
  },
  {
    id: "run-ci",
    title: "Run / CI",
    icon: "rocket_launch",
    prompts: [row("📈", "Set up reporting"), row("🛠️", "Fix CI tests")],
  },
  {
    id: "releases-analysis",
    title: "Releases / Analysis",
    icon: "insights",
    prompts: [
      row("📊", "Analyze runs"),
      row("🚑", "Triage failures"),
      row("🔬", "Analyze PR diff"),
    ],
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

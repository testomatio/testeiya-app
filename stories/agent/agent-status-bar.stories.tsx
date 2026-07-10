import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AgentStatusBar } from "@/components/ai-elements/agent-status-bar";

const meta = {
  title: "Agent/AgentStatusBar",
  component: AgentStatusBar,
  args: {
    status: "submitted",
  },
} satisfies Meta<typeof AgentStatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connecting: Story = {
  args: { status: "connecting" },
};

export const Thinking: Story = {
  args: { status: "submitted" },
};

export const Streaming: Story = {
  args: { status: "streaming" },
};

export const RunningTool: Story = {
  args: {
    status: "streaming",
    activeTool: "mcp_testomatio_codeceptjs_tests_list",
  },
};

export const WithStop: Story = {
  args: {
    status: "streaming",
    activeTool: "run_playwright_tests",
    onStop: () => {},
  },
};

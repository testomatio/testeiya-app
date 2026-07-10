import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TodoWriteRenderer } from "@/components/agent-output/TodoWriteRenderer";
import type { ToolCall } from "@/hooks/use-testeiya";

const runningTool: ToolCall = {
  toolCallId: "todo-1",
  toolName: "todo_write",
  input: {},
  state: "output-available",
  output: [
    "Updated todos",
    "  Checkout regression:",
    "    ✓ t1 Pull manual tests from Testomat.io",
    "    → t2 Generate Playwright specs for the checkout suite",
    "    ○ t3 Run smoke pack against staging",
    "    ○ t4 Push results back to Testomat.io",
  ].join("\n"),
};

const completedTool: ToolCall = {
  toolCallId: "todo-2",
  toolName: "todo_write",
  input: {},
  state: "output-available",
  output: [
    "Updated todos",
    "  Preparation:",
    "    ✓ t1 Pull manual tests from Testomat.io",
    "    ✓ t2 Generate Playwright specs for the checkout suite",
    "  Execution:",
    "    ✓ t3 Run smoke pack against staging",
    "    ✗ t4 Re-run flaky gift-card spec",
    "    ✓ t5 Push results back to Testomat.io",
  ].join("\n"),
};

const meta = {
  title: "Agent/TodoWrite",
  component: TodoWriteRenderer,
  args: {
    tool: runningTool,
    running: true,
    current: true,
  },
} satisfies Meta<typeof TodoWriteRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};

export const Completed: Story = {
  args: {
    tool: completedTool,
    running: false,
    current: true,
  },
};

export const Superseded: Story = {
  args: {
    tool: completedTool,
    running: false,
    current: false,
  },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChartRenderer } from "@/components/ai-elements/chart-block";

const barSpec = {
  type: "bar",
  title: "Failures by suite — nightly regression",
  data: [
    { name: "Checkout", value: 7 },
    { name: "Persist Todos", value: 4 },
    { name: "Accessibility", value: 2 },
    { name: "Auth", value: 1 },
    { name: "Search", value: 0 },
  ],
};

const lineSpec = {
  type: "line",
  title: "Pass rate over the last 7 nightly runs",
  data: [
    { name: "Jul 3", passed: 92, flaky: 3 },
    { name: "Jul 4", passed: 94, flaky: 2 },
    { name: "Jul 5", passed: 89, flaky: 6 },
    { name: "Jul 6", passed: 91, flaky: 4 },
    { name: "Jul 7", passed: 95, flaky: 2 },
    { name: "Jul 8", passed: 97, flaky: 1 },
    { name: "Jul 9", passed: 96, flaky: 2 },
  ],
  series: [
    { key: "passed", label: "Passed %" },
    { key: "flaky", label: "Flaky %" },
  ],
};

const pieSpec = {
  type: "pie",
  title: "Run b2c1cf14 — result distribution",
  data: [
    { name: "Passed", value: 38 },
    { name: "Failed", value: 2 },
    { name: "Skipped", value: 2 },
  ],
};

const meta = {
  title: "Agent/ChartBlock",
  component: ChartRenderer,
  args: {
    code: JSON.stringify(barSpec, null, 2),
    language: "chart",
    isIncomplete: false,
  },
} satisfies Meta<typeof ChartRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {};

export const Line: Story = {
  args: { code: JSON.stringify(lineSpec, null, 2) },
};

export const Pie: Story = {
  args: { code: JSON.stringify(pieSpec, null, 2) },
};

export const Loading: Story = {
  args: { isIncomplete: true },
};

export const InvalidSpec: Story = {
  args: { code: "{ not valid json" },
};

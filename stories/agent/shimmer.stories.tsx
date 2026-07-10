import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Shimmer } from "@/components/ai-elements/shimmer";

const meta = {
  title: "Agent/Shimmer",
  component: Shimmer,
  args: {
    children: "Running checkout smoke tests…",
  },
} satisfies Meta<typeof Shimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Slow: Story = {
  args: {
    children: "Analyzing 345 test cases for duplicate coverage…",
    duration: 4,
  },
};

export const AsSpan: Story = {
  args: {
    children: "Thinking…",
    as: "span",
  },
};

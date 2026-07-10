import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TreeOutputRenderer from "@/components/widgets/TreeOutputRenderer";

const sampleTree = [
  {
    name: "Checkout",
    kind: "suite",
    id: "s-checkout",
    children: [
      { name: "Pay with credit card", kind: "test", id: "t-card" },
      { name: "Pay with gift card", kind: "test", id: "t-gift" },
      {
        name: "Refunds",
        kind: "suite",
        id: "s-refunds",
        children: [
          { name: "Full refund within 30 days", kind: "test", id: "t-refund" },
        ],
      },
    ],
  },
  {
    name: "Login",
    kind: "suite",
    id: "s-login",
    children: [
      { name: "Valid credentials", kind: "test", id: "t-valid" },
      { name: "Locked account", kind: "test", id: "t-locked" },
    ],
  },
  { name: "README.md", kind: "file", id: "f-readme" },
];

const meta = {
  title: "Widget/TreeOutputRenderer",
  component: TreeOutputRenderer,
  args: { json: sampleTree },
} satisfies Meta<typeof TreeOutputRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { json: [] },
};

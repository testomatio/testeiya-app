import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TestItemRenderer from "@/components/widgets/items/TestItemRenderer";
import { testItemFixture } from "@/stories/fixtures";

const meta = {
  title: "Widget/Items/Test",
  component: TestItemRenderer,
  args: { data: testItemFixture },
} satisfies Meta<typeof TestItemRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Minimal: Story = {
  args: {
    data: {
      id: "77fef65b",
      title: "Booster Activation Effect on Gameplay",
      state: "manual",
      priority: "medium",
    },
  },
};

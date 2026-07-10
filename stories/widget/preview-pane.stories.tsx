import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PreviewPane } from "@/components/widgets/preview-pane";
import TestItemRenderer from "@/components/widgets/items/TestItemRenderer";
import { testItemFixture } from "@/stories/fixtures";

const meta = {
  title: "Widget/PreviewPane",
  component: PreviewPane,
  args: {
    title: "Verify new code line coverage meets the 90% minimum threshold",
    onBack: () => {},
    children: (
      <p className="text-sm text-muted-foreground">
        Item detail content goes here. Press Escape or click Back to close.
      </p>
    ),
  },
} satisfies Meta<typeof PreviewPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithTestItem: Story = {
  render: (args) => (
    <PreviewPane {...args}>
      <TestItemRenderer data={testItemFixture} />
    </PreviewPane>
  ),
};

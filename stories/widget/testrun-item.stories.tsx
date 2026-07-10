import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TestRunItemRenderer from "@/components/widgets/items/TestRunItemRenderer";
import { testrunItemFixture } from "@/stories/fixtures";

const meta = {
  title: "Widget/Items/TestRun",
  component: TestRunItemRenderer,
  args: { data: testrunItemFixture },
} satisfies Meta<typeof TestRunItemRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Passed: Story = {
  args: {
    data: {
      id: 213,
      test_title: "Text input field should be cleared after each item",
      status: "passed",
      automated: true,
      environment: "chrome-headless",
      run_time: 1.24,
    },
  },
};

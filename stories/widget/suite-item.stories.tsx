import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SuiteItemRenderer from "@/components/widgets/items/SuiteItemRenderer";
import { suiteItemFixture } from "@/stories/fixtures";

const meta = {
  title: "Widget/Items/Suite",
  component: SuiteItemRenderer,
  args: { data: { ...suiteItemFixture, tests: [] } },
} satisfies Meta<typeof SuiteItemRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const RootFolder: Story = {
  args: {
    data: {
      id: "7c608c67",
      title: "tests-usage-examples",
      file_type: "folder",
      parent_id: null,
      tests_total_count: 54,
    },
  },
};

export const WithEmoji: Story = {
  args: {
    data: {
      id: "fe22b5f5",
      title: "Tic-Tac Toe Game",
      emoji: "🎯",
      file_type: "file",
      tests_total_count: 7,
      description: "Edge cases for the in-browser Tic-Tac-Toe game.",
    },
  },
};

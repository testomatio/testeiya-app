import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ItemOutputRenderer from "@/components/widgets/ItemOutputRenderer";
import { suiteItemFixture, testItemFixture, testrunItemFixture } from "@/stories/fixtures";

const meta = {
  title: "Widget/ItemOutputRenderer",
  component: ItemOutputRenderer,
  args: {
    json: { kind: "test", data: testItemFixture },
  },
} satisfies Meta<typeof ItemOutputRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Test: Story = {
  args: {
    json: {
      kind: "test",
      data: testItemFixture,
      summary: "render_item kind='test' — description + body",
    },
  },
};

export const TestRun: Story = {
  args: {
    json: {
      kind: "testrun",
      data: testrunItemFixture,
      summary: "render_item kind='testrun' — steps + assertions + artifacts",
    },
  },
};

export const Suite: Story = {
  args: {
    json: {
      kind: "suite",
      data: { ...suiteItemFixture, tests: [] },
      summary: "render_item kind='suite' — description + metadata",
    },
  },
};

export const NoData: Story = {
  args: { json: "not json at all" },
};

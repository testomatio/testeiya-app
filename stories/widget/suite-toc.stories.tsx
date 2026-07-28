import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SuiteToc } from "@/components/workspace/SuiteToc";

const SUITE = `<!-- suite
id: @S7cbef769
emoji: 👩‍🔧
-->
# Manual tests for TodoMVC @smoke

TodoMVC implements the same app in every popular framework. These cases cover
the shared behaviour: adding, editing and completing a task.

<!-- test
id: @Tbfc42b16
type: manual
priority: critical
tags: for, is, suite
-->
# create new task @action @task

### Steps
* Open application
* Add regular task name

<!-- test
id: @Te9910ee1
type: manual
priority: high
-->
# edit created task @action

### Steps
* Open application
* Rename a task

<!-- test
id: @T7ec0f3fc
type: automated
priority: low
-->
# remove completed tasks

### Steps
* Complete a task
* Clear completed
`;

const meta = {
  title: "Widget/Suite Contents",
  component: SuiteToc,
  args: {
    content: SUITE,
    fallbackTitle: "TodoMVC.test.md",
    onOpenTest: () => {},
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SuiteToc>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoMetadata: Story = {
  args: {
    content: `# Checkout\n\n<!-- test -->\n# guest checkout\n\n<!-- test -->\n# checkout with a saved card\n`,
  },
};

export const Empty: Story = {
  args: { content: "# Notes\n\nNothing here yet.\n" },
};

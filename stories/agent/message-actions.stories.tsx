import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MessageActions } from "@/components/ai-elements/message-actions";

const meta = {
  title: "Agent/MessageActions",
  component: MessageActions,
  args: {
    content:
      "## Smoke run summary\n\n- 11 passed, 1 failed\n- Failure: `checkout.spec.ts:48` — order confirmation banner missing\n- Trace uploaded to Testomat.io run `b2c1cf14`",
  },
} satisfies Meta<typeof MessageActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

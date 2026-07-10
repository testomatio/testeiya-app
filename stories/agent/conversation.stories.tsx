import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageCircleIcon } from "@/lib/icons";

const meta = {
  title: "Agent/Conversation",
  component: Conversation,
  args: {
    children: null,
  },
} satisfies Meta<typeof Conversation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex h-96 flex-col rounded-md border">
      <Conversation className="flex-1">
        <ConversationContent className="gap-3 p-4">
          <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Run the smoke suite for the checkout flow on staging
          </div>
          <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">
            Starting the Playwright smoke pack — 12 tests across 3 spec files,
            chromium only.
          </div>
          <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">
            Done: 11 passed, 1 failed. The failure is in
            checkout.spec.ts:48 — the order confirmation banner never appeared
            after paying with a saved card.
          </div>
          <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Create a failing run in Testomat.io and attach the trace
          </div>
          <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">
            Reported run “Checkout smoke — staging” with 1 failure and uploaded
            trace.zip to the failed testrun.
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="flex h-96 flex-col rounded-md border">
      <Conversation className="flex-1">
        <ConversationContent className="h-full">
          <ConversationEmptyState
            icon={<MessageCircleIcon className="size-8" />}
            title="No messages yet"
            description="Ask the QA agent to run tests, review coverage, or draft test cases"
          />
        </ConversationContent>
      </Conversation>
    </div>
  ),
};

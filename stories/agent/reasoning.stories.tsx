import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

const reasoningMarkdown = `The user wants a smoke run for the checkout flow. I should:

1. **Pull the manual tests** for the \`Checkout\` suite from Testomat.io.
2. Map each manual case to an existing Playwright spec — \`checkout.spec.ts\` covers 4 of 6 cases.
3. Run only the mapped specs with \`--grep @smoke\` to keep the run under 2 minutes.

The two unmapped cases (gift card payment, expired card rejection) need new specs, so I will flag them instead of guessing selectors.`;

const meta = {
  title: "Agent/Reasoning",
  component: Reasoning,
} satisfies Meta<typeof Reasoning>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Streaming: Story = {
  render: () => (
    <Reasoning isStreaming defaultOpen>
      <ReasoningTrigger />
      <ReasoningContent>{reasoningMarkdown}</ReasoningContent>
    </Reasoning>
  ),
};

export const Complete: Story = {
  render: () => (
    <Reasoning duration={14} defaultOpen>
      <ReasoningTrigger />
      <ReasoningContent>{reasoningMarkdown}</ReasoningContent>
    </Reasoning>
  ),
};

export const CompleteCollapsed: Story = {
  render: () => (
    <Reasoning duration={7} defaultOpen={false}>
      <ReasoningTrigger />
      <ReasoningContent>{reasoningMarkdown}</ReasoningContent>
    </Reasoning>
  ),
};

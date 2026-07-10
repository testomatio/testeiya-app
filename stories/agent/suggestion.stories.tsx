import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const meta = {
  title: "Agent/Suggestion",
  component: Suggestion,
  args: {
    suggestion: "Run the checkout smoke suite",
  },
} satisfies Meta<typeof Suggestion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Suggestions>
      <Suggestion suggestion="Run the checkout smoke suite" />
      <Suggestion suggestion="Show failed tests from the nightly run" />
      <Suggestion suggestion="Draft test cases for the new coupon flow" />
      <Suggestion suggestion="Push manual tests to Testomat.io" />
    </Suggestions>
  ),
};

export const Single: Story = {};

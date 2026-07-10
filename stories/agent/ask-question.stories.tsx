import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AskQuestionRenderer from "@/components/agent-output/AskQuestionRenderer";

const meta = {
  title: "Agent/AskQuestion",
  component: AskQuestionRenderer,
  args: {
    question:
      "The checkout suite has 2 failing tests on staging. How should I proceed?",
    options: [
      "Re-run only the 2 failed tests to rule out flakiness",
      "Quarantine them and continue with the rest of the regression",
      "Stop the run and report the failures to Testomat.io now",
    ],
    onPick: () => {},
  },
} satisfies Meta<typeof AskQuestionRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Answered: Story = {
  args: {
    answered: true,
    selected: "Re-run only the 2 failed tests to rule out flakiness",
  },
};

export const MultiSelect: Story = {
  args: {
    question:
      "Which suites should be included in the release smoke run?",
    options: [
      "Checkout — 12 tests, covers payments and totals",
      "Auth — 6 tests, login/logout/password reset",
      "Persist Todos — 5 tests, storage regressions",
      "Accessibility — 3 tests, keyboard-only flows",
    ],
    multiSelect: true,
    recommended: [0, 1],
  },
};

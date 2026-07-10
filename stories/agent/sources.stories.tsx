import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";

const meta = {
  title: "Agent/Sources",
  component: Sources,
} satisfies Meta<typeof Sources>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sources>
      <SourcesTrigger count={3} />
      <SourcesContent>
        <Source
          href="https://playwright.dev/docs/test-assertions"
          title="Assertions | Playwright"
        />
        <Source
          href="https://docs.testomat.io/getting-started/import-tests/"
          title="Import automated tests — Testomat.io docs"
        />
        <Source
          href="https://testomat.io/blog/flaky-tests"
          title="How to deal with flaky tests"
        />
      </SourcesContent>
    </Sources>
  ),
};

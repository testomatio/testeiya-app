import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { SearchIcon, TerminalIcon, UploadIcon } from "@/lib/icons";

const meta = {
  title: "Agent/ChainOfThought",
  component: ChainOfThought,
} satisfies Meta<typeof ChainOfThought>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ChainOfThought defaultOpen>
      <ChainOfThoughtHeader>Planning the regression run</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep
          icon={SearchIcon}
          label="Scanning test suites for checkout coverage"
          description="Matched 3 spec files tagged @smoke"
          status="complete"
        >
          <ChainOfThoughtSearchResults>
            <ChainOfThoughtSearchResult>
              checkout.spec.ts
            </ChainOfThoughtSearchResult>
            <ChainOfThoughtSearchResult>
              payment-methods.spec.ts
            </ChainOfThoughtSearchResult>
            <ChainOfThoughtSearchResult>
              cart-totals.spec.ts
            </ChainOfThoughtSearchResult>
          </ChainOfThoughtSearchResults>
        </ChainOfThoughtStep>
        <ChainOfThoughtStep
          icon={TerminalIcon}
          label="Running Playwright smoke pack on chromium"
          description="npx playwright test --grep @smoke --project=chromium"
          status="active"
        />
        <ChainOfThoughtStep
          icon={UploadIcon}
          label="Push results to Testomat.io run report"
          status="pending"
        />
      </ChainOfThoughtContent>
    </ChainOfThought>
  ),
};

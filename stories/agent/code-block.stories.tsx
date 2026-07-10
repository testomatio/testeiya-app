import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { FileTextIcon } from "@/lib/icons";

const tsSample = `import { test, expect } from "@playwright/test";

test("checkout completes with a saved card", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page.getByTestId("order-confirmation")).toBeVisible();
});`;

const jsonSample = `{
  "status": "failed",
  "tests": 42,
  "passed": 38,
  "failed": 2,
  "skipped": 2,
  "failures": [
    { "test": "Todos persist after page reload", "error": "AssertionError" },
    { "test": "Todos persist after clearing cookies", "error": "TimeoutError" }
  ]
}`;

const bashSample = `npx playwright test tests/checkout.spec.ts --project=chromium --retries=1
npx check-tests push -d .testeiya/manual-tests
git diff --stat tests/`;

const meta = {
  title: "Agent/CodeBlock",
  component: CodeBlock,
  args: {
    code: tsSample,
    language: "typescript",
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypeScript: Story = {};

export const Json: Story = {
  args: { code: jsonSample, language: "json" },
};

export const Bash: Story = {
  args: { code: bashSample, language: "bash" },
};

export const WithLineNumbers: Story = {
  args: { showLineNumbers: true },
};

export const WithHeader: Story = {
  render: () => (
    <CodeBlock code={tsSample} language="typescript" showLineNumbers>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileTextIcon className="size-3.5" />
          <CodeBlockFilename>tests/checkout.spec.ts</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  ),
};

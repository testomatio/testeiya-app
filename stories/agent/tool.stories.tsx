import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

const meta = {
  title: "Agent/Tool",
  component: Tool,
} satisfies Meta<typeof Tool>;

export default meta;
type Story = StoryObj<typeof meta>;

const playwrightInput = {
  command: "npx playwright test tests/checkout.spec.ts",
  project: "chromium",
  workers: 2,
  retries: 1,
};

const runOutput = {
  status: "passed",
  total: 12,
  passed: 12,
  failed: 0,
  skipped: 0,
  duration: "42.8s",
  report: "playwright-report/index.html",
};

export const InputStreaming: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader
        type="tool-run_playwright_tests"
        state="input-streaming"
        description="Preparing test command"
      />
      <ToolContent>
        <ToolInput input={{ command: "npx playwright test tests/chec" }} />
      </ToolContent>
    </Tool>
  ),
};

export const InputAvailable: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader
        type="tool-run_playwright_tests"
        state="input-available"
        description="npx playwright test tests/checkout.spec.ts"
      />
      <ToolContent>
        <ToolInput input={playwrightInput} />
      </ToolContent>
    </Tool>
  ),
};

export const OutputAvailable: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader
        type="tool-run_playwright_tests"
        state="output-available"
        description="12 tests passed in 42.8s"
      />
      <ToolContent>
        <ToolInput input={playwrightInput} />
        <ToolOutput
          output={JSON.stringify(runOutput, null, 2)}
          errorText={undefined}
        />
      </ToolContent>
    </Tool>
  ),
};

export const OutputError: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader
        type="tool-run_playwright_tests"
        state="output-error"
        description="Command failed with exit code 1"
      />
      <ToolContent>
        <ToolInput input={playwrightInput} />
        <ToolOutput
          output={undefined}
          errorText="Error: expect(locator).toBeVisible() failed — locator('#order-confirmation') was not found after 30000ms at tests/checkout.spec.ts:48"
        />
      </ToolContent>
    </Tool>
  ),
};

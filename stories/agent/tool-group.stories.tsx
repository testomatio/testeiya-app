import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ToolGroup } from "@/components/ai-elements/tool-group";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

const meta = {
  title: "Agent/ToolGroup",
  component: ToolGroup,
  args: {
    count: 3,
    summary: "bash · read · grep",
    children: null,
  },
} satisfies Meta<typeof ToolGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ToolGroup count={3} summary="bash · read · grep">
      <Tool>
        <ToolHeader
          type="tool-bash"
          state="output-available"
          description="npx playwright test --list"
        />
        <ToolContent>
          <ToolInput input={{ command: "npx playwright test --list" }} />
          <ToolOutput
            output="Listing tests:\n  checkout.spec.ts:12 — pays with a saved card\n  checkout.spec.ts:34 — rejects an expired card\nTotal: 2 tests in 1 file"
            errorText={undefined}
          />
        </ToolContent>
      </Tool>
      <Tool>
        <ToolHeader
          type="tool-read"
          state="output-available"
          description="tests/checkout.spec.ts"
        />
        <ToolContent>
          <ToolInput input={{ path: "tests/checkout.spec.ts" }} />
        </ToolContent>
      </Tool>
      <Tool>
        <ToolHeader
          type="tool-grep"
          state="output-available"
          description="data-testid=order-confirmation"
        />
        <ToolContent>
          <ToolInput
            input={{ pattern: "data-testid=order-confirmation", glob: "src/**" }}
          />
        </ToolContent>
      </Tool>
    </ToolGroup>
  ),
};

export const Running: Story = {
  render: () => (
    <ToolGroup count={2} summary="bash · write" running>
      <Tool>
        <ToolHeader
          type="tool-bash"
          state="input-available"
          description="npx playwright test tests/smoke"
        />
        <ToolContent>
          <ToolInput input={{ command: "npx playwright test tests/smoke" }} />
        </ToolContent>
      </Tool>
      <Tool>
        <ToolHeader
          type="tool-write"
          state="input-streaming"
          description="Writing tests/smoke/login.spec.ts"
        />
      </Tool>
    </ToolGroup>
  ),
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";

const usage = {
  inputTokens: 32400,
  inputTokenDetails: {
    noCacheTokens: 20400,
    cacheReadTokens: 12000,
    cacheWriteTokens: 0,
  },
  outputTokens: 4820,
  outputTokenDetails: {
    textTokens: 2720,
    reasoningTokens: 2100,
  },
  totalTokens: 37220,
  reasoningTokens: 2100,
  cachedInputTokens: 12000,
};

const meta = {
  title: "Agent/Context",
  component: Context,
  args: {
    usedTokens: 37220,
    maxTokens: 200000,
  },
} satisfies Meta<typeof Context>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex justify-center p-24">
      <Context
        usedTokens={37220}
        maxTokens={200000}
        usage={usage}
        modelId="anthropic/claude-sonnet-4"
        defaultOpen
      >
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <div className="space-y-2">
              <ContextInputUsage />
              <ContextOutputUsage />
              <ContextReasoningUsage />
              <ContextCacheUsage />
            </div>
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
    </div>
  ),
};

export const NearLimit: Story = {
  render: () => (
    <div className="flex justify-center p-24">
      <Context
        usedTokens={186000}
        maxTokens={200000}
        usage={{
          inputTokens: 172000,
          inputTokenDetails: {
            noCacheTokens: 172000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 14000,
          outputTokenDetails: {
            textTokens: 14000,
            reasoningTokens: 0,
          },
          totalTokens: 186000,
        }}
        modelId="anthropic/claude-sonnet-4"
        defaultOpen
      >
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <div className="space-y-2">
              <ContextInputUsage />
              <ContextOutputUsage />
            </div>
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
    </div>
  ),
};

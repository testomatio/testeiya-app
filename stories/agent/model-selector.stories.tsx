import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Agent/ModelSelector",
  component: ModelSelector,
} satisfies Meta<typeof ModelSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ModelSelector defaultOpen>
      <ModelSelectorTrigger render={<Button variant="outline" />}>
        Select model
      </ModelSelectorTrigger>
      <ModelSelectorContent title="Select a model">
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="Anthropic">
            <ModelSelectorItem value="anthropic/claude-sonnet-4.5">
              <ModelSelectorLogo provider="anthropic" />
              <ModelSelectorName>Claude Sonnet 4.5</ModelSelectorName>
            </ModelSelectorItem>
            <ModelSelectorItem value="anthropic/claude-opus-4.5">
              <ModelSelectorLogo provider="anthropic" />
              <ModelSelectorName>Claude Opus 4.5</ModelSelectorName>
            </ModelSelectorItem>
          </ModelSelectorGroup>
          <ModelSelectorSeparator />
          <ModelSelectorGroup heading="OpenRouter">
            <ModelSelectorItem value="openrouter/auto">
              <ModelSelectorLogo provider="openrouter" />
              <ModelSelectorName>Auto Router</ModelSelectorName>
            </ModelSelectorItem>
            <ModelSelectorItem value="openai/gpt-5.2">
              <ModelSelectorLogo provider="openai" />
              <ModelSelectorName>GPT-5.2</ModelSelectorName>
            </ModelSelectorItem>
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  ),
};

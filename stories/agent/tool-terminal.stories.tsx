import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ToolTerminal } from "@/components/ai-elements/tool";

const EXPLORBOT_OUTPUT = [
  "\u001b[36m⛵ Explorbot v0.2.0\u001b[0m Autonomous Testing Agent",
  "Configuration loaded from: explorbot.config.mjs",
  "chromium starting in \u001b[33mheadless\u001b[0m mode",
  "Session restored from output/session.json",
  "Browser started, ready to explore",
  "",
  '   I.amOnPage("/projects/demo/defects")',
  "Planning style: normal",
  "Researching http://127.0.0.1:3000/projects/demo/defects...",
  "   > \u001b[35mFixing 35 broken locators via AI conversation...\u001b[0m",
  "Starting deep analysis of expandable elements",
  "   > Selected 10 expandables to click (max: 10)",
  '   I.moveCursorTo(".filterbar-filter-btn-div > button")',
  '   I.click(".filterbar-filter-btn-div > button")',
  '   I.pressKey("Escape")',
  "   \u001b[32m✔ Test passed\u001b[0m in 4.2s",
  "   \u001b[31m✖ Test failed:\u001b[0m locator not found",
].join("\n");

const SHORT_OUTPUT = [
  "$ npm run typecheck",
  "\u001b[32m✔\u001b[0m No type errors found",
].join("\n");

const meta = {
  title: "Agent/ToolTerminal",
  component: ToolTerminal,
  args: {
    output: EXPLORBOT_OUTPUT,
    command:
      "bunx explorbot explore '/projects/demo/defects' --max-tests 5 --session",
    info: {
      cwd: "/home/user/project/.testeiya/explorbot",
      timeout: 900,
      head: 500,
    },
  },
} satisfies Meta<typeof ToolTerminal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = {};

export const Streaming: Story = {
  args: {
    isStreaming: true,
  },
};

export const Short: Story = {
  args: {
    output: SHORT_OUTPUT,
    command: "npm run typecheck",
    info: {},
  },
};

export const CommandOnly: Story = {
  args: {
    output: "",
    isStreaming: true,
  },
};

export const OutputOnly: Story = {
  args: {
    command: undefined,
    info: undefined,
  },
};

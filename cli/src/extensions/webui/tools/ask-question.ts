import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import type { AskChannel } from "../ask-channel.js";

/**
 * `ask_question` — a web-UI-only question tool.
 *
 * The UI renders the question as text and each option as a clickable pill
 * button (the `tool-input-available` event drives the render). `execute`
 * then BLOCKS on the connection's `AskChannel` until the user clicks an
 * option — the agent loop stays parked the whole time, exactly like Pi's
 * built-in `ask` tool (which blocks on `ui.select`). The clicked option is
 * returned as the tool result, so the same turn continues with the answer.
 *
 * This blocking is what stops the model from streaming filler text
 * ("Awaiting selection…") after the call: it is never re-invoked until the
 * answer exists.
 */
export function createAskQuestionTool(channel: AskChannel): ToolDefinition {
  return {
    name: "ask_question",
    label: "Ask the user",
    description:
      "Present a question to the user with a set of clickable options. " +
      "Use this WHENEVER you need the user to make a choice (yes/no, " +
      "which-of-these, pick-a-project, confirm-an-action, etc.). By default " +
      "the options render as single-choice pill buttons; clicking one returns " +
      "that option's text as this tool's result. Set multiSelect:true to " +
      "render checkboxes instead so the user can pick several items at once " +
      "(the result is the chosen labels, one per line) — use this to let the " +
      "user choose WHICH of many items to act on, e.g. 'pick which of these " +
      "test cases to generate'. The UI always also offers a free-form field, " +
      "so the result may be the user's own typed answer instead of any " +
      "option, and a picked option may be followed by a 'Note: <comment>' " +
      "line the user attached — treat whatever text comes back as the " +
      "user's answer. The call blocks until the user answers — do not write " +
      "any 'waiting' text.",
    parameters: Type.Object({
      question: Type.String({
        description:
          "The question or prompt to show the user (e.g. 'Which project should I pull tests from?').",
      }),
      options: Type.Array(Type.String(), {
        description:
          "1–50 option labels the user can pick from. There is no length " +
          "limit per option — options can be multi-line. In single-select " +
          "mode (default) clicking an option returns that exact string " +
          "(including any markdown/description you put in it) as this tool's " +
          "result. For any question where the natural answer is 'yes/proceed' " +
          "(open-ended follow-ups like 'Want me to generate these?'), still " +
          "pass at least one option such as 'Yes, proceed' so the user can " +
          "one-click confirm.",
        minItems: 1,
        maxItems: 50,
      }),
      multiSelect: Type.Optional(
        Type.Boolean({
          description:
            "When true, the options render as checkboxes with a Submit " +
            "button and the user can pick several at once. The result is the " +
            "selected option labels joined by newlines (one per line); a " +
            "label may be followed by a 'Note: <comment>' line, and the " +
            "user may append their own free-typed item.",
        })
      ),
      recommended: Type.Optional(
        Type.Array(Type.Integer(), {
          description:
            "Only used when multiSelect is true: 0-based indices of options " +
            "that start checked (the recommended subset). The user can " +
            "uncheck or check more before submitting.",
        })
      ),
    }),
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      const p = params as {
        question: string;
        options: string[];
        multiSelect?: boolean;
      };
      console.log(
        `[ask_question]${p.multiSelect ? " (multi)" : ""} "${p.question}" → [${p.options.join(" | ")}]`
      );
      const answer = await channel.wait(toolCallId, signal);
      return { content: [{ type: "text", text: answer }] };
    },
  };
}

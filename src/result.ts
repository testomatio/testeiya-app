import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ExtractField } from "./extract-fields.js";

export { parseExtractFields, type ExtractField } from "./extract-fields.js";

export function createSetResultTool(runtime: RunResult): ToolDefinition {
  return {
    name: "set_result",
    label: "Set run result",
    description:
      "Set the outcome of this non-interactive run, which becomes the process " +
      "exit code. Call once with status 'fail' when the verdict is negative — " +
      "regressions found, a quality gate unmet, tests broken, or the task could " +
      "not be completed. Do not call it on success: the run passes by default. " +
      "This does not end the run; finish your work and write your report as usual.",
    parameters: Type.Object({
      status: Type.Union([Type.Literal("pass"), Type.Literal("fail")], {
        description: "'fail' exits the process with code 1; 'pass' with code 0.",
      }),
      reason: Type.String({
        description:
          "One line explaining the verdict, shown to whoever runs the command " +
          "(e.g. '3 of 12 checkout tests have no assertions').",
      }),
    }),
    async execute(_toolCallId, params) {
      const p = params as { status: "pass" | "fail"; reason: string };
      runtime.status = p.status;
      runtime.reason = p.reason;
      return {
        content: [
          {
            type: "text",
            text: `Recorded: ${p.status}. The command will exit ${exitFor(p.status)}.`,
          },
        ],
        details: p,
      };
    },
  } as ToolDefinition;
}

/**
 * The values `extract` asks for, one parameter each. A tool rather than a
 * line of text: the model can be told "one line" and still add a sentence.
 */
export function createExtractTool(runtime: RunResult, fields: ExtractField[]): ToolDefinition {
  const properties: Record<string, ReturnType<typeof Type.String>> = {};
  for (const field of fields) properties[field.name] = Type.String({ description: field.description });
  return {
    name: EXTRACT_TOOL,
    label: "Submit extracted values",
    description:
      "Submit the values this run was asked to find. Call it once, when you have every value. " +
      "Each value is a single line: the value itself, no prose, no markdown. " +
      "If a value cannot be found, do not guess: call set_result with 'fail' and say why.",
    parameters: Type.Object(properties),
    async execute(_toolCallId, params) {
      const values: Record<string, string> = {};
      for (const field of fields) values[field.name] = oneLine(String((params as Record<string, unknown>)[field.name] ?? ""));
      runtime.values = values;
      return { content: [{ type: "text", text: "Recorded. Stop here: no report is needed." }], details: values };
    },
  } as ToolDefinition;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function exitFor(status: "pass" | "fail"): number {
  if (status === "fail") return 1;
  return 0;
}

export const EXTRACT_TOOL = "submit_values";

export interface RunResult {
  status?: "pass" | "fail";
  reason?: string;
  /** What `extract` found, by field name. */
  values?: Record<string, string>;
}

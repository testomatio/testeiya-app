import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

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

function exitFor(status: "pass" | "fail"): number {
  if (status === "fail") return 1;
  return 0;
}

export interface RunResult {
  status?: "pass" | "fail";
  reason?: string;
}

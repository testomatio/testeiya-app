"use client";

import { useMemo, type ReactNode } from "react";
import PlanItemRenderer from "./items/PlanItemRenderer";
import RunItemRenderer from "./items/RunItemRenderer";
import SuiteItemRenderer from "./items/SuiteItemRenderer";
import TestItemRenderer from "./items/TestItemRenderer";
import TestRunItemRenderer from "./items/TestRunItemRenderer";

type ItemKind = "test" | "suite" | "run" | "testrun" | "plan";

interface Props {
  json: unknown;
  summary?: string;
}

function parseEntity(raw: unknown): {
  kind?: ItemKind;
  data: Record<string, unknown>;
  summary?: string;
} | null {
  let current: unknown = raw;
  for (let i = 0; i < 3; i++) {
    if (current && typeof current === "object") {
      const obj = current as {
        kind?: ItemKind;
        data?: unknown;
        summary?: string;
        content?: Array<{ type?: string; text?: string }>;
      };
      if (obj.kind && obj.data !== undefined) {
        const data =
          typeof obj.data === "string"
            ? (() => {
                try {
                  return JSON.parse(obj.data as string);
                } catch {
                  return {};
                }
              })()
            : obj.data;
        return {
          kind: obj.kind,
          data:
            data && typeof data === "object"
              ? (data as Record<string, unknown>)
              : {},
          summary: obj.summary,
        };
      }
      const text = obj.content?.find((c) => c?.type === "text")?.text;
      if (typeof text === "string") {
        try {
          current = JSON.parse(text);
          continue;
        } catch {
          return null;
        }
      }
    }
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return null;
      }
    }
    return null;
  }
  return null;
}

export default function ItemOutputRenderer({ json, summary }: Props) {
  const parsed = useMemo(() => parseEntity(json), [json]);

  if (!parsed) {
    return (
      <div className="text-sm text-muted-foreground">(no item data)</div>
    );
  }

  const data = parsed.data;
  let body: ReactNode;
  switch (parsed.kind) {
    case "run":
      body = <RunItemRenderer data={data} />;
      break;
    case "testrun":
      body = <TestRunItemRenderer data={data} />;
      break;
    case "test":
      body = <TestItemRenderer data={data} />;
      break;
    case "suite":
      body = <SuiteItemRenderer data={data} />;
      break;
    case "plan":
      body = <PlanItemRenderer data={data} />;
      break;
    default:
      body = (
        <pre className="overflow-x-auto text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }

  const effectiveSummary = summary ?? parsed.summary;
  return (
    <div>
      {effectiveSummary && (
        <p className="mb-2 text-sm text-muted-foreground">{effectiveSummary}</p>
      )}
      {body}
    </div>
  );
}

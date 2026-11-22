import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

import { resolveDecisionModel, UsageError } from "./model.js";
import { createRuntime } from "./session.js";

/** One answer per question, so the id never shows. */
const QUESTION = "answer";
export const DEFAULT_THRESHOLD = 0.5;

/**
 * A yes or no from a decision model (Jev, Clef, …). It has no tools and reads
 * nothing on its own: it judges the question against the state it is handed.
 */
export class Decider {
  private constructor(
    private readonly runtime: ModelRuntime,
    private readonly explicit?: string
  ) {}

  /** Throws a UsageError when no decision model resolves, before anything is asked. */
  static async create(model?: string): Promise<Decider> {
    const decider = new Decider(await createRuntime(), model);
    decider.model();
    return decider;
  }

  /** `provider/id` of the model it asks. */
  get name(): string {
    const model = this.model();
    return `${model.provider}/${model.id}`;
  }

  async decide(request: DecisionRequest): Promise<Decision> {
    const threshold = request.threshold ?? DEFAULT_THRESHOLD;
    const model = this.model();
    const result = await this.runtime.classify(
      model,
      {
        state: request.state,
        questions: {
          [QUESTION]: { type: "bool", instructions: request.question, criteria: { true: "Yes", false: "No" } },
        },
      },
      { signal: request.signal }
    );
    // classify never rejects: an error comes back as a result, and must not read as a "no".
    if (result.stopReason !== "stop") throw new DecisionError(result.errorMessage || `the decision model stopped: ${result.stopReason}`);
    const answer = result.answers[QUESTION];
    if (answer?.type !== "bool") throw new DecisionError("the decision model gave no yes or no");
    return {
      answer: answer.probability >= threshold ? "yes" : "no",
      probability: answer.probability,
      threshold,
      question: request.question,
      model: `${model.provider}/${model.id}`,
      tokens: { input: result.usage?.input ?? 0, output: result.usage?.output ?? 0 },
    };
  }

  /**
   * The state a question is judged against: each file under its own name,
   * relative to `base`, a folder as the files in it. Text read from stdin goes
   * under `input`.
   */
  static state(files: string[], input?: string, base?: string): Record<string, string> {
    const state: Record<string, string> = {};
    const name = (path: string) => (base ? relative(base, path) : path);
    for (const file of files) {
      if (!existsSync(file)) throw new UsageError(`no such file: ${file}`);
      if (!statSync(file).isDirectory()) {
        state[name(file)] = readFileSync(file, "utf8");
        continue;
      }
      for (const entry of globSync("**/*", { cwd: file }).sort()) {
        const path = join(file, entry);
        if (statSync(path).isFile()) state[name(path)] = readFileSync(path, "utf8");
      }
    }
    if (input?.trim()) state.input = input;
    return state;
  }

  /** "0.7" into a probability, or a UsageError. */
  static threshold(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const threshold = Number(value);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
      throw new UsageError(`--threshold is a probability between 0 and 1, got "${value}"`);
    }
    return threshold;
  }

  private model() {
    return resolveDecisionModel(this.runtime, this.explicit);
  }
}

/** The call failed: not a "no". */
export class DecisionError extends Error {}

export interface DecisionRequest {
  question: string;
  state: Record<string, string>;
  /** The probability of yes that counts as yes. 0.5 by default. */
  threshold?: number;
  signal?: AbortSignal;
}

export interface Decision {
  answer: "yes" | "no";
  /** The model's probability that the answer is yes. */
  probability: number;
  threshold: number;
  question: string;
  model: string;
  tokens: { input: number; output: number };
}

export type DecideFn = (request: DecisionRequest) => Promise<Decision>;

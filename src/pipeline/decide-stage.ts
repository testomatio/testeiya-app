import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Decider, DecisionError, type Decision } from "../decision.js";
import { UsageError } from "../model.js";
import type { Launched } from "./launcher.js";
import { ContextReader } from "./decide-context.js";
import { DecideContexts } from "./decide-contexts.js";
import { log } from "./log.js";
import type { DecideContext } from "./spec.js";
import { Stage, type Item, type StageContext } from "./stage.js";
import type { StageResult } from "./state.js";
import type { Variables } from "./variables.js";

/**
 * A yes or no from a decision model, judged against the stage's inputs. Yes
 * passes, no fails. It writes the decision to `<id>.json` and one line to
 * `<id>.md`. A call that failed is broken, never a "no".
 */
export class DecideStage extends Stage {
  protected readonly result = { field: "report" as const, extension: "md" };

  files(): string[] {
    return [`${this.id}.md`, `${this.id}.json`];
  }

  protected async runItem(context: StageContext, item: Item, vars: Variables): Promise<StageResult> {
    const dir = this.dir(context);
    const report = `${this.folder}/${this.id}${item.suffix}.md`;
    const file = `${this.folder}/${this.id}${item.suffix}.json`;
    rmSync(join(context.dir, report), { force: true });
    rmSync(join(context.dir, file), { force: true });

    const asked = context.decision(this, vars);
    const question = asked.question.trim();
    log.command(`decide: ${question.split("\n")[0]}`);
    const controller = new AbortController();
    context.launcher.track(controller);
    let timer: NodeJS.Timeout | undefined;
    if (this.timeout) timer = setTimeout(() => controller.abort("timeout"), this.timeout);
    const done = (): Launched => ({ code: 1, timedOut: controller.signal.reason === "timeout", interrupted: context.launcher.interrupted });
    try {
      const decision = await context.decide(
        { question, state: await this.state(context, dir, item, asked.context, vars), threshold: this.spec.decide?.threshold, signal: controller.signal },
        vars.get("TESTEIYA_DECISION_MODEL")
      );
      writeFileSync(join(context.dir, file), `${JSON.stringify(decision, null, 2)}\n`);
      writeFileSync(join(context.dir, report), `${DecideStage.line(decision)}\n`);
      context.report?.copy(join(context.dir, report));
      if (decision.answer === "yes") return { ...this.outcome({ ...done(), code: 0 }, "pass"), report };
      return { ...this.outcome(done(), "fail", `no (p=${decision.probability.toFixed(2)})`), report };
    } catch (err) {
      let message = String(err);
      if (err instanceof Error) message = err.message;
      if (err instanceof UsageError) return this.outcome(done(), "broken", `bad usage: ${message}`);
      if (err instanceof DecisionError) return this.outcome(done(), "broken", `no answer: ${message}`);
      return this.outcome(done(), "broken", message);
    } finally {
      clearTimeout(timer);
      context.launcher.untrack();
    }
  }

  /** Its context, else the inputs it was given, by name; and the loop's item. */
  private async state(context: StageContext, dir: string, item: Item, wanted: DecideContext, vars: Variables): Promise<Record<string, string>> {
    let state: Record<string, string>;
    if (!DecideContexts.isEmpty(wanted)) {
      state = await new ContextReader(context.sources(this, vars)).read(wanted);
    } else {
      const files = this.inputs().filter((input) => existsSync(join(dir, input)));
      state = Decider.state(files.map((input) => join(dir, input)), undefined, dir);
    }
    if (item.item !== undefined && !(item.item in state)) {
      const path = join(dir, item.item);
      if (existsSync(path)) Object.assign(state, Decider.state([path], undefined, dir));
      else state.item = item.item;
    }
    return state;
  }

  private static line(decision: Decision): string {
    const answer = decision.answer === "yes" ? "**Yes**" : "**No**";
    return `${answer}: ${decision.question} (p=${decision.probability.toFixed(2)}, ${decision.model})`;
  }
}

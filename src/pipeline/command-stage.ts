import { join } from "node:path";

import { log } from "./log.js";
import { Stage, type Item, type StageContext } from "./stage.js";
import type { StageResult } from "./state.js";
import type { Variables } from "./variables.js";

/** A shell command. Exit 0 passes, anything else fails. Its output goes to `<id>.log`. */
export class CommandStage extends Stage {
  protected readonly result = { field: "log" as const, extension: "log" };

  files(): string[] {
    return [`${this.id}.log`];
  }

  protected async runItem(context: StageContext, item: Item, vars: Variables): Promise<StageResult> {
    const command = this.spec.run!;
    const logFile = `${this.id}${item.suffix}.log`;
    log.command(command.trim().split("\n")[0]!);
    const done = await context.launcher.start({
      command,
      args: null,
      vars,
      log: join(context.dir, logFile),
      timeout: this.timeout,
    });
    let status: StageResult["status"] = "fail";
    if (done.code === 0) status = "pass";
    return { ...this.outcome(done, status, `exit ${done.code}`), log: logFile };
  }
}

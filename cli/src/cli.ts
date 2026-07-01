#!/usr/bin/env bun
process.title = "testeiya";

// Fix: OSC 133 shell integration sequences cause TUI width overflow crash.
// The SDK's UserMessageComponent appends OSC 133 sequences that visibleWidth()
// counts as visible chars, exceeding terminal width. Patch the prototype to skip them.
import { UserMessageComponent } from "@oh-my-pi/pi-coding-agent/modes/components/user-message";
import { Container } from "@oh-my-pi/pi-tui";
UserMessageComponent.prototype.render = function (width: number): string[] {
  return Container.prototype.render.call(this, width);
};

import { main } from "./main.js";
main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});

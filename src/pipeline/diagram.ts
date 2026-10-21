import type { PipelineSpec } from "./spec.js";
import type { Stage } from "./stage.js";
import { TaskStage } from "./task-stage.js";

/**
 * A pipeline as a Mermaid flowchart: stages in order, the files they hand
 * each other, and the gates each one needs, coloured by the check.
 */
export class Diagram {
  private readonly lines = ["flowchart TD"];
  private readonly gateIds = new Map<string, string>();

  constructor(
    private readonly spec: PipelineSpec,
    private readonly stages: Stage[],
    private readonly results: Map<string, boolean>
  ) {}

  toMarkdown(): string {
    return `# ${this.spec.name}\n\n\`\`\`mermaid\n${this.toMermaid()}\n\`\`\`\n`;
  }

  toMermaid(): string {
    this.node("start", `([${this.label(this.spec.name)}])`);
    for (const [index, stage] of this.stages.entries()) this.node(`s${index}`, this.stageShape(stage));
    if (this.stages.length > 1) this.node("summary", `(["summary"])`);

    this.flow();
    this.files();
    this.gates();

    this.lines.push("  classDef pass fill:#dcfce7,stroke:#16a34a,color:#14532d");
    this.lines.push("  classDef fail fill:#fee2e2,stroke:#dc2626,color:#7f1d1d");
    return this.lines.join("\n");
  }

  private flow(): void {
    const order = ["start", ...this.stages.map((_, index) => `s${index}`)];
    if (this.stages.length > 1) order.push("summary");
    for (let index = 1; index < order.length; index++) this.lines.push(`  ${order[index - 1]} --> ${order[index]}`);
  }

  /** An input from an earlier stage is a dotted edge; one nobody writes is a file node. */
  private files(): void {
    for (const [index, stage] of this.stages.entries()) {
      for (const input of stage.inputs()) {
        const producer = this.stages.slice(0, index).findIndex((earlier) => earlier.produces(input));
        let from = `s${producer}`;
        if (producer < 0) {
          from = `f_${index}_${stage.inputs().indexOf(input)}`;
          this.node(from, `[(${this.label(input)})]`);
        }
        this.lines.push(`  ${from} -.->|${this.label(input)}| s${index}`);
      }
    }
  }

  private gates(): void {
    for (const name of this.spec.when) this.lines.push(`  ${this.gate(name)} --o start`);
    for (const [index, stage] of this.stages.entries()) {
      for (const name of stage.spec.when) this.lines.push(`  ${this.gate(name)} --o s${index}`);
    }
    if (this.results.has("ai")) this.lines.push(`  ${this.gate("ai")} --o start`);
  }

  private gate(name: string): string {
    const known = this.gateIds.get(name);
    if (known) return known;
    const id = `g${this.gateIds.size}`;
    this.gateIds.set(name, id);
    this.node(id, `{{${this.label(name)}}}`);
    if (this.results.get(name)) this.lines.push(`  class ${id} pass`);
    if (this.results.get(name) === false) this.lines.push(`  class ${id} fail`);
    return id;
  }

  private stageShape(stage: Stage): string {
    const { spec } = stage;
    let kind = "command";
    if (stage instanceof TaskStage) kind = "agent";
    const parts = [spec.id, kind];
    if (spec.each_line) parts.push(`each line of ${spec.each_line}`);
    if (spec.each_file) parts.push(`each file ${spec.each_file}`);
    if (spec.session) parts.push(`session ${spec.session}`);
    if (spec.stopOn.length) parts.push(`stops on ${spec.stopOn.join(", ")}`);
    const text = this.label(parts.join("<br/>"));
    if (kind === "agent") return `(${text})`;
    return `[${text}]`;
  }

  private node(id: string, shape: string): void {
    this.lines.push(`  ${id}${shape}`);
  }

  private label(text: string): string {
    return `"${text.replaceAll('"', "#quot;")}"`;
  }
}

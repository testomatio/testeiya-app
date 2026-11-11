/**
 * `testeiya/pipeline`: parse, validate and describe a pipeline from its text.
 * Nothing here touches the file system or imports from Node, so a Worker and a
 * browser check a file exactly as the CLI does.
 */
export { PipelineSource, type ExtendsResolver, type PipelineSourceOptions } from "./pipeline-source.js";
export { PipelineError } from "./pipeline-error.js";
export { Overlay } from "./overlay.js";
export { BUNDLED_PIPELINES } from "./bundled.js";
export { BUILTIN_VARIABLES, type BuiltinVariable } from "./variables.js";
export { PIPELINE_TARGETS } from "./spec.js";
export type {
  ChangesSpec,
  GateSpec,
  InputUse,
  PipelineDescription,
  PipelineInput,
  PipelineSpec,
  PrerequisiteView,
  StageSpec,
  StageView,
  StopOn,
} from "./spec.js";

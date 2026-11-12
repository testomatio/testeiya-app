/**
 * `testeiya/pipeline`: open, check and describe pipelines from their text.
 * Nothing here touches the file system or imports from Node, so a Worker and a
 * browser check a pipeline exactly as the CLI does.
 *
 *   const pipelines = new Pipelines();
 *   const pipeline = pipelines.open("regression");   // or pipelines.parse(yaml)
 *   pipeline.errors(); pipeline.inputs(); pipeline.stages(); pipeline.yaml();
 */
export { Pipelines, type ParseOptions, type PipelineSummary } from "./pipelines.js";
export { Pipeline } from "./pipeline-document.js";
export { PipelineError } from "./pipeline-error.js";
export { BUILTIN_VARIABLES, type BuiltinVariable } from "./variables.js";
export { PIPELINE_TARGETS } from "./spec.js";
export { ENVIRONMENT_VARIABLES, type EnvironmentVariable, type EnvironmentVariableName } from "../environment.js";
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

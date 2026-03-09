/**
 * Studio Toolkit — barrel export.
 *
 * Public API for the Studio visual job builder.
 * All consumers should import from `@/toolkits/studio`.
 */

// Context & Provider
export { StudioProvider, useStudioContext } from "./StudioContext";
export type { StudioAPI, StudioState } from "./StudioContext";

// View
export { StudioView } from "./components/StudioView";
export type { StudioStep, OutputMapping, InputBinding, SelectedElement, AnchorSide } from "./types/studio";
export { PARALLEL_GROUP_CMD, isParallelGroup } from "./types/studio";

// Components (re-exported for consumers that need them directly)
export { JobCatalog } from "./components/JobCatalog";
export { JobInputPromptModal } from "./components/JobInputPromptModal";
export { StudioBotPanel } from "./components/StudioBotPanel";

// Bot service (side-effect: registers chat delegation)
export {
    getStudioBotStatus, getStudioBotConfig,
    shouldDelegateToStudioBot,
} from "./studioBot";

// Module
export { studioModule } from "./module";

// Commands (re-exported for tests and direct consumers)
export {
    studioGetStateCommand, studioSetJobMetaCommand,
    studioAddStepCommand, studioRemoveStepCommand,
    studioSetStepArgsCommand, studioAddParallelGroupCommand,
    studioSetStepConditionCommand, studioSetInputBindingsCommand,
    studioSetOutputMappingsCommand,
    studioAddDeliverableCommand, studioRemoveDeliverableCommand,
    studioAddStorageCommand, studioRemoveStorageCommand,
    studioAddInputCommand, studioRemoveInputCommand, studioUpdateInputCommand,
    studioSaveJobCommand, studioRunJobCommand, studioLoadJobCommand,
    studioClearCanvasCommand, studioCreateJobCommand,
    studioAddTriggerCommand, studioRemoveTriggerCommand,
    studioAutoLayoutCommand,
} from "./commands";

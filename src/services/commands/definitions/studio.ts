/**
 * Studio Commands — AI-accessible operations for the visual Job Studio.
 *
 * Barrel re-export from focused sub-modules:
 *   studio-steps.ts      — Step CRUD, conditions, bindings, output mappings
 *   studio-resources.ts  — Deliverables, storage defaults, entity inputs
 *   studio-lifecycle.ts  — State queries, metadata, save/run/load/clear,
 *                          compound job creation, triggers
 */

export {
    studioAddStepCommand,
    studioRemoveStepCommand,
    studioSetStepArgsCommand,
    studioAddParallelGroupCommand,
    studioSetStepConditionCommand,
    studioSetInputBindingsCommand,
    studioSetOutputMappingsCommand,
} from "./studio-steps";

export {
    studioAddDeliverableCommand,
    studioRemoveDeliverableCommand,
    studioAddStorageCommand,
    studioRemoveStorageCommand,
    studioAddInputCommand,
    studioRemoveInputCommand,
    studioUpdateInputCommand,
} from "./studio-resources";

export {
    studioGetStateCommand,
    studioSetJobMetaCommand,
    studioSaveJobCommand,
    studioRunJobCommand,
    studioLoadJobCommand,
    studioClearCanvasCommand,
    studioCreateJobCommand,
    studioAddTriggerCommand,
    studioRemoveTriggerCommand,
    studioAutoLayoutCommand,
} from "./studio-lifecycle";


/**
 * Orchestrator Toolkit — barrel export.
 */

export { orchestratorService } from "./service";
export type { OrchestratorManager, OrchestratorNode } from "./service";
export type {
    OrchestratorStatus,
    OrchestratorTarget,
    OrchestratorNodeSpec,
    OrchestratorManifest,
    OrchestratorOperationResult,
    OrchestratorSnapshot,
    OrchestratorManagerSnapshot,
} from "./types/orchestrator";

export { OrchestratorProvider, useOrchestrator } from "./OrchestratorContext";
export { OrchestratorView } from "./components/OrchestratorView";
export { OrchestratorChatBanner } from "./components/OrchestratorChatBanner";

export {
    orchestratorCommands,
    orchestratorAddNodeCommand,
    orchestratorRemoveNodeCommand,
    orchestratorSetActiveNodeCommand,
    orchestratorRenameNodeCommand,
    orchestratorSetManifestCommand,
    orchestratorApplyManifestCommand,
    orchestratorReconcileCommand,
    orchestratorExportManifestCommand,
    orchestratorSaveManifestToArtifactCommand,
    orchestratorLoadManifestCommand,
    orchestratorStatusCommand,
    orchestratorClearResultsCommand,
} from "./commands";

export { useOrchestratorMetrics } from "./utils/useOrchestratorMetrics";

export {
    handleOrchestratorBotRequest,
    shouldDelegateToOrchestratorBot,
    getOrchestratorBotStatus,
    getOrchestratorBotConfig,
    updateOrchestratorBotConfig,
    getOrchestratorBotLog,
} from "./orchestratorBot";

export type {
    OrchestratorBotStatus,
    OrchestratorBotConfig,
    OrchestratorBotRequest,
    OrchestratorBotResponse,
    OrchestratorBotOperation,
} from "./types/orchestratorBot";

export { orchestratorModule } from "./module";

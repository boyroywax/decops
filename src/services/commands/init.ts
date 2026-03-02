import { registry } from "./registry";
import { createAgentCommand, pingAgentCommand } from "./definitions/agent";
import { sendMessageCommand } from "./definitions/messaging";
import { createChannelCommand } from "./definitions/channel";
import { createGroupCommand } from "./definitions/group";
import { groupDecideCommand } from "./definitions/governance";
import { broadcastMessageCommand } from "./definitions/broadcast";
import {
    deleteAgentCommand,
    deleteChannelCommand,
    deleteGroupCommand,
    editChannelCommand,
    updateAgentPromptCommand,
    toggleGroupMemberCommand
} from "./definitions/modification";
import {
    resetWorkspaceCommand,
    bulkDeleteCommand
} from "./definitions/maintenance";
import {
    promptArchitectCommand,
    deployNetworkCommand
} from "./definitions/architect";
import {
    exportFullBackupCommand,
    exportWorkspaceCommand,
    exportEcosystemCommand,
    exportDataCommand
} from "./definitions/data";
import {
    setApiKeyCommand,
    selectAiModelCommand
} from "./definitions/system";
import {
    createArtifactCommand,
    editArtifactCommand,
    tagArtifactCommand,
    deleteArtifactCommand,
    listArtifactsCommand,
    searchArtifactsCommand
} from "./definitions/artifact";
import {
    createNetworkCommand,
    updateNetworkCommand,
    destroyNetworkCommand,
    listNetworksCommand,
    saveEcosystemCommand,
    loadEcosystemCommand,
    listEcosystemsCommand,
    deleteEcosystemCommand
} from "./definitions/ecosystem";
import {
    createBridgeCommand,
    deleteBridgeCommand,
    printTopologyCommand
} from "./definitions/topology";
import {
    listAgentsCommand,
    listGroupsCommand,
    listChannelsCommand,
    listMessagesCommand
} from "./definitions/query";
import {
    queueNewJobCommand,
    pauseQueueCommand,
    resumeQueueCommand,
    deleteQueuedJobCommand,
    listQueueCommand,
    listCatalogJobsCommand,
    saveJobDefinitionCommand,
    deleteJobDefinitionCommand
} from "./definitions/jobs";

import { createWorkspaceCommand, switchWorkspaceCommand, deleteWorkspaceCommand, duplicateWorkspaceCommand } from "./definitions/workspace";
import {
    generateImageCommand,
    generateAllImagesCommand,
    clearImageCacheCommand,
    generateIconCommand
} from "./definitions/imageGen";
import {
    studioGetStateCommand,
    studioSetJobMetaCommand,
    studioAddStepCommand,
    studioRemoveStepCommand,
    studioSetStepArgsCommand,
    studioAddParallelGroupCommand,
    studioSetStepConditionCommand,
    studioSetInputBindingsCommand,
    studioSetOutputMappingsCommand,
    studioAddDeliverableCommand,
    studioRemoveDeliverableCommand,
    studioAddStorageCommand,
    studioRemoveStorageCommand,
    studioAddInputCommand,
    studioRemoveInputCommand,
    studioUpdateInputCommand,
    studioSaveJobCommand,
    studioRunJobCommand,
    studioLoadJobCommand,
    studioClearCanvasCommand,
    studioCreateJobCommand,
    studioAddTriggerCommand,
    studioRemoveTriggerCommand,
} from "./definitions/studio";

export function initializeRegistry() {
    // Workspace
    registry.register(createWorkspaceCommand);
    registry.register(switchWorkspaceCommand);
    registry.register(deleteWorkspaceCommand);
    registry.register(duplicateWorkspaceCommand);
    // Register Commands
    registry.register(createAgentCommand);
    registry.register(pingAgentCommand);
    registry.register(sendMessageCommand);
    registry.register(createChannelCommand);
    registry.register(createGroupCommand);
    registry.register(groupDecideCommand);
    registry.register(broadcastMessageCommand);

    // Modification
    registry.register(deleteAgentCommand);
    registry.register(deleteChannelCommand);
    registry.register(deleteGroupCommand);
    registry.register(editChannelCommand);
    registry.register(updateAgentPromptCommand);
    registry.register(toggleGroupMemberCommand);

    // Maintenance
    registry.register(resetWorkspaceCommand);
    registry.register(bulkDeleteCommand);

    // Architect
    registry.register(promptArchitectCommand);
    registry.register(deployNetworkCommand);

    // Data Export
    registry.register(exportFullBackupCommand);
    registry.register(exportWorkspaceCommand);
    registry.register(exportEcosystemCommand);
    registry.register(exportDataCommand);

    // System
    registry.register(setApiKeyCommand);
    registry.register(selectAiModelCommand);

    // Artifacts
    registry.register(createArtifactCommand);
    registry.register(editArtifactCommand);
    registry.register(tagArtifactCommand);
    registry.register(deleteArtifactCommand);
    registry.register(listArtifactsCommand);
    registry.register(searchArtifactsCommand);

    // Ecosystem / Networks
    registry.register(createNetworkCommand);
    registry.register(updateNetworkCommand);
    registry.register(destroyNetworkCommand);
    registry.register(listNetworksCommand);
    registry.register(saveEcosystemCommand);
    registry.register(loadEcosystemCommand);
    registry.register(listEcosystemsCommand);
    registry.register(deleteEcosystemCommand);

    // Topology
    registry.register(createBridgeCommand);
    registry.register(deleteBridgeCommand);
    registry.register(printTopologyCommand);

    // Query
    registry.register(listAgentsCommand);
    registry.register(listGroupsCommand);
    registry.register(listChannelsCommand);
    registry.register(listMessagesCommand);

    // Jobs
    registry.register(queueNewJobCommand);
    registry.register(pauseQueueCommand);
    registry.register(resumeQueueCommand);
    registry.register(deleteQueuedJobCommand);
    registry.register(listQueueCommand);
    registry.register(listCatalogJobsCommand);
    registry.register(saveJobDefinitionCommand);
    registry.register(deleteJobDefinitionCommand);

    // Image Generation
    registry.register(generateImageCommand);
    registry.register(generateAllImagesCommand);
    registry.register(clearImageCacheCommand);
    registry.register(generateIconCommand);

    // Studio (Visual Job Editor)
    registry.register(studioGetStateCommand);
    registry.register(studioSetJobMetaCommand);
    registry.register(studioAddStepCommand);
    registry.register(studioRemoveStepCommand);
    registry.register(studioSetStepArgsCommand);
    registry.register(studioAddParallelGroupCommand);
    registry.register(studioSetStepConditionCommand);
    registry.register(studioSetInputBindingsCommand);
    registry.register(studioSetOutputMappingsCommand);
    registry.register(studioAddDeliverableCommand);
    registry.register(studioRemoveDeliverableCommand);
    registry.register(studioAddStorageCommand);
    registry.register(studioRemoveStorageCommand);
    registry.register(studioAddInputCommand);
    registry.register(studioRemoveInputCommand);
    registry.register(studioUpdateInputCommand);
    registry.register(studioSaveJobCommand);
    registry.register(studioRunJobCommand);
    registry.register(studioLoadJobCommand);
    registry.register(studioClearCanvasCommand);
    registry.register(studioCreateJobCommand);
    registry.register(studioAddTriggerCommand);
    registry.register(studioRemoveTriggerCommand);
}

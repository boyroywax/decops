import { registry } from "./registry";
import { createAgentCommand } from "./definitions/agent";
import { sendMessageCommand } from "./definitions/messaging";
import { createChannelCommand } from "./definitions/channel";
import { createGroupCommand } from "./definitions/group";
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
    deleteArtifactCommand
} from "./definitions/artifact";
import {
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

export function registerCommands() {
    // Register Commands
    registry.register(createAgentCommand);
    registry.register(sendMessageCommand);
    registry.register(createChannelCommand);
    registry.register(createGroupCommand);
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
    registry.register(deleteArtifactCommand);

    // Ecosystem
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
}

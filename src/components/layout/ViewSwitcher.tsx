import type { ViewId } from "../../types";
import { NetworksView } from "../views/NetworksView";
import { AgentsView } from "../views/AgentsView";
import { ChannelsView } from "../views/ChannelsView";
import { GroupsView } from "../views/GroupsView";
import { MessagesView } from "../views/MessagesView";
import { NetworkView } from "../views/NetworkView";
import { ArtifactsView } from "../views/ArtifactsView";
import { ActivityView } from "../views/ActivityView";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import type { WorkspaceContextType } from "../../context/WorkspaceContext";

interface ViewSwitcherProps {
    view: ViewId;
    setView: (view: ViewId) => void;
    workspace: WorkspaceContextType;
    architect: any;
    ecosystem: any;
    allArtifacts: any[];
    importArtifact: any;
    removeArtifact: any;
    notebookEntries: any[];
    clearNotebook: () => void;
    exportNotebook: () => void;
    addNotebookEntry: (entry: any) => void;
    addJob: (job: any) => void;
}

export function ViewSwitcher({
    view,
    setView,
    workspace,
    architect,
    ecosystem,
    allArtifacts,
    importArtifact,
    removeArtifact,
    notebookEntries,
    clearNotebook,
    exportNotebook,
    addNotebookEntry,
    addJob
}: ViewSwitcherProps) {
    if (view === "networks" || view === "ecosystem") {
        return (
            <NetworksView
                agents={workspace.agents}
                channels={workspace.channels}
                groups={workspace.groups}
                ecosystems={ecosystem.ecosystems}
                bridges={ecosystem.bridges}
                bridgeMessages={ecosystem.bridgeMessages}
                activeBridges={ecosystem.activeBridges}
                ecoSaveName={ecosystem.ecoSaveName}
                setEcoSaveName={ecosystem.setEcoSaveName}
                bridgeForm={ecosystem.bridgeForm}
                setBridgeForm={ecosystem.setBridgeForm}
                bridgeFromNet={ecosystem.bridgeFromNet}
                bridgeToNet={ecosystem.bridgeToNet}
                saveCurrentNetwork={ecosystem.saveCurrentNetwork}
                dissolveNetwork={ecosystem.dissolveNetwork}
                createBridge={ecosystem.createBridge}
                removeBridge={ecosystem.removeBridge}
                setView={setView}
                addJob={addJob}
                activeNetworkId={ecosystem.activeNetworkId}
                setActiveNetworkId={ecosystem.setActiveNetworkId}
            />
        );
    }

    if (view === "agents") {
        return (
            <AgentsView
                agents={workspace.agents}
                channels={workspace.channels}
                groups={workspace.groups}
                messages={workspace.messages}
                ecosystems={ecosystem.ecosystems}
                showCreate={workspace.showCreate}
                setShowCreate={workspace.setShowCreate}
                newAgent={workspace.newAgent}
                setNewAgent={workspace.setNewAgent}
                selectedAgent={workspace.selectedAgent}
                setSelectedAgent={workspace.setSelectedAgent}
                editingPrompt={workspace.editingPrompt}
                setEditingPrompt={workspace.setEditingPrompt}
                editPromptText={workspace.editPromptText}
                setEditPromptText={workspace.setEditPromptText}
                createAgent={workspace.createAgent}
                updateAgentPrompt={workspace.updateAgentPrompt}
                removeAgent={workspace.removeAgent}
                removeAgents={workspace.removeAgents}
            />
        );
    }

    if (view === "channels") {
        return (
            <ChannelsView
                agents={workspace.agents}
                channels={workspace.channels}
                messages={workspace.messages}
                ecosystems={ecosystem.ecosystems}
                channelForm={workspace.channelForm}
                setChannelForm={workspace.setChannelForm}
                createChannel={workspace.createChannel}
                removeChannel={workspace.removeChannel}
                removeChannels={workspace.removeChannels}
                setActiveChannel={workspace.setActiveChannel}
                setView={setView}
            />
        );
    }

    if (view === "groups") {
        return (
            <GroupsView
                agents={workspace.agents}
                groups={workspace.groups}
                ecosystems={ecosystem.ecosystems}
                showGroupCreate={workspace.showGroupCreate}
                setShowGroupCreate={workspace.setShowGroupCreate}
                groupForm={workspace.groupForm}
                setGroupForm={workspace.setGroupForm}
                selectedGroup={workspace.selectedGroup}
                setSelectedGroup={workspace.setSelectedGroup}
                createGroup={workspace.createGroup}
                removeGroup={workspace.removeGroup}
                removeGroups={workspace.removeGroups}
                toggleGroupMember={workspace.toggleGroupMember}
                setBroadcastGroup={workspace.setBroadcastGroup}
                setView={setView}
            />
        );
    }

    if (view === "messages") {
        return (
            <MessagesView
                agents={workspace.agents}
                channels={workspace.channels}
                groups={workspace.groups}
                messages={workspace.messages}
                activeChannel={workspace.activeChannel}
                setActiveChannel={workspace.setActiveChannel}
                msgInput={workspace.msgInput}
                setMsgInput={workspace.setMsgInput}
                sending={workspace.sending}
                broadcastGroup={workspace.broadcastGroup}
                setBroadcastGroup={workspace.setBroadcastGroup}
                broadcastInput={workspace.broadcastInput}
                setBroadcastInput={workspace.setBroadcastInput}
                broadcasting={workspace.broadcasting}
                msgEndRef={workspace.msgEndRef}
                channelMessages={workspace.channelMessages}
                acFrom={workspace.acFrom}
                acTo={workspace.acTo}
                sendMessage={workspace.sendMessage}
                sendBroadcast={workspace.sendBroadcast}
                removeMessages={workspace.removeMessages}
                ecosystems={ecosystem.ecosystems}
                bridges={ecosystem.bridges}
                bridgeMessages={ecosystem.bridgeMessages}
                selectedBridge={ecosystem.selectedBridge}
                setSelectedBridge={ecosystem.setSelectedBridge}
                bridgeMsgInput={ecosystem.bridgeMsgInput}
                setBridgeMsgInput={ecosystem.setBridgeMsgInput}
                bridgeSending={ecosystem.bridgeSending}
                selBridgeFrom={ecosystem.selBridgeFrom}
                selBridgeTo={ecosystem.selBridgeTo}
                selBridgeFromNet={ecosystem.selBridgeFromNet}
                selBridgeToNet={ecosystem.selBridgeToNet}
                sendBridgeMessage={ecosystem.sendBridgeMessage}
            />
        );
    }

    if (view === "network") {
        return (
            <NetworkView
                agents={workspace.agents}
                channels={workspace.channels}
                groups={workspace.groups}
                activeChannels={workspace.activeChannels}
            />
        );
    }

    if (view === "artifacts") {
        return (
            <ArtifactsView
                artifacts={allArtifacts}
                importArtifact={importArtifact}
                removeArtifact={removeArtifact}
            />
        );
    }

    if (view === "activity") {
        return (
            <ErrorBoundary>
                <ActivityView
                    entries={notebookEntries}
                    clearNotebook={clearNotebook}
                    exportNotebook={exportNotebook}
                    addEntry={addNotebookEntry}
                />
            </ErrorBoundary>
        );
    }



    return null;
}

import type { ViewId, NavContext, ToolkitId } from "@/types";
import { NetworksView } from "@/components/views/NetworksView";
import { NetworkDetailView } from "@/components/views/NetworkDetailView";
import { GroupDetailView } from "@/components/views/GroupDetailView";
import { AgentDetailView } from "@/components/views/AgentDetailView";
import { AgentsView } from "@/components/views/AgentsView";
import { ChannelsView } from "@/components/views/ChannelsView";
import { ChannelDetailView } from "@/components/views/ChannelDetailView";
import { GroupsView } from "@/components/views/GroupsView";
import { MessagesView } from "@/components/views/MessagesView";
import { ToolkitDetailView } from "@/components/views/ToolkitDetailView";
import { ToolKitsView } from "@/components/views/ToolKitsView";
import { NetworkView } from "@/components/views/NetworkView";
import { ArtifactsView } from "@/components/views/ArtifactsView";
import { ActivityView } from "@/components/views/ActivityView";
import { StudioView } from "@/toolkits/studio";
import { EditorView } from "@/toolkits/editor";
import { SystemView } from "@/components/views/SystemView";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Breadcrumb } from "./Breadcrumb";
import type { WorkspaceContextType } from "@/context/WorkspaceContext";

interface ViewSwitcherProps {
    view: ViewId;
    setView: (view: ViewId) => void;
    navContext: NavContext;
    navigateTo: (view: ViewId, ctx: NavContext) => void;
    workspace: WorkspaceContextType;
    architect: any;
    ecosystem: any;
    allArtifacts: any[];
    importArtifact: any;
    removeArtifact: any;
    updateArtifact: any;
    notebookEntries: any[];
    clearNotebook: () => void;
    exportNotebook: () => void;
    addNotebookEntry: (entry: any) => void;
    addJob: (job: any) => void;
    savedJobs: any[];
    onSaveJob: (job: any) => void;
    onDeleteJob: (id: string) => void;
}

export function ViewSwitcher({
    view,
    setView,
    navContext,
    navigateTo,
    workspace,
    architect,
    ecosystem,
    allArtifacts,
    importArtifact,
    removeArtifact,
    updateArtifact,
    notebookEntries,
    clearNotebook,
    exportNotebook,
    addNotebookEntry,
    addJob,
    savedJobs,
    onSaveJob,
    onDeleteJob
}: ViewSwitcherProps) {
    const breadcrumb = (navContext.networkId || navContext.groupId || navContext.agentId || navContext.channelId || navContext.toolkitId) ? (
        <Breadcrumb
            navContext={navContext}
            navigateTo={navigateTo}
            networks={ecosystem.networks}
            agents={workspace.agents}
            groups={workspace.groups}
            channels={workspace.channels}
            agentRoot={view === "agents"}
            toolkitRoot={view === "toolkits"}
        />
    ) : null;

    if (view === "networks") {
        // Drill-down: Agent detail
        if (navContext.agentId && navContext.networkId) {
            return (
                <>
                    {breadcrumb}
                    <AgentDetailView
                        agentId={navContext.agentId}
                        networkId={navContext.networkId}
                        groupId={navContext.groupId}
                        agents={workspace.agents}
                        channels={workspace.channels}
                        groups={workspace.groups}
                        messages={workspace.messages}
                        networks={ecosystem.networks}
                        navigateTo={navigateTo}
                        updateAgentPrompt={workspace.updateAgentPrompt}
                        updateAgent={workspace.updateAgent}
                        removeAgent={workspace.removeAgent}
                    />
                </>
            );
        }
        // Drill-down: Group detail
        if (navContext.groupId && navContext.networkId) {
            return (
                <>
                    {breadcrumb}
                    <GroupDetailView
                        groupId={navContext.groupId}
                        networkId={navContext.networkId}
                        agents={workspace.agents}
                        groups={workspace.groups}
                        networks={ecosystem.networks}
                        navigateTo={navigateTo}
                        removeGroup={workspace.removeGroup}
                        setBroadcastGroup={workspace.setBroadcastGroup}
                        setView={setView}
                    />
                </>
            );
        }
        // Drill-down: Network detail
        if (navContext.networkId) {
            return (
                <>
                    {breadcrumb}
                    <NetworkDetailView
                        networkId={navContext.networkId}
                        agents={workspace.agents}
                        channels={workspace.channels}
                        groups={workspace.groups}
                        networks={ecosystem.networks}
                        bridges={ecosystem.bridges}
                        navigateTo={navigateTo}
                        dissolveNetwork={ecosystem.dissolveNetwork}
                    />
                </>
            );
        }
        // Top level: Network manager
        return (
            <NetworksView
                agents={workspace.agents}
                channels={workspace.channels}
                groups={workspace.groups}
                networks={ecosystem.networks}
                bridges={ecosystem.bridges}
                bridgeMessages={ecosystem.bridgeMessages}
                activeBridges={ecosystem.activeBridges}
                bridgeForm={ecosystem.bridgeForm}
                setBridgeForm={ecosystem.setBridgeForm}
                bridgeFromNet={ecosystem.bridgeFromNet}
                bridgeToNet={ecosystem.bridgeToNet}
                dissolveNetwork={ecosystem.dissolveNetwork}
                createBridge={ecosystem.createBridge}
                removeBridge={ecosystem.removeBridge}
                setView={setView}
                addJob={addJob}
                navigateTo={navigateTo}
            />
        );
    }

    if (view === "agents") {
        // Drill-down: Agent detail (from agents list)
        if (navContext.agentId) {
            const agent = workspace.agents.find(a => a.id === navContext.agentId);
            if (agent) {
                return (
                    <>
                        {breadcrumb}
                        <AgentDetailView
                            agentId={navContext.agentId}
                            networkId={agent.networkId || ""}
                            agents={workspace.agents}
                            channels={workspace.channels}
                            groups={workspace.groups}
                            messages={workspace.messages}
                        networks={ecosystem.networks}
                        navigateTo={navigateTo}
                        updateAgentPrompt={workspace.updateAgentPrompt}
                        updateAgent={workspace.updateAgent}
                        removeAgent={workspace.removeAgent}
                    />
                </>
                );
            }
        }
        // Top level: Agents list
        return (
            <AgentsView
                agents={workspace.agents}
                channels={workspace.channels}
                groups={workspace.groups}
                messages={workspace.messages}
                networks={ecosystem.networks}
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
                navigateTo={navigateTo}
            />
        );
    }

    if (view === "channels") {
        // Drill-down: Channel detail
        if (navContext.channelId) {
            return (
                <>
                    {breadcrumb}
                    <ChannelDetailView
                        channelId={navContext.channelId}
                        networkId={navContext.networkId}
                        agents={workspace.agents}
                        channels={workspace.channels}
                        messages={workspace.messages}
                        networks={ecosystem.networks}
                        navigateTo={navigateTo}
                        removeChannel={workspace.removeChannel}
                        setActiveChannel={workspace.setActiveChannel}
                        setView={setView}
                    />
                </>
            );
        }
        return (
            <ChannelsView
                agents={workspace.agents}
                channels={workspace.channels}
                messages={workspace.messages}
                networks={ecosystem.networks}
                channelForm={workspace.channelForm}
                setChannelForm={workspace.setChannelForm}
                createChannel={workspace.createChannel}
                removeChannel={workspace.removeChannel}
                removeChannels={workspace.removeChannels}
                setActiveChannel={workspace.setActiveChannel}
                setView={setView}
                navigateTo={navigateTo}
            />
        );
    }

    if (view === "groups") {
        return (
            <GroupsView
                agents={workspace.agents}
                groups={workspace.groups}
                networks={ecosystem.networks}
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
                unreadCounts={workspace.unreadCounts}
                markChannelRead={workspace.markChannelRead}
                networks={ecosystem.networks}
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
                allArtifacts={allArtifacts}
                onNavigateToArtifact={(art) => navigateTo("artifacts", { artifactId: art.id })}
            />
        );
    }

    if (view === "network") {
        // Scoped to a specific network if navigated from network detail
        const netId = navContext.networkId;
        const netAgents = netId ? workspace.agents.filter(a => a.networkId === netId) : workspace.agents;
        const netChannels = netId ? workspace.channels.filter(c => c.networkId === netId) : workspace.channels;
        const netGroups = netId ? workspace.groups.filter(g => g.networkId === netId) : workspace.groups;
        return (
            <>
                {netId && breadcrumb}
                <NetworkView
                    agents={netAgents}
                    channels={netChannels}
                    groups={netGroups}
                    activeChannels={workspace.activeChannels}
                />
            </>
        );
    }

    if (view === "artifacts") {
        return (
            <ArtifactsView
                artifacts={allArtifacts}
                importArtifact={importArtifact}
                removeArtifact={removeArtifact}
                updateArtifact={updateArtifact}
                initialSelectedId={navContext.artifactId}
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

    if (view === "editor") {
        return (
            <ErrorBoundary>
                <EditorView
                    updateArtifact={updateArtifact}
                    importArtifact={importArtifact}
                />
            </ErrorBoundary>
        );
    }

    if (view === "system") {
        return (
            <ErrorBoundary>
                <SystemView />
            </ErrorBoundary>
        );
    }

    if (view === "toolkits") {
        // Drill-down: Toolkit detail
        if (navContext.toolkitId) {
            return (
                <>
                    {breadcrumb}
                    <ToolkitDetailView
                        toolkitId={navContext.toolkitId as ToolkitId}
                        navigateTo={navigateTo}
                    />
                </>
            );
        }
        return (
            <ErrorBoundary>
                <ToolKitsView
                    navigateTo={navigateTo}
                />
            </ErrorBoundary>
        );
    }

    return null;
}

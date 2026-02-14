import { useState } from "react";
import type { ViewId } from "./types";
import { useActivityLog } from "./hooks/useActivityLog";
import { useWorkspace } from "./hooks/useWorkspace";
import { useArchitect } from "./hooks/useArchitect";
import { useEcosystem } from "./hooks/useEcosystem";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { ArchitectView } from "./components/views/ArchitectView";
import { EcosystemView } from "./components/views/EcosystemView";
import { AgentsView } from "./components/views/AgentsView";
import { ChannelsView } from "./components/views/ChannelsView";
import { GroupsView } from "./components/views/GroupsView";
import { MessagesView } from "./components/views/MessagesView";
import { NetworkView } from "./components/views/NetworkView";
import { SettingsView } from "./components/views/SettingsView";

export default function App() {
  const [view, setView] = useState<ViewId>("architect");
  const { log, addLog } = useActivityLog();

  const workspace = useWorkspace(addLog);
  const architect = useArchitect({
    addLog,
    setAgents: workspace.setAgents,
    setChannels: workspace.setChannels,
    setGroups: workspace.setGroups,
    setMessages: workspace.setMessages,
    setActiveChannels: workspace.setActiveChannels,
  });
  const ecosystem = useEcosystem({
    addLog,
    agents: workspace.agents,
    channels: workspace.channels,
    groups: workspace.groups,
    messages: workspace.messages,
    setAgents: workspace.setAgents,
    setChannels: workspace.setChannels,
    setGroups: workspace.setGroups,
    setMessages: workspace.setMessages,
    setView,
  });

  return (
    <div style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace", background: "#0a0a0f", color: "#e4e4e7", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />

      <Header
        agents={workspace.agents}
        channels={workspace.channels}
        groups={workspace.groups}
        messages={workspace.messages}
        ecosystems={ecosystem.ecosystems}
        bridges={ecosystem.bridges}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          view={view}
          setView={setView}
          log={log}
          ecosystems={ecosystem.ecosystems}
          messages={workspace.messages}
        />

        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          {view === "architect" && (
            <ArchitectView
              agents={workspace.agents}
              channels={workspace.channels}
              groups={workspace.groups}
              messages={workspace.messages}
              archPrompt={architect.archPrompt}
              setArchPrompt={architect.setArchPrompt}
              archGenerating={architect.archGenerating}
              archPreview={architect.archPreview}
              archError={architect.archError}
              archPhase={architect.archPhase}
              deployProgress={architect.deployProgress}
              generateNetwork={architect.generateNetwork}
              deployNetwork={architect.deployNetwork}
              resetArchitect={architect.resetArchitect}
              setView={setView}
            />
          )}

          {view === "ecosystem" && (
            <EcosystemView
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
              selectedBridge={ecosystem.selectedBridge}
              setSelectedBridge={ecosystem.setSelectedBridge}
              bridgeMsgInput={ecosystem.bridgeMsgInput}
              setBridgeMsgInput={ecosystem.setBridgeMsgInput}
              bridgeSending={ecosystem.bridgeSending}
              msgEndRef={ecosystem.msgEndRef}
              selBridgeFrom={ecosystem.selBridgeFrom}
              selBridgeTo={ecosystem.selBridgeTo}
              selBridgeFromNet={ecosystem.selBridgeFromNet}
              selBridgeToNet={ecosystem.selBridgeToNet}
              bridgeFromNet={ecosystem.bridgeFromNet}
              bridgeToNet={ecosystem.bridgeToNet}
              saveCurrentNetwork={ecosystem.saveCurrentNetwork}
              loadNetwork={ecosystem.loadNetwork}
              dissolveNetwork={ecosystem.dissolveNetwork}
              clearWorkspace={workspace.clearWorkspace}
              createBridge={ecosystem.createBridge}
              removeBridge={ecosystem.removeBridge}
              sendBridgeMessage={ecosystem.sendBridgeMessage}
              setView={setView}
            />
          )}

          {view === "agents" && (
            <AgentsView
              agents={workspace.agents}
              channels={workspace.channels}
              groups={workspace.groups}
              messages={workspace.messages}
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
            />
          )}

          {view === "channels" && (
            <ChannelsView
              agents={workspace.agents}
              channels={workspace.channels}
              messages={workspace.messages}
              channelForm={workspace.channelForm}
              setChannelForm={workspace.setChannelForm}
              createChannel={workspace.createChannel}
              removeChannel={workspace.removeChannel}
              setActiveChannel={workspace.setActiveChannel}
              setView={setView}
            />
          )}

          {view === "groups" && (
            <GroupsView
              agents={workspace.agents}
              groups={workspace.groups}
              showGroupCreate={workspace.showGroupCreate}
              setShowGroupCreate={workspace.setShowGroupCreate}
              groupForm={workspace.groupForm}
              setGroupForm={workspace.setGroupForm}
              selectedGroup={workspace.selectedGroup}
              setSelectedGroup={workspace.setSelectedGroup}
              createGroup={workspace.createGroup}
              removeGroup={workspace.removeGroup}
              toggleGroupMember={workspace.toggleGroupMember}
              setBroadcastGroup={workspace.setBroadcastGroup}
              setView={setView}
            />
          )}

          {view === "messages" && (
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
            />
          )}

          {view === "network" && (
            <NetworkView
              agents={workspace.agents}
              channels={workspace.channels}
              groups={workspace.groups}
              activeChannels={workspace.activeChannels}
            />
          )}

          {view === "data" && (
            <SettingsView
              agents={workspace.agents}
              channels={workspace.channels}
              groups={workspace.groups}
              messages={workspace.messages}
              ecosystems={ecosystem.ecosystems}
              bridges={ecosystem.bridges}
              setAgents={workspace.setAgents}
              setChannels={workspace.setChannels}
              setGroups={workspace.setGroups}
              setMessages={workspace.setMessages}
              setEcosystems={ecosystem.setEcosystems}
              setBridges={ecosystem.setBridges}
            />
          )}
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        select option { background: #18181b; color: #e4e4e7; }
      `}</style>
    </div>
  );
}

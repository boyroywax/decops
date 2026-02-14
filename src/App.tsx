import { useState } from "react";
import type { ViewId } from "./types";
import { useActivityLog } from "./hooks/useActivityLog";
import { useWorkspace } from "./hooks/useWorkspace";
import { useArchitect } from "./hooks/useArchitect";
import { useEcosystem } from "./hooks/useEcosystem";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { Footer } from "./components/layout/Footer";
import { ArchitectView } from "./components/views/ArchitectView";
import { EcosystemView } from "./components/views/EcosystemView";
import { AgentsView } from "./components/views/AgentsView";
import { ChannelsView } from "./components/views/ChannelsView";
import { GroupsView } from "./components/views/GroupsView";
import { MessagesView } from "./components/views/MessagesView";
import { NetworkView } from "./components/views/NetworkView";
import { SettingsView } from "./components/views/SettingsView";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginView } from "./components/views/LoginView";
import { ProfileView } from "./components/views/ProfileView";

function AuthenticatedApp() {
  const [view, setView] = useState<ViewId>("architect");
  const { log, addLog } = useActivityLog();
  const { user, logout } = useAuth();

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

      <Header />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          view={view}
          setView={setView}
          ecosystems={ecosystem.ecosystems}
          messages={workspace.messages}
          user={user}
          logout={logout}
        />

        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          {view === "profile" && <ProfileView />}

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
              removeAgents={workspace.removeAgents}
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
              removeChannels={workspace.removeChannels}
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
              removeGroups={workspace.removeGroups}
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
              removeMessages={workspace.removeMessages}
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

      <Footer
        agents={workspace.agents}
        channels={workspace.channels}
        groups={workspace.groups}
        messages={workspace.messages}
        ecosystems={ecosystem.ecosystems}
        bridges={ecosystem.bridges}
        log={log}
      />

      <style>{`
        :root {
          /* ─── Core Palette ─── */
          --bg-primary: #0a0a0f;
          --bg-elevated: rgba(0,0,0,0.3);
          --bg-surface: rgba(255,255,255,0.02);
          --bg-surface-hover: rgba(255,255,255,0.04);
          --bg-input: rgba(0,0,0,0.4);

          --border-subtle: rgba(255,255,255,0.05);
          --border-default: rgba(255,255,255,0.06);
          --border-medium: rgba(255,255,255,0.08);

          --text-primary: #e4e4e7;
          --text-secondary: #d4d4d8;
          --text-muted: #a1a1aa;
          --text-subtle: #71717a;
          --text-ghost: #52525b;

          --color-accent: #00e5a0;
          --color-warning: #fbbf24;
          --color-danger: #ef4444;
          --color-info: #38bdf8;
          --color-channel: #a78bfa;
          --color-group: #f472b6;

          --font-mono: 'DM Mono', 'JetBrains Mono', monospace;
          --font-display: 'Space Grotesk', sans-serif;

          --radius-sm: 3px;
          --radius-md: 4px;
          --radius-lg: 6px;
          --radius-xl: 8px;
          --radius-2xl: 10px;
        }
        
        html, body { margin: 0; padding: 0; height: 100%; background: #0a0a0f; color: #e4e4e7; overflow: hidden; }
        #root { height: 100%; display: flex; flex-direction: column; }

        .settings-container { max-width: 800px; margin: 0 auto; }
        .settings-header { font-family: var(--font-display); font-size: 18px; font-weight: 600; margin-bottom: 24px; color: var(--text-primary); letter-spacing: -0.01em; }
        
        .settings-section { 
          background: var(--bg-surface); 
          padding: 24px; 
          border-radius: var(--radius-2xl); 
          border: 1px solid var(--border-subtle);
          margin-bottom: 24px;
        }

        .section-title {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
          display: flex; 
          align-items: center; 
          gap: 8px;
        }

        .section-desc { font-size: 12px; color: var(--text-subtle); margin-bottom: 20px; line-height: 1.5; font-family: var(--font-mono); }

        .btn {
          font-family: var(--font-mono); font-size: 11px; padding: 8px 16px;
          border-radius: var(--radius-lg); cursor: pointer; transition: all 0.15s;
          border: 1px solid transparent;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }

        .btn-primary { background: var(--color-accent); color: var(--bg-primary); font-weight: 500; }
        .btn-surface { background: #27272a; border: 1px solid #3f3f46; color: var(--text-primary); } /* Fallback for existing */
        .btn-secondary { background: rgba(255,255,255,0.04); border: 1px solid var(--border-medium); color: var(--text-primary); }
        .btn-danger { background: rgba(239,68,68,0.1); color: var(--color-danger); border-color: rgba(239,68,68,0.2); }
        .btn-danger-solid { background: var(--color-danger); color: white; border: none; font-weight: 600; }

        .btn-icon { font-size: 14px; }

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

function Main() {
  const { isInitialized, isLoading, isAuthenticated } = useAuth();
  console.log('[App] Main render:', { isInitialized, isLoading, isAuthenticated });


  if (!isInitialized || isLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#52525b" }}>
        Loading configuration...
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedApp /> : <LoginView />;
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { Compass, Rocket, CheckCircle, XCircle } from "lucide-react";
import { GradientIcon } from "./components/shared/GradientIcon";
import type { ViewId } from "./types";
import { useNotebook } from "./hooks/useNotebook";
import { WorkspaceProvider, useWorkspaceContext } from "./context/WorkspaceContext";
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

import { ArtifactsView } from "./components/views/ArtifactsView";
import { ActivityView } from "./components/views/ActivityView";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginView } from "./components/views/LoginView";
import { ProfileView } from "./components/views/ProfileView";
import { useJobs } from "./hooks/useJobs";

import { registry } from "./services/commands/registry";
import { createAgentCommand } from "./services/commands/definitions/agent";
import { sendMessageCommand } from "./services/commands/definitions/messaging";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { createChannelCommand } from "./services/commands/definitions/channel";
import { createGroupCommand } from "./services/commands/definitions/group";
import type { CommandContext } from "./services/commands/types";

// Import all new command definitions
import { setApiKeyCommand, selectAiModelCommand } from "./services/commands/definitions/system";
import { createArtifactCommand, editArtifactCommand, deleteArtifactCommand } from "./services/commands/definitions/artifact";
import { saveEcosystemCommand, loadEcosystemCommand, listEcosystemsCommand, deleteEcosystemCommand } from "./services/commands/definitions/ecosystem";
import { createBridgeCommand, deleteBridgeCommand, printTopologyCommand } from "./services/commands/definitions/topology";
import { listAgentsCommand, listGroupsCommand, listChannelsCommand, listMessagesCommand } from "./services/commands/definitions/query";
import { deleteAgentCommand, deleteChannelCommand, deleteGroupCommand, editChannelCommand, updateAgentPromptCommand, toggleGroupMemberCommand } from "./services/commands/definitions/modification";
import { promptArchitectCommand, deployNetworkCommand } from "./services/commands/definitions/architect";
import { exportFullBackupCommand, exportWorkspaceCommand, exportEcosystemCommand, exportDataCommand } from "./services/commands/definitions/data";
import { resetWorkspaceCommand, bulkDeleteCommand } from "./services/commands/definitions/maintenance";
import { broadcastMessageCommand } from "./services/commands/definitions/broadcast";
import {
  queueNewJobCommand, pauseQueueCommand, resumeQueueCommand, deleteQueuedJobCommand, listQueueCommand,
  listCatalogJobsCommand, saveJobDefinitionCommand, deleteJobDefinitionCommand
} from "./services/commands/definitions/jobs";
import { useJobCatalog } from "./hooks/useJobCatalog";

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

// Modification
registry.register(deleteAgentCommand);
registry.register(deleteChannelCommand);
registry.register(deleteGroupCommand);
registry.register(editChannelCommand);

// Jobs
registry.register(queueNewJobCommand);
registry.register(pauseQueueCommand);
registry.register(resumeQueueCommand);
registry.register(deleteQueuedJobCommand);
registry.register(listQueueCommand);
registry.register(listCatalogJobsCommand);
registry.register(saveJobDefinitionCommand);
registry.register(deleteJobDefinitionCommand);

function AuthenticatedApp() {
  const [view, setViewRaw] = useState<ViewId>("architect");
  const { entries: notebookEntries, addEntry: addNotebookEntry, addLog, clearNotebook, exportNotebook } = useNotebook();

  // Wrap setView to track navigation in Notebook
  const setView = useCallback((v: ViewId) => {
    setViewRaw(v);
    addNotebookEntry({
      category: "navigation",
      icon: <GradientIcon icon={Compass} size={16} gradient={["#38bdf8", "#818cf8"]} />,
      title: `Navigated to ${v.charAt(0).toUpperCase() + v.slice(1)}`,
      description: `Opened the ${v} view.`,
      tags: ["navigation", v],
    });
  }, [addNotebookEntry]);
  const { user, logout } = useAuth();
  const {
    jobs, addJob, updateJobStatus, addArtifact, removeJob, clearJobs,
    allArtifacts, importArtifact, removeArtifact,
    isPaused, toggleQueuePause, stopJob, reorderQueue
  } = useJobs();

  const { savedJobs, saveJob, deleteJob } = useJobCatalog();

  /* const workspace = useWorkspace(addLog, addJob); */
  // We will switch to context soon. For now let's keep it to verify hooks compile.
  // Actually, let's do the full switch.
  const workspace = useWorkspaceContext();

  const architect = useArchitect({
    addLog,
    setAgents: workspace.setAgents,
    setChannels: workspace.setChannels,
    setGroups: workspace.setGroups,
    setMessages: workspace.setMessages,
    setActiveChannels: workspace.setActiveChannels,
  }, addJob);

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
  }, addJob);

  const processingRef = useRef(false);

  // Job Execution Loop
  useEffect(() => {
    const processJobs = async () => {
      if (processingRef.current || isPaused) return;

      const queuedJob = jobs.find(j => j.status === "queued");
      if (queuedJob) {
        processingRef.current = true;
        try {
          updateJobStatus(queuedJob.id, "running");
          addNotebookEntry({
            category: "action",
            icon: <GradientIcon icon={Rocket} size={16} gradient={["#fbbf24", "#f59e0b"]} />,
            title: `Job Started: ${queuedJob.type}`,
            description: `Running command "${queuedJob.type}" (Job ${queuedJob.id.slice(0, 8)}).`,
            details: { jobId: queuedJob.id, command: queuedJob.type, request: queuedJob.request },
            tags: ["job", queuedJob.type],
          });

          const context: CommandContext = {
            workspace: {
              ...workspace,
              addLog,
              activeChannel: workspace.activeChannel,
              setActiveChannel: workspace.setActiveChannel,
              setActiveChannels: workspace.setActiveChannels
            },
            auth: { user },
            jobs: {
              addArtifact,
              removeArtifact,
              importArtifact,
              allArtifacts,
              // Queue Management
              addJob,
              removeJob,
              pauseQueue: () => (!isPaused && toggleQueuePause()),
              resumeQueue: () => (isPaused && toggleQueuePause()),
              isPaused,
              getQueue: () => jobs,
              // Catalog Management
              getCatalog: () => savedJobs,
              saveDefinition: saveJob,
              deleteDefinition: deleteJob
            },
            ecosystem: {
              ecosystems: ecosystem.ecosystems,
              bridges: ecosystem.bridges,
              bridgeMessages: ecosystem.bridgeMessages,
              setEcosystems: ecosystem.setEcosystems,
              setBridges: ecosystem.setBridges,
              setBridgeMessages: ecosystem.setBridgeMessages,
              setActiveBridges: ecosystem.setActiveBridges,
              createBridge: ecosystem.createBridge,
              removeBridge: ecosystem.removeBridge,
              saveCurrentNetwork: ecosystem.saveCurrentNetwork,
              loadNetwork: ecosystem.loadNetwork,
              dissolveNetwork: ecosystem.dissolveNetwork
            },
            system: {
              setApiKey: (key: string) => localStorage.setItem("anthropic_api_key", key),
              setModel: (model: string) => localStorage.setItem("anthropic_model", model)
            },
            architect: {
              generateNetwork: architect.generateNetwork,
              deployNetwork: architect.deployNetwork
            }
          };

          let finalResult;

          if (queuedJob.steps && queuedJob.steps.length > 0) {
            // Multi-step Job
            if (queuedJob.mode === "parallel") {
              const promises = queuedJob.steps.map(async (step) => {
                const res = await registry.execute(step.commandId, step.args, context);
                return { stepId: step.id, result: res };
              });
              const results = await Promise.all(promises);
              finalResult = "All steps completed";
              // Optionally store detailed results in job
            } else {
              // Serial
              for (let i = 0; i < queuedJob.steps.length; i++) {
                const step = queuedJob.steps[i];
                // Update progress?
                // updateJob(queuedJob.id, { currentStepIndex: i }); 
                await registry.execute(step.commandId, step.args, context);
              }
              finalResult = "Sequence completed";
            }
          } else {
            // Legacy / Single Command Job
            finalResult = await registry.execute(queuedJob.type, queuedJob.request, context);
          }

          updateJobStatus(queuedJob.id, "completed", typeof finalResult === 'string' ? finalResult : "Done");
          addNotebookEntry({
            category: "output",
            icon: <GradientIcon icon={CheckCircle} size={16} gradient={["#00e5a0", "#10b981"]} />,
            title: `Job Completed: ${queuedJob.type}`,
            description: `Job "${queuedJob.type}" finished successfully.`,
            details: { jobId: queuedJob.id, command: queuedJob.type, result: finalResult },
            tags: ["job", "success", queuedJob.type],
          });

          // Enriched Result Artifact
          const resultArtifact = {
            jobId: queuedJob.id,
            timestamp: Date.now(),
            status: "success",
            command: queuedJob.type,
            data: finalResult || {}
          };

          addArtifact(queuedJob.id, {
            id: `art-${Date.now()}`,
            type: "json",
            name: "result.json",
            content: JSON.stringify(resultArtifact, null, 2)
          });

        } catch (err: any) {
          console.error("Job Failed", err);
          updateJobStatus(queuedJob.id, "failed", err.message || "Unknown error");
          addNotebookEntry({
            category: "system",
            icon: <GradientIcon icon={XCircle} size={16} gradient={["#ef4444", "#dc2626"]} />,
            title: `Job Failed: ${queuedJob.type}`,
            description: `Job "${queuedJob.type}" failed: ${err.message || "Unknown error"}.`,
            details: { jobId: queuedJob.id, command: queuedJob.type, error: err.message },
            tags: ["job", "error", queuedJob.type],
          });
        } finally {
          processingRef.current = false;
        }
      }
    };

    const interval = setInterval(processJobs, 1000); // Check every second (simple polling)
    return () => clearInterval(interval);
  }, [jobs, updateJobStatus, workspace, addLog, user, addArtifact, ecosystem, architect]);


  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Activity Pulse Logic
  const [activityPulse, setActivityPulse] = useState(false);
  const prevEntriesLengthRef = useRef(notebookEntries.length);

  useEffect(() => {
    if (notebookEntries.length > prevEntriesLengthRef.current) {
      setActivityPulse(true);
      const timer = setTimeout(() => setActivityPulse(false), 3000);
      return () => clearTimeout(timer);
    }
    prevEntriesLengthRef.current = notebookEntries.length;
  }, [notebookEntries.length]);

  return (
    <div style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace", background: "#0a0a0f", color: "#e4e4e7", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />

      <Header user={user} logout={logout} setView={setView} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative", flexDirection: isMobile ? "column" : "row" }}>
        <div style={{
          position: "relative",
          zIndex: 20,
          height: isMobile ? "auto" : "100%",
          width: isMobile ? "100%" : "auto",
        }}>
          <Sidebar
            view={view}
            setView={setView}
            ecosystems={ecosystem.ecosystems}
            messages={workspace.messages}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            isMobile={isMobile}
          />
        </div>

        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          {view === "profile" && (
            <ProfileView
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



          {view === "artifacts" && (
            <ArtifactsView
              artifacts={allArtifacts}
              importArtifact={importArtifact}
              removeArtifact={removeArtifact}
            />
          )}

          {view === "activity" && (
            <ErrorBoundary>
              <ActivityView
                entries={notebookEntries}
                clearNotebook={clearNotebook}
                exportNotebook={exportNotebook}
                addEntry={addNotebookEntry}
              />
            </ErrorBoundary>
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
        addLog={addLog}
        setView={setView}
        jobs={jobs}
        addJob={addJob}
        isPaused={isPaused}
        toggleQueuePause={toggleQueuePause}
        stopJob={stopJob}
        reorderQueue={reorderQueue}
        removeJob={removeJob}
        clearJobs={clearJobs}
        activityPulse={activityPulse}
        isMobile={isMobile}
        savedJobs={savedJobs}
        saveJob={saveJob}
        deleteJob={deleteJob}
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

        /* Chat markdown styles */
        .chat-md p { margin: 0 0 8px 0; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md h1, .chat-md h2, .chat-md h3, .chat-md h4 {
          font-family: 'Space Grotesk', sans-serif;
          margin: 12px 0 6px 0;
          color: #f4f4f5;
        }
        .chat-md h1 { font-size: 16px; }
        .chat-md h2 { font-size: 14px; }
        .chat-md h3 { font-size: 13px; color: #a1a1aa; }
        .chat-md h4 { font-size: 12px; color: #71717a; }
        .chat-md pre {
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 6px;
          padding: 10px 12px;
          overflow-x: auto;
          margin: 6px 0;
          font-size: 11px;
          line-height: 1.5;
        }
        .chat-md code {
          font-family: 'DM Mono', 'JetBrains Mono', monospace;
          font-size: 11px;
        }
        .chat-md :not(pre) > code {
          background: rgba(0,229,160,0.08);
          color: #00e5a0;
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11px;
        }
        .chat-md ul, .chat-md ol {
          margin: 4px 0 8px 0;
          padding-left: 20px;
        }
        .chat-md li { margin-bottom: 3px; }
        .chat-md li::marker { color: #52525b; }
        .chat-md blockquote {
          border-left: 2px solid rgba(0,229,160,0.3);
          margin: 6px 0;
          padding: 4px 12px;
          color: #a1a1aa;
          background: rgba(0,229,160,0.03);
          border-radius: 0 4px 4px 0;
        }
        .chat-md a { color: #38bdf8; text-decoration: none; }
        .chat-md a:hover { text-decoration: underline; }
        .chat-md strong { color: #f4f4f5; font-weight: 600; }
        .chat-md em { color: #a1a1aa; }
        .chat-md hr {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.06);
          margin: 10px 0;
        }
        .chat-md table {
          border-collapse: collapse;
          width: 100%;
          margin: 6px 0;
          font-size: 11px;
        }
        .chat-md th, .chat-md td {
          border: 1px solid rgba(255,255,255,0.08);
          padding: 4px 8px;
          text-align: left;
        }
        .chat-md th {
          background: rgba(255,255,255,0.04);
          color: #a1a1aa;
          font-weight: 600;
        }

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

  return isAuthenticated ? (
    <WorkspaceProvider addJob={useJobs().addJob}>
      {/* Wait, useJobs is inside AuthenticatedApp. We need to lift useJobs or pass addJob? 
              useJobs is currently in AuthenticatedApp. 
              Ideally WorkspaceProvider is inside AuthenticatedApp? 
              Yes. because it needs addJob which comes from useJobs. 
              So AuthenticatedApp renders WorkspaceProvider.
              BUT AuthenticatedApp ALSO uses 'workspace' to pass to Architect/Ecosystem.
              So we must split AuthenticatedApp into:
              1. AuthenticatedAppShell (provides jobs, workspace)
              2. AuthenticatedAppContent (consumes workspace)
           */}
      <AuthenticatedApp />
    </WorkspaceProvider>
  ) : <LoginView />;
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

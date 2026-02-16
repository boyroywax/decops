import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Compass } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import type { ViewId } from "../../types";
import { useNotebook } from "../../hooks/useNotebook";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useArchitect } from "../../hooks/useArchitect";
import { useEcosystem } from "../../hooks/useEcosystem";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";
import { useAuth } from "../../context/AuthContext";
import { useJobsContext } from "../../context/JobsContext";
import { useJobCatalog } from "../../hooks/useJobCatalog";
import { ViewSwitcher } from "./ViewSwitcher";
import { useJobExecutor } from "../../hooks/useJobExecutor";

import { useAutomations } from "../../context/AutomationsContext";
import { EcosystemContext } from "../../context/EcosystemContext";
import { useWorkspaceManager } from "../../hooks/useWorkspaceManager";



interface AuthenticatedAppProps {
  notebook: ReturnType<typeof useNotebook>;
}

export function AuthenticatedApp({ notebook }: AuthenticatedAppProps) {
  const [view, setViewRaw] = useState<ViewId>("architect");
  const { entries: notebookEntries, addEntry: addNotebookEntry, addLog, clearNotebook, exportNotebook } = notebook;

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
    isPaused, toggleQueuePause, stopJob, reorderQueue, updateJob,
    setJobs, setStandaloneArtifacts
  } = useJobsContext();

  const { savedJobs, saveJob, deleteJob } = useJobCatalog();
  const workspace = useWorkspaceContext();
  const architect = useArchitect(addLog, addJob, jobs);
  const automations = useAutomations();

  // Workspace Management Logic
  const {
    workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, saveWorkspace, loadWorkspace, deleteWorkspace, duplicateWorkspace
  } = useWorkspaceManager();

  const handleSwitchWorkspace = async (id: string) => {
    if (id === activeWorkspaceId) return;

    // Save Current
    if (activeWorkspaceId) {
      const currentData = workspace.exportWorkspace();
      const currentMeta = workspaces.find(w => w.id === activeWorkspaceId);
      if (currentMeta) {
        // Filter out transition jobs to prevent loops on reload
        const jobsToSave = jobs.filter(j => j.type !== 'switch_workspace' && j.type !== 'create_workspace');

        saveWorkspace({
          metadata: currentMeta,
          ...currentData,
          networks: ecosystem.ecosystems || [],
          bridges: ecosystem.bridges || [],
          jobs: jobsToSave,
          artifacts: allArtifacts,
          automations: automations.automations || [],
          automationRuns: automations.runs
        });
      }
    }

    // Load New
    const newWorkspace = loadWorkspace(id);
    if (newWorkspace) {
      workspace.clearWorkspace();
      clearJobs();
      if (automations.setAutomations) automations.setAutomations([]);
      if (automations.setRuns) automations.setRuns([]);
      if (ecosystem.setEcosystems) ecosystem.setEcosystems([]);
      if (ecosystem.setBridges) ecosystem.setBridges([]);

      workspace.importWorkspace(newWorkspace);
      if (newWorkspace.networks && ecosystem.setEcosystems) ecosystem.setEcosystems(newWorkspace.networks);
      if (newWorkspace.bridges && ecosystem.setBridges) ecosystem.setBridges(newWorkspace.bridges);
      if (newWorkspace.jobs && setJobs) setJobs(newWorkspace.jobs);
      if (newWorkspace.artifacts && setStandaloneArtifacts) setStandaloneArtifacts(newWorkspace.artifacts);
      if (newWorkspace.automations && automations.setAutomations) automations.setAutomations(newWorkspace.automations);
      if (newWorkspace.automationRuns && automations.setRuns) automations.setRuns(newWorkspace.automationRuns);

      setActiveWorkspaceId(id);
    }
  };

  const handleCreateWorkspace = async (name: string, description?: string) => {
    // Save current workspace state before creating new one
    if (activeWorkspaceId) {
      const currentData = workspace.exportWorkspace();
      const currentMeta = workspaces.find(w => w.id === activeWorkspaceId);
      if (currentMeta) {
        const jobsToSave = jobs.filter(j => j.type !== 'switch_workspace' && j.type !== 'create_workspace');

        saveWorkspace({
          metadata: currentMeta,
          ...currentData,
          networks: ecosystem.ecosystems || [],
          bridges: ecosystem.bridges || [],
          jobs: jobsToSave,
          artifacts: allArtifacts,
          automations: automations.automations || [],
          automationRuns: automations.runs
        });
      }
    }

    // Create new workspace without switching — user stays in current workspace
    const newWs = createWorkspace(name, description);
    return newWs.metadata.id;
  };

  const workspaceManager = useMemo(() => ({
    list: () => workspaces,
    create: handleCreateWorkspace,
    switch: handleSwitchWorkspace,
    delete: async (id: string) => deleteWorkspace(id),
    duplicate: async (sourceId: string, name?: string) => {
      const id = duplicateWorkspace(sourceId, name);
      return id;
    },
    currentId: activeWorkspaceId
  }), [workspaces, activeWorkspaceId, handleCreateWorkspace, handleSwitchWorkspace, duplicateWorkspace]);

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

  // Use the new hook for job execution
  useJobExecutor({
    jobs,
    addJob,
    updateJobStatus,
    updateJob,
    addArtifact,
    removeJob,
    clearJobs,
    allArtifacts,
    importArtifact,
    removeArtifact,
    isPaused,
    toggleQueuePause,
    savedJobs,
    saveJob,
    deleteJob,
    setJobs,
    setStandaloneArtifacts,
    workspace,
    user,
    architect,
    ecosystem,
    addLog,
    addNotebookEntry,
    automations,
    workspaceManager
  });

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

      <EcosystemContext.Provider value={ecosystem}>
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
              agents={workspace.agents}
              channels={workspace.channels}
              groups={workspace.groups}
              collapsed={sidebarCollapsed}
              setCollapsed={setSidebarCollapsed}
              isMobile={isMobile}
            />
          </div>

          <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
            <ViewSwitcher
              view={view}
              setView={setView}
              workspace={workspace}
              architect={architect}
              ecosystem={ecosystem}
              allArtifacts={allArtifacts}
              importArtifact={importArtifact}
              removeArtifact={removeArtifact}
              notebookEntries={notebookEntries}
              clearNotebook={clearNotebook}
              exportNotebook={exportNotebook}
              addNotebookEntry={addNotebookEntry}
              addJob={addJob}
            />
          </main>
        </div>

        <Footer
          agents={workspace.agents}
          channels={workspace.channels}
          groups={workspace.groups}
          messages={workspace.messages}

          ecosystems={ecosystem.ecosystems}
          bridges={ecosystem.bridges}
          ecosystem={ecosystem}
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
      </EcosystemContext.Provider>

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

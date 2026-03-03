import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Compass } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import type { ViewId, NavContext, JobDefinition } from "../../types";
import { useNotebook } from "../../hooks/useNotebook";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useArchitect } from "../../hooks/useArchitect";
import { useEcosystem } from "../../hooks/useEcosystem";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Footer, type PanelMode } from "./Footer";
import { ChatPanel } from "./ChatPanel";
import { useAuth } from "../../context/AuthContext";
import { useJobsContext } from "../../context/JobsContext";
import { useJobCatalog } from "../../hooks/useJobCatalog";
import { ViewSwitcher } from "./ViewSwitcher";
import { StudioView } from "../views/StudioView";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { useJobExecutor } from "../../hooks/useJobExecutor";

import { useAutomations } from "../../context/AutomationsContext";
import { EcosystemContext } from "../../context/EcosystemContext";
import { useWorkspaceManager } from "../../hooks/useWorkspaceManager";
import { useRouteSync } from "../../hooks/useRouteSync";
import { ProfileModal } from "./ProfileModal";
import { ArchitectPopup } from "./ArchitectPopup";
import { ActivityModal } from "./ActivityModal";
import { useTheme } from "../../context/ThemeContext";
import "../../styles/components/authenticated-app.css";
import "../../styles/components/global.css";



interface AuthenticatedAppProps {
  notebook: ReturnType<typeof useNotebook>;
}

export function AuthenticatedApp({ notebook }: AuthenticatedAppProps) {
  const [view, setViewRaw] = useState<ViewId>("networks");
  const [navContext, setNavContext] = useState<NavContext>({});
  const { entries: notebookEntries, addEntry: addNotebookEntry, addLog, clearNotebook, exportNotebook } = notebook;

  // Sync URL ↔ view/navContext
  useRouteSync(view, navContext, setViewRaw, setNavContext);

  // Modal / popup state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showArchitectPopup, setShowArchitectPopup] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Wrap setView to track navigation in Notebook — intercept profile, architect, activity
  const setView = useCallback((v: ViewId) => {
    if (v === "profile") { setShowProfileModal(true); return; }
    if (v === "architect") { setShowArchitectPopup(true); return; }
    if (v === "activity") { setShowActivityModal(true); return; }
    setViewRaw(v);
    setNavContext({}); // Clear drill-down context on sidebar navigation
    addNotebookEntry({
      category: "navigation",
      icon: <GradientIcon icon={Compass} size={16} gradient={["#38bdf8", "#818cf8"]} />,
      title: `Navigated to ${v.charAt(0).toUpperCase() + v.slice(1)}`,
      description: `Opened the ${v} view.`,
      tags: ["navigation", v],
    });
  }, [addNotebookEntry]);

  // Hierarchical navigation: navigate to a view with drill-down context
  const navigateTo = useCallback((v: ViewId, ctx: NavContext) => {
    if (v === "profile") { setShowProfileModal(true); return; }
    if (v === "architect") { setShowArchitectPopup(true); return; }
    if (v === "activity") { setShowActivityModal(true); return; }
    setViewRaw(v);
    setNavContext(ctx);
    const parts: string[] = [v];
    if (ctx.networkId) parts.push("network");
    if (ctx.groupId) parts.push("group");
    if (ctx.agentId) parts.push("agent");
    addNotebookEntry({
      category: "navigation",
      icon: <GradientIcon icon={Compass} size={16} gradient={["#38bdf8", "#818cf8"]} />,
      title: `Drilled into ${parts.join(" › ")}`,
      description: `Navigated to ${v} detail view.`,
      tags: ["navigation", v, "drill-down"],
    });
  }, [addNotebookEntry]);

  const { user, logout } = useAuth();
  const {
    jobs, addJob, updateJobStatus, addArtifact, removeJob, clearJobs,
    allArtifacts, importArtifact, removeArtifact, updateArtifact,
    isPaused, toggleQueuePause, stopJob, reorderQueue, updateJob,
    setJobs, setStandaloneArtifacts
  } = useJobsContext();

  const { savedJobs, saveJob, deleteJob } = useJobCatalog();
  const workspace = useWorkspaceContext();
  const architect = useArchitect(addLog, addJob, jobs);

  /** Convert a JobDefinition into a JobRequest and submit it */
  const runJobDef = useCallback((jobDef: JobDefinition) => {
    addJob({
      type: jobDef.name,
      request: { description: jobDef.description },
      steps: jobDef.steps,
      mode: jobDef.mode,
      ...(jobDef.storageDefaults ? { storageDefaults: jobDef.storageDefaults } : {}),
      ...(jobDef.deliverables ? { deliverables: jobDef.deliverables } : {}),
      ...(jobDef.inputDefaults && jobDef.inputDefaults.length > 0 ? { inputDefaults: jobDef.inputDefaults } : {}),
      ...(jobDef.parallelGroups && jobDef.parallelGroups.length > 0 ? { parallelGroups: jobDef.parallelGroups } : {}),
    });
  }, [addJob]);
  const automations = useAutomations();

  // Workspace Management Logic
  const {
    workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, saveWorkspace, loadWorkspace, deleteWorkspace, duplicateWorkspace, updateStats
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
          ecosystem: ecosystem.ecosystem,
          activeNetworkId: ecosystem.activeNetworkId || undefined,
          userId: user?.id,
          // Legacy fields kept for backward compat
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

      // Restore ecosystem — prefer first-class ecosystem, fall back to legacy arrays
      if (newWorkspace.ecosystem && ecosystem.setEcosystem) {
        ecosystem.setEcosystem(newWorkspace.ecosystem);
      } else {
        if (ecosystem.setEcosystems) ecosystem.setEcosystems(newWorkspace.networks || []);
        if (ecosystem.setBridges) ecosystem.setBridges(newWorkspace.bridges || []);
      }

      // Restore active network
      if (ecosystem.setActiveNetworkId) {
        ecosystem.setActiveNetworkId(newWorkspace.activeNetworkId || null);
      }

      workspace.importWorkspace(newWorkspace);
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
          ecosystem: ecosystem.ecosystem,
          activeNetworkId: ecosystem.activeNetworkId || undefined,
          userId: user?.id,
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

  // Keep workspace card stats in sync with live data
  useEffect(() => {
    if (activeWorkspaceId) {
      updateStats(activeWorkspaceId, {
        agentCount: workspace.agents.length,
        channelCount: workspace.channels.length,
        groupCount: workspace.groups.length,
        networkCount: ecosystem.ecosystems?.length || 0,
      });
    }
  }, [activeWorkspaceId, workspace.agents.length, workspace.channels.length, workspace.groups.length, ecosystem.ecosystems?.length]);

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
    updateArtifact,
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

  // Lifted footer panel state (so we can render ChatPanel in different positions)
  const [footerPanel, setFooterPanel] = useState<PanelMode>("none");
  const { chatPosition } = useTheme();

  // Chat panel sizing
  const DEFAULT_CHAT_SIZE = chatPosition === "bottom" ? 420 : 380;
  const [chatSize, setChatSize] = useState(DEFAULT_CHAT_SIZE);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatSavedRef = useRef(DEFAULT_CHAT_SIZE);
  const [sideChatVisible, setSideChatVisible] = useState(true);
  const toggleSideChat = useCallback(() => setSideChatVisible(prev => !prev), []);

  const handleChatSetSize = useCallback((s: number) => {
    setChatSize(s);
    setChatExpanded(false);
  }, []);

  const handleChatToggleExpand = useCallback(() => {
    setChatExpanded(prev => {
      if (prev) {
        setChatSize(chatSavedRef.current);
        return false;
      } else {
        chatSavedRef.current = chatSize;
        setChatSize(chatPosition === "bottom"
          ? window.innerHeight - 93
          : window.innerWidth - 320
        );
        return true;
      }
    });
  }, [chatSize, chatPosition]);

  // Auto-open Actions when entering Studio mode
  useEffect(() => {
    if (view === "jobs" && footerPanel === "none") {
      setFooterPanel("jobs");
    }
  }, [view === "jobs"]);

  // Close footer drawer when entering Editor view
  useEffect(() => {
    if (view === "editor" && footerPanel !== "none") {
      setFooterPanel("none");
    }
  }, [view]);

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

  // Ctrl+K / Cmd+K keybinding for Architect popup
  // Cmd+S / Ctrl+S for Studio, Cmd+L / Ctrl+L for Chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowArchitectPopup(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        setView("jobs");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        setView("channels");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const chatWorkspaceContext = useMemo(() => ({
    agents: workspace.agents, channels: workspace.channels, groups: workspace.groups,
    messages: workspace.messages, ecosystems: ecosystem.ecosystems, bridges: ecosystem.bridges,
    addJob, jobs,
  }), [workspace.agents, workspace.channels, workspace.groups, workspace.messages, ecosystem.ecosystems, ecosystem.bridges, addJob, jobs]);

  const isSideChat = chatPosition === "left" || chatPosition === "right";

  const shouldHideChat = isSideChat ? !sideChatVisible : footerPanel !== "chat";

  const chatPanelNode = (
    <div style={shouldHideChat ? { display: "none" } : undefined}>
      <ChatPanel
        context={chatWorkspaceContext}
        ecosystem={ecosystem}
        onClose={() => { if (isSideChat) setSideChatVisible(false); else setFooterPanel("none"); }}
        addLog={addLog}
        height={chatSize}
        setHeight={handleChatSetSize}
        isExpanded={chatExpanded}
        onToggleExpand={handleChatToggleExpand}
        position={chatPosition}
        view={view}
      />
    </div>
  );

  return (
    <div className="app-shell">
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />

      <Header user={user} logout={logout} setView={setView} onProfileClick={() => setShowProfileModal(true)} activityPulse={activityPulse} onActivityClick={() => setShowActivityModal(true)} />

      <EcosystemContext.Provider value={ecosystem}>
        <div className={`app-content ${isMobile ? "app-content--mobile" : ""}`}>
          <div className={`app-sidebar-wrapper ${isMobile ? "app-sidebar-wrapper--mobile" : ""}`}>
            <Sidebar
              view={view}
              setView={setView}
              ecosystems={ecosystem.ecosystems}
              messages={workspace.messages}
              bridgeMessages={ecosystem.bridgeMessages}
              agents={workspace.agents}
              channels={workspace.channels}
              groups={workspace.groups}
              collapsed={sidebarCollapsed}
              setCollapsed={setSidebarCollapsed}
              isMobile={isMobile}
              ecosystemName={ecosystem.ecosystem?.name}
            />
          </div>

          {/* Chat panel: left position (after sidebar) */}
          {isSideChat && chatPosition === "left" && chatPanelNode}

          <main className={`app-main ${view === "jobs" ? "app-main--studio" : ""}`}>
            {/* Studio is always mounted to preserve state across navigations */}
            <div style={{ display: view === "jobs" ? "contents" : "none" }}>
              <ErrorBoundary>
                <StudioView
                  savedJobs={savedJobs}
                  onSaveJob={saveJob}
                  onDeleteJob={deleteJob}
                  onRunJob={runJobDef}
                />
              </ErrorBoundary>
            </div>
            {view !== "jobs" && (
              <ViewSwitcher
              view={view}
              setView={setView}
              navContext={navContext}
              navigateTo={navigateTo}
              workspace={workspace}
              architect={architect}
              ecosystem={ecosystem}
              allArtifacts={allArtifacts}
              importArtifact={importArtifact}
              removeArtifact={removeArtifact}
              updateArtifact={updateArtifact}
              notebookEntries={notebookEntries}
              clearNotebook={clearNotebook}
              exportNotebook={exportNotebook}
              addNotebookEntry={addNotebookEntry}
              addJob={addJob}
              savedJobs={savedJobs}
              onSaveJob={saveJob}
              onDeleteJob={deleteJob}
            />
            )}
          </main>

          {/* Chat panel: right position */}
          {isSideChat && chatPosition === "right" && chatPanelNode}
        </div>

        {/* Chat panel: bottom position (below content, above footer) */}
        {!isSideChat && chatPanelNode}

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
          allArtifacts={allArtifacts}
          importArtifact={importArtifact}
          removeArtifact={removeArtifact}
          updateArtifact={updateArtifact}
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
          view={view}
          panel={footerPanel}
          setPanel={setFooterPanel}
          chatPosition={chatPosition}
          sideChatVisible={sideChatVisible}
          toggleSideChat={toggleSideChat}
        />

        {/* Profile Modal (overlay) */}
        <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />

        {/* Activity Modal (overlay) */}
        <ActivityModal
          isOpen={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          entries={notebookEntries}
          clearNotebook={clearNotebook}
          exportNotebook={exportNotebook}
          addEntry={addNotebookEntry}
        />

        {/* Architect Popup (Ctrl+K) */}
        <ArchitectPopup
          isOpen={showArchitectPopup}
          onClose={() => setShowArchitectPopup(false)}
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
      </EcosystemContext.Provider>
    </div>
  );
}

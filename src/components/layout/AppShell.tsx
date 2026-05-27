/**
 * AppShell — the visual layout shell for an authenticated session.
 *
 * Renders Header, Sidebar, ChatPanel (positioned left/right/bottom), the
 * main view area (always-mounted StudioView + ViewSwitcher), Footer, and
 * the Profile/Activity overlay modals. All state and integration plumbing
 * stays in AuthenticatedApp; this component is pure presentation.
 *
 * Extracted from AuthenticatedApp per §3.4 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { ReactNode } from "react";
import type { ViewId, NavContext, JobDefinition } from "@/types";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Footer, type PanelMode } from "./Footer";
import { ViewSwitcher } from "./ViewSwitcher";
import { StudioView } from "@/toolkits/studio";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ProfileModal } from "./ProfileModal";
import { ActivityModal } from "./ActivityModal";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useEcosystem } from "@/hooks/useEcosystem";
import { useArchitect } from "@/toolkits/architect";
import { useJobsContext } from "@/context/JobsContext";
import { useJobCatalog } from "@/hooks/useJobCatalog";
import type { useNotebook } from "@/hooks/useNotebook";

type Workspace = ReturnType<typeof useWorkspaceContext>;
type Ecosystem = ReturnType<typeof useEcosystem>;
type Architect = ReturnType<typeof useArchitect>;
type JobsCtx = ReturnType<typeof useJobsContext>;
type JobCatalog = ReturnType<typeof useJobCatalog>;
type Notebook = ReturnType<typeof useNotebook>;

export interface AppShellProps {
  // Auth / user
  user: { id?: string; name?: string; email?: string } | null;
  logout: () => void;

  // Navigation
  view: ViewId;
  setView: (v: ViewId) => void;
  navContext: NavContext;
  navigateTo: (v: ViewId, ctx: NavContext) => void;

  // Responsive layout
  isMobile: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  // Domain state
  workspace: Workspace;
  ecosystem: Ecosystem;
  architect: Architect;

  // Notebook
  notebookEntries: Notebook["entries"];
  addNotebookEntry: Notebook["addEntry"];
  clearNotebook: Notebook["clearNotebook"];
  exportNotebook: Notebook["exportNotebook"];
  addLog: Notebook["addLog"];

  // Jobs / artifacts
  jobs: JobsCtx["jobs"];
  addJob: JobsCtx["addJob"];
  allArtifacts: JobsCtx["allArtifacts"];
  importArtifact: JobsCtx["importArtifact"];
  removeArtifact: JobsCtx["removeArtifact"];
  updateArtifact: JobsCtx["updateArtifact"];
  isPaused: JobsCtx["isPaused"];
  toggleQueuePause: JobsCtx["toggleQueuePause"];
  stopJob: JobsCtx["stopJob"];
  reorderQueue: JobsCtx["reorderQueue"];
  removeJob: JobsCtx["removeJob"];
  clearJobs: JobsCtx["clearJobs"];

  // Job catalog
  savedJobs: JobCatalog["savedJobs"];
  saveJob: JobCatalog["saveJob"];
  deleteJob: JobCatalog["deleteJob"];
  runJobDef: (jobDef: JobDefinition) => ReturnType<JobsCtx["addJob"]>;

  // Chat layout
  chatPanelNode: ReactNode;
  chatPosition: "left" | "right" | "bottom";
  isSideChat: boolean;
  footerPanel: PanelMode;
  setFooterPanel: (m: PanelMode) => void;
  sideChatVisible: boolean;
  toggleSideChat: () => void;

  // Notifications / pulse
  activityPulse: boolean;

  // Modals
  showProfileModal: boolean;
  setShowProfileModal: (v: boolean) => void;
  showActivityModal: boolean;
  setShowActivityModal: (v: boolean) => void;
}

export function AppShell(props: AppShellProps) {
  const {
    user, logout,
    view, setView, navContext, navigateTo,
    isMobile, sidebarCollapsed, setSidebarCollapsed,
    workspace, ecosystem, architect,
    notebookEntries, addNotebookEntry, clearNotebook, exportNotebook, addLog,
    jobs, addJob, allArtifacts, importArtifact, removeArtifact, updateArtifact,
    isPaused, toggleQueuePause, stopJob, reorderQueue, removeJob, clearJobs,
    savedJobs, saveJob, deleteJob, runJobDef,
    chatPanelNode, chatPosition, isSideChat,
    footerPanel, setFooterPanel, sideChatVisible, toggleSideChat,
    activityPulse,
    showProfileModal, setShowProfileModal,
    showActivityModal, setShowActivityModal,
  } = props;

  return (
    <div className="app-shell">
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />

      <Header
        user={user}
        logout={logout}
        setView={setView}
        onProfileClick={() => setShowProfileModal(true)}
        activityPulse={activityPulse}
        onActivityClick={() => setShowActivityModal(true)}
        isMobile={isMobile}
      />

      <div className={`app-content ${isMobile ? "app-content--mobile" : ""}`}>
        <div className={`app-sidebar-wrapper ${isMobile ? "app-sidebar-wrapper--mobile" : ""}`}>
          <Sidebar
            view={view}
            setView={setView}
            networks={ecosystem.networks}
            messages={workspace.messages}
            bridgeMessages={ecosystem.bridgeMessages}
            agents={workspace.agents}
            channels={workspace.channels}
            groups={workspace.groups}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            isMobile={isMobile}
            ecosystemName={ecosystem.ecosystem?.name}
            totalUnread={workspace.totalUnread}
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
        networks={ecosystem.networks}
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
    </div>
  );
}

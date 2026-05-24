import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Compass } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import type { ViewId, NavContext, JobDefinition } from "@/types";
import { useNotebook } from "@/hooks/useNotebook";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useArchitect, ArchitectProvider, ArchitectBanner, ArchitectWelcome } from "@/toolkits/architect";
import { useEcosystem } from "@/hooks/useEcosystem";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Footer, type PanelMode } from "./Footer";
import { ChatPanel } from "./ChatPanel";
import { useAuth } from "@/context/AuthContext";
import { useJobsContext } from "@/context/JobsContext";
import { useJobCatalog } from "@/hooks/useJobCatalog";
import { ViewSwitcher } from "./ViewSwitcher";
import { StudioView } from "@/toolkits/studio";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useJobExecutor } from "@/hooks/useJobExecutor";

import { useAutomations } from "@/context/AutomationsContext";
import { useWorkspaceManager } from "@/hooks/useWorkspaceManager";
import { useRouteSync } from "@/hooks/useRouteSync";
import { ProfileModal } from "./ProfileModal";
import { ActivityModal } from "./ActivityModal";
import { useTheme } from "@/context/ThemeContext";
import { CommandContextProvider } from "@/context/CommandContextProvider";
import { useChatAgentsStore } from "@/services/chat/agents";
import type { ChatAgentSubmitContext } from "@/services/chat/agents";
import { Sparkles, Clapperboard, Edit3 } from "lucide-react";
import { SCENARIO_PRESETS } from "@/constants";
import "../../styles/components/authenticated-app.css";
import "../../styles/components/global.css";

/**
 * Stream a short canned reply word-by-word into the active chat agent's
 * stream UI so the user sees the same live-typing feel as the workspace
 * stream. Falls back to a single appendAssistantMessage when the host
 * panel doesn't support streaming.
 */
async function streamCannedReply(ctx: ChatAgentSubmitContext, text: string): Promise<void> {
  if (!ctx.streamAssistantMessage) {
    ctx.appendAssistantMessage?.(text);
    return;
  }
  const stream = ctx.streamAssistantMessage();
  const tokens = text.match(/\S+\s*/g) ?? [text];
  for (const token of tokens) {
    stream.append(token);
    await new Promise((r) => setTimeout(r, 18));
  }
  stream.done(text);
}



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
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Wrap setView to track navigation in Notebook — intercept profile, architect, activity
  const setView = useCallback((v: ViewId) => {
    if (v === "profile") { setShowProfileModal(true); return; }
    if (v === "architect") { activateArchitectChatAgent(); return; }
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
    if (v === "architect") { activateArchitectChatAgent(); return; }
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

  /** Convert a JobDefinition into a JobRequest and submit it.
   *  Returns the newly queued Job so callers (e.g. AI tool) can track it. */
  const runJobDef = useCallback((jobDef: JobDefinition) => {
    return addJob({
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
          networks: ecosystem.networks || [],
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
        if (ecosystem.setNetworks) ecosystem.setNetworks(newWorkspace.networks || []);
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
          networks: ecosystem.networks || [],
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
        networkCount: ecosystem.networks?.length || 0,
      });
    }
  }, [activeWorkspaceId, workspace.agents.length, workspace.channels.length, workspace.groups.length, ecosystem.networks?.length]);

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
  const { chatPosition: rawChatPosition } = useTheme();
  // Force bottom chat on mobile — side panels don't work on small screens
  const chatPosition = isMobile ? "bottom" as const : rawChatPosition;

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
          ? (isMobile ? Math.floor(window.innerHeight * 0.8) : window.innerHeight - 93)
          : window.innerWidth - 320
        );
        return true;
      }
    });
  }, [chatSize, chatPosition, isMobile]);

  // Auto-open Actions when entering Studio mode and auto-close footer when
  // entering Editor mode are now driven by each agent's `workspace` config
  // (see the universal workspace applier effect below). View-bound agents
  // (studio for `jobs`, editor for `editor`) supply the layout intent.

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

  // ── Chat-agent integration ─────────────────────────────────────────
  // The chat panel is the unified AI interaction surface. Activating an agent
  // (Architect, libp2p, …) flips the chat panel open + focuses input + hands
  // the user's next prompt to the agent's onSubmit handler.
  // NOTE: we deliberately do NOT subscribe to the whole chat-agents store —
  // that would re-render AuthenticatedApp on every agent register/unregister
  // and feed an infinite loop. Pull actions via `.getState()` instead.

  const openChatPanel = useCallback(() => {
    if (chatPosition === "left" || chatPosition === "right") {
      setSideChatVisible(true);
    } else {
      setFooterPanel("chat");
    }
  }, [chatPosition]);

  const activateArchitectChatAgent = useCallback(() => {
    // Architect's `workspace` config (view: "networks", sideChatFooterPanel:
    // "none", openChat: true) is applied by the universal workspace applier
    // effect below — `open("architect")` is all we need here.
    useChatAgentsStore.getState().open("architect");
  }, []);

  // Any caller that bumps the open-tick (Cmd+K, libp2p Bot button, …) opens
  // the chat panel. We only react to the increasing tick so we don't fight
  // the user explicitly closing the panel.
  const openTick = useChatAgentsStore((s) => s.openTick);
  useEffect(() => {
    if (openTick > 0) openChatPanel();
  }, [openTick, openChatPanel]);

  // Architect chat agent registration. The registered onSubmit reads the
  // architect object via a ref so it always sees the latest closures without
  // re-registering on every render (which would otherwise loop the store
  // subscribers).
  const architectRef = useRef(architect);
  useEffect(() => { architectRef.current = architect; }, [architect]);

  useEffect(() => {
    const dispose = useChatAgentsStore.getState().register({
      id: "architect",
      name: "Architect",
      description: "Describe a network and the Architect will generate a deployable mesh blueprint.",
      icon: Sparkles,
      gradient: ["#fbbf24", "#fcd34d"],
      banner: ArchitectBanner,
      welcome: ArchitectWelcome,
      preferredSideWidth: 1000,
      freshConversation: true,
      // Scope tools to the design / network domain so the model stays
      // focused and the request stays well under Anthropic's 128-tool cap.
      toolkitIds: [
        "ecosystem",
        "agent-management",
        "infrastructure",
        "workspace-mgmt",
        "autonomy",
        "jobs",
        "artifacts",
      ],
      placeholder: "Describe a network or multi-agent ecosystem to build…",
      workspace: {
        // Architect generates networks — land the user on the Network
        // Manager so newly-built networks appear in view. Side-chat layout
        // collapses the bottom drawer; bottom-anchored chat keeps the
        // footer (it IS the chat).
        view: "networks",
        sideChatFooterPanel: "none",
      },
      quickActions: SCENARIO_PRESETS.slice(0, 5).map((s) => ({
        label: s.label,
        prompt: s.desc,
      })),
      onSubmit: async (text, ctx) => {
        const a = architectRef.current;
        const phase = a.archPhase;
        const trimmed = text.trim();
        // Intent: user explicitly asks for a new design / blueprint.
        const wantsGen =
          /\b(build|create|generate|design|make|spin\s*up|new\s+(network|design|blueprint|ecosystem)|another\s+(network|design|blueprint|ecosystem)|build\s+another|start\s+over)\b/i.test(
            trimmed,
          );

        // Mid-flight: a blueprint is on screen awaiting deploy/discard, or is deploying.
        if (phase === "preview" || phase === "deploying") {
          const reply =
            phase === "deploying"
              ? "Your ecosystem is deploying right now — I'll be ready for the next design once it finishes."
              : "Your blueprint is ready below. Deploy or discard it before I draft another one.";
          await streamCannedReply(ctx, reply);
          return true;
        }

        // After deployment: only regenerate if the user clearly wants a new design.
        if (phase === "done" && !wantsGen) {
          const reply =
            /\b(thanks?|thank you|thx|ty|cheers|nice|great|awesome|cool|perfect)\b/i.test(trimmed)
              ? "You're welcome! Tell me when you'd like to build another network and I'll draft a fresh blueprint."
              : "Your last ecosystem is deployed. Say something like \"build a new network for…\" and I'll generate another blueprint.";
          await streamCannedReply(ctx, reply);
          return true;
        }

        // Otherwise (phase === "input", or "done" with explicit generation intent): generate.
        a.generateNetwork(trimmed);
        await new Promise<void>((resolve) => {
          const start = Date.now();
          const tick = () => {
            const cur = architectRef.current;
            if (!cur.archGenerating) return resolve();
            if (cur.archError) return resolve();
            if (Date.now() - start > 90_000) return resolve();
            setTimeout(tick, 200);
          };
          tick();
        });
        if (architectRef.current.archError) {
          ctx.appendAssistantMessage?.(`Architect error: ${architectRef.current.archError}`);
        }
        return true;
      },
    });
    return dispose;
  }, []);

  // Editor + Studio chat agents. These are passive registrations that let
  // the chat panel render the right banner / input icon when the user is
  // working in those toolkit views. Their onSubmit returns false so input
  // falls through to the existing studio/editor chat paths.
  useEffect(() => {
    const store = useChatAgentsStore.getState();
    const disposeEditor = store.register({
      id: "editor",
      name: "Editor",
      description: "Routing prompts to the editor — ask the AI to edit, refactor or explain your file.",
      icon: Edit3,
      gradient: ["#60a5fa", "#a78bfa"],
      placeholder: "Ask the AI to help edit your file…",
      toolkitIds: ["artifacts", "workspace-mgmt"],
      workspace: {
        // Editor takes the full screen — collapse the bottom drawer when
        // chat is on a side panel. The Editor view is reached via the
        // sidebar; the agent itself is view-bound so we don't force it.
        view: "editor",
        sideChatFooterPanel: "none",
      },
    });
    const disposeStudio = store.register({
      id: "studio",
      name: "Studio",
      description: "Routing prompts to Studio — describe canvas changes, layouts, and analytics.",
      icon: Clapperboard,
      gradient: ["#f472b6", "#fb7185"],
      placeholder: "Ask the AI to build on the Studio canvas…",
      toolkitIds: ["studio", "jobs", "artifacts", "agent-management"],
      workspace: {
        // Studio drives Job canvases — land on the Jobs view and auto-open
        // the Actions drawer so the user sees the running job artifacts.
        view: "jobs",
        sideChatFooterPanel: "jobs",
      },
    });
    return () => { disposeEditor(); disposeStudio(); };
  }, []);

  // ─── Universal workspace applier ────────────────────────────────────
  // When the active chat agent changes, apply its declarative
  // `workspace` config (view, footer-drawer, chat visibility). One effect,
  // one source of truth — replaces the per-toolkit useEffect blocks that
  // used to fight each other over layout state.
  const activeAgentId = useChatAgentsStore((s) => s.activeAgentId);
  useEffect(() => {
    if (!activeAgentId) return;
    const agent = useChatAgentsStore.getState().agents[activeAgentId];
    const config = agent?.workspace;
    if (!config) return;

    if (config.view) setViewRaw(config.view);
    if (config.clearNavContext !== false) setNavContext({});

    // Footer drawer is only manipulated for side-anchored chat layouts;
    // bottom-anchored chat re-uses the footer as the chat surface itself,
    // so changing it there would close the chat.
    if (config.sideChatFooterPanel && (chatPosition === "left" || chatPosition === "right")) {
      setFooterPanel(config.sideChatFooterPanel);
    }

    if (config.openChat !== false) openChatPanel();
  }, [activeAgentId, chatPosition, openChatPanel]);

  // View → agent binding. Two asymmetric responsibilities:
  //   • Auto-activate truly view-bound agents (Editor, Studio) when their
  //     view becomes active.
  //   • Release ANY active agent whose declared `workspace.view` no longer
  //     matches the current view. This keeps non-view-bound agents like
  //     Architect from sticking around after the user navigates away —
  //     their banner, cards and theme all clear automatically.
  // We do NOT auto-activate non-view-bound agents on view enter, because
  // their home view may be the default landing page (Architect → networks).
  const VIEW_BOUND_AGENTS: Record<string, string> = {
    editor: "editor",
    jobs: "studio",
  };
  useEffect(() => {
    const store = useChatAgentsStore.getState();
    const desired = VIEW_BOUND_AGENTS[view as string];
    const currentId = store.activeAgentId;
    const current = currentId ? store.agents[currentId] : null;
    const currentIsViewBound = currentId
      ? Object.values(VIEW_BOUND_AGENTS).includes(currentId)
      : false;
    // A non-view-bound agent (e.g. Architect) is "stale" once the user
    // navigates away from its declared home view — it should be released
    // so the destination view's bound agent can take over.
    const currentIsStaleRoamer =
      !!current && !currentIsViewBound && !!current.workspace?.view && current.workspace.view !== view;

    if (desired && currentId !== desired && (!currentId || currentIsViewBound || currentIsStaleRoamer)) {
      // Entering a view-bound view: activate its agent, replacing any
      // existing view-bound agent or stale roaming agent.
      store.setActive(desired);
      return;
    }
    if (!desired && currentIsViewBound) {
      // Leaving a view-bound view for a non-bound view: release the
      // view-bound agent so it doesn't linger in unrelated views.
      store.setActive(null);
      return;
    }
    // Release non-view-bound agents (e.g. Architect) when the user
    // navigates away from their declared home view.
    if (currentIsStaleRoamer) {
      store.setActive(null);
    }
  }, [view]);

  // Ctrl+K / Cmd+K — activate Architect agent in the chat panel
  // Cmd+J for Studio (jobs view), Cmd+. for Channels.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        activateArchitectChatAgent();
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
  }, [activateArchitectChatAgent, setView]);

  // NOTE: The live p2p runtime snapshot (libp2p/helia/orbitdb) is read
  // from the service singletons inside ChatPanel at chat-send time —
  // NOT mirrored into React state here. Libp2p pubsub flooding would
  // otherwise rebuild this memo many times per second and cascade a
  // re-render through ChatPanel → MessageBubbles → freezing the UI.
  //
  // Workspace-wide chat snapshot policy: the snapshot is captured only
  // on demand — when the user sends a message, or when the agent calls
  // `refreshChatContext()` (e.g. between tool rounds). Workspace state
  // changes (new agents, channels, messages, jobs streaming events,
  // etc.) do NOT rebuild this object, so ChatPanel + MessageBubbles
  // are not forced to re-render while commands are executing. Commands
  // were previously taking forever because every workspace mutation
  // (including pubsub-driven message inserts) re-keyed this memo and
  // cascaded a full chat re-render.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const ecosystemRef = useRef(ecosystem);
  ecosystemRef.current = ecosystem;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const buildChatWorkspaceContext = useCallback(() => ({
    agents: workspaceRef.current.agents,
    channels: workspaceRef.current.channels,
    groups: workspaceRef.current.groups,
    messages: workspaceRef.current.messages,
    networks: ecosystemRef.current.networks,
    bridges: ecosystemRef.current.bridges,
    addJob,
    jobs: jobsRef.current,
  }), [addJob]);

  // Stored snapshot — initialised once, refreshed only by user-send
  // (via the prop callback ChatPanel invokes) or agent request.
  const [chatWorkspaceContext, setChatWorkspaceContext] = useState(buildChatWorkspaceContext);

  /** Capture a fresh workspace snapshot, store it for UI consumers
   *  (ActionCard, MessageBubble), and return it synchronously so the
   *  caller can hand the SAME snapshot to the LLM in the same tick.
   *  Called at user-message-send time, and exposable to the agent
   *  as a tool when fresh state is needed mid-turn. */
  const refreshChatContext = useCallback(() => {
    const next = buildChatWorkspaceContext();
    setChatWorkspaceContext(next);
    return next;
  }, [buildChatWorkspaceContext]);

  const isSideChat = chatPosition === "left" || chatPosition === "right";

  const shouldHideChat = isSideChat ? !sideChatVisible : footerPanel !== "chat";

  const chatPanelNode = (
    <div style={shouldHideChat ? { display: "none" } : undefined}>
      <ChatPanel
        context={chatWorkspaceContext}
        refreshContext={refreshChatContext}
        ecosystem={ecosystem}
        onClose={() => { if (isSideChat) setSideChatVisible(false); else setFooterPanel("none"); }}
        addLog={addLog}
        height={chatSize}
        setHeight={handleChatSetSize}
        isExpanded={chatExpanded}
        onToggleExpand={handleChatToggleExpand}
        position={chatPosition}
        view={view}
        setView={setView}
      />
    </div>
  );

  return (
    <ArchitectProvider value={architect}>
    <CommandContextProvider ecosystem={ecosystem} architect={architect} addLog={addLog}>
    <div className="app-shell">
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />

      <Header user={user} logout={logout} setView={setView} onProfileClick={() => setShowProfileModal(true)} activityPulse={activityPulse} onActivityClick={() => setShowActivityModal(true)} isMobile={isMobile} />

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
    </CommandContextProvider>
    </ArchitectProvider>
  );
}

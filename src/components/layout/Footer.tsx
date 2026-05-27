import { useState, useEffect, useRef, useCallback } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, ViewId, Job, JobArtifact } from "@/types";
import { MessageCircle, Zap, WifiOff, Terminal, Gem, Monitor, Globe, Users, Radio, Boxes, Pin, Database, Layers, Server, HardDrive, Workflow, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { ChatPosition } from "@/context/ThemeContext";
import { ActionManager } from "@/components/actions/ActionManager";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { LLMManager } from "./LLMManager";
import { DisplayPanel } from "./DisplayPanel";
import { useLLM, type LivenessStatus } from "@/context/LLMContext";
import { useEditorContext } from "@/toolkits/editor";
import { useLibp2pMetrics } from "@/toolkits/libp2p";
import { useHeliaMetrics } from "@/toolkits/helia";
import { useKuboMetrics } from "@/toolkits/kubo";
import { useOrbitdbMetrics } from "@/toolkits/orbitdb";
import { useOrbitdbServerMetrics } from "@/toolkits/orbitdb-server";
import { useOrchestratorMetrics } from "@/toolkits/orchestrator";
import "@/toolkits/orchestrator/styles/orchestrator.css";
import "../../styles/components/footer.css";
import "../../styles/components/llm-manager.css";

// Update interface
interface FooterProps {
    agents: Agent[];
    channels: Channel[];
    groups: Group[];
    messages: Message[];
    networks: Network[];
    bridges: Bridge[];
    ecosystem?: any; // Automated ecosystem object
    addLog?: (msg: string) => void;
    setView: (view: ViewId) => void;
    jobs: Job[];
    removeJob: (id: string) => void;
    clearJobs: () => void;
    addJob: (job: any) => void;
    allArtifacts: JobArtifact[];
    importArtifact: (artifact: JobArtifact) => void;
    removeArtifact: (id: string) => void;
    updateArtifact: (id: string, updates: Partial<JobArtifact>) => void;
    isPaused: boolean;
    toggleQueuePause: () => void;
    stopJob: (id: string) => void;
    reorderQueue: (ids: string[]) => void;
    activityPulse?: boolean;
    isMobile?: boolean;
    savedJobs: any[];
    saveJob: (job: any) => void;
    deleteJob: (id: string) => void;
    view?: ViewId;
    panel: PanelMode;
    setPanel: (p: PanelMode) => void;
    chatPosition: ChatPosition;
    sideChatVisible: boolean;
    toggleSideChat: () => void;
}

export type PanelMode = "none" | "chat" | "jobs" | "artifacts" | "llm" | "display";

const DEFAULT_PANEL_HEIGHT = 420;

export function Footer({ agents, channels, groups, messages, networks, bridges, ecosystem, addLog, setView, jobs, removeJob, clearJobs, addJob, allArtifacts, importArtifact, removeArtifact, updateArtifact, savedJobs, saveJob, deleteJob, view, panel, setPanel, chatPosition, sideChatVisible, toggleSideChat, ...jobsProps }: FooterProps) {
    const isSideChat = chatPosition === "left" || chatPosition === "right";
    const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
    const [isExpanded, setIsExpanded] = useState(false);
    const savedHeightRef = useRef(DEFAULT_PANEL_HEIGHT);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const llm = useLLM();
    const { api: editorApi, queueArtifact } = useEditorContext();
    const libp2pMetrics = useLibp2pMetrics();
    const heliaMetrics = useHeliaMetrics();
    const kuboMetrics = useKuboMetrics();
    const orbitdbMetrics = useOrbitdbMetrics();
    const orbitdbServerMetrics = useOrbitdbServerMetrics();
    const orchestratorMetrics = useOrchestratorMetrics();

    const [lohkCollapsed, setLohkCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem("decops:footer-lohk-collapsed") === "1"; }
        catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem("decops:footer-lohk-collapsed", lohkCollapsed ? "1" : "0"); }
        catch { /* ignore */ }
    }, [lohkCollapsed]);

    const handleOpenLibp2p = useCallback(() => {
        setView("libp2p");
        libp2pMetrics.acknowledgeMessages();
    }, [setView, libp2pMetrics]);

    const handleOpenHelia = useCallback(() => {
        setView("helia");
        heliaMetrics.acknowledgeEntries();
    }, [setView, heliaMetrics]);

    const handleOpenKubo = useCallback(() => {
        setView("kubo");
        kuboMetrics.acknowledgeEntries();
    }, [setView, kuboMetrics]);

    const handleOpenOrbitdb = useCallback(() => {
        setView("orbitdb");
        orbitdbMetrics.acknowledgeDbs();
    }, [setView, orbitdbMetrics]);

    const handleOpenOrbitdbServer = useCallback(() => {
        setView("orbitdb-server");
        orbitdbServerMetrics.acknowledgeDatabases();
    }, [setView, orbitdbServerMetrics]);

    const handleOpenOrchestrator = useCallback(() => {
        setView("orchestrator");
        orchestratorMetrics.acknowledgeDrift();
    }, [setView, orchestratorMetrics]);

    const handleOpenInEditor = useCallback((artifact: JobArtifact) => {
        // If editor is already mounted, load directly
        if (editorApi) {
            editorApi.loadArtifact(artifact);
        } else {
            // Queue for when editor mounts
            queueArtifact(artifact);
        }
        setView("editor");
        setPanel("none");
    }, [editorApi, queueArtifact, setView, setPanel]);

    const isStudioMode = view === "jobs";

    // LLM status dot color
    const dotColors: Record<LivenessStatus, string> = {
        online: "#00e5a0", offline: "#ef4444", checking: "#fbbf24",
        unknown: "#71717a", "no-key": "#71717a",
    };
    const llmModel = llm.getModelById(llm.globalModel);

    // Resize handler: sets height and clears expanded state
    const handleSetHeight = (h: number) => {
        setPanelHeight(h);
        setIsExpanded(false);
    };

    // Toggle between full height and previous height (default or user-set)
    const handleToggleExpand = () => {
        if (isExpanded) {
            setPanelHeight(savedHeightRef.current);
            setIsExpanded(false);
        } else {
            savedHeightRef.current = panelHeight;
            setPanelHeight(window.innerHeight - 93);
            setIsExpanded(true);
        }
    };

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const toggle = (mode: PanelMode) => setPanel(panel === mode ? "none" : mode);

    // Watch for external open requests (e.g. from ProfileModal → llm.openManager())
    useEffect(() => {
        if (llm.managerOpenRequest > 0) {
            setPanel("llm");
        }
    }, [llm.managerOpenRequest]);

    return (
        <>
            {panel === "jobs" && (
                <ActionManager
                    onClose={() => setPanel("none")}
                    isMobile={jobsProps.isMobile}
                    savedJobs={savedJobs}
                    saveJob={saveJob}
                    deleteJob={deleteJob}
                    height={panelHeight}
                    setHeight={handleSetHeight}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                    isStudioMode={isStudioMode}
                    setView={setView}
                />
            )}

            {panel === "artifacts" && (
                <ArtifactsPanel
                    artifacts={allArtifacts}
                    importArtifact={importArtifact}
                    removeArtifact={removeArtifact}
                    updateArtifact={updateArtifact}
                    onClose={() => setPanel("none")}
                    height={panelHeight}
                    setHeight={handleSetHeight}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                    onOpenInEditor={handleOpenInEditor}
                />
            )}

            {panel === "llm" && (
                <LLMManager
                    onClose={() => setPanel("none")}
                    height={panelHeight}
                    setHeight={handleSetHeight}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                />
            )}

            {panel === "display" && (
                <DisplayPanel
                    onClose={() => setPanel("none")}
                    height={panelHeight}
                    setHeight={handleSetHeight}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                />
            )}

            <footer className="app-footer">
                <div className="footer__stats">
                    <button
                        onClick={() => toggle("llm")}
                        className={`footer__llm-btn${panel === "llm" ? " footer__llm-btn--active" : ""}`}
                        title={`LLM: ${llm.overallStatus} — ${llmModel?.label || llm.globalModel}`}
                    >
                        <span
                            className={`llm-dot${llm.overallStatus === "checking" ? " llm-dot--pulse" : ""}`}
                            style={{ width: 6, height: 6, background: dotColors[llm.overallStatus] }}
                        />
                        <Zap size={10} />
                        {!jobsProps.isMobile && (
                            <span className="footer__llm-label">
                                {llmModel?.label || "LLM"}
                            </span>
                        )}
                    </button>

                    <span className="footer__separator">│</span>
                    {isSideChat ? (
                        <button
                            onClick={toggleSideChat}
                            className={`footer__toggle ${sideChatVisible ? "footer__toggle--active" : ""}`}
                            title={sideChatVisible ? "Hide chat" : "Show chat"}
                        >
                            <MessageCircle size={10} />
                            Chat
                        </button>
                    ) : (
                        <button
                            onClick={() => toggle("chat")}
                            className={`footer__toggle ${panel === "chat" ? "footer__toggle--active" : ""}`}
                        >
                            <MessageCircle size={10} />
                            Chat
                        </button>
                    )}
                </div>

                <div className="footer__metrics" aria-label="libp2p metrics">
                    {/*
                      * L.O.H.K toggle + group hidden: the libp2p / Helia / Kubo /
                      * OrbitDB / Lagrange badges now live behind the
                      * Orchestrator expander in the sidebar. The buttons and
                      * their metrics hooks are kept so the surrounding plumbing
                      * (acknowledge*, view routing) keeps working when the
                      * sidebar sub-items are clicked.
                      */}
                    <button
                        type="button"
                        className="footer__lohk-toggle"
                        onClick={() => setLohkCollapsed((v) => !v)}
                        title={lohkCollapsed ? "Show L.O.H.K metrics" : "Hide L.O.H.K metrics"}
                        aria-expanded={!lohkCollapsed}
                        style={{ display: "none" }}
                        hidden
                        aria-hidden="true"
                    >
                        {lohkCollapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
                    </button>

                    <div
                        className={`footer__lohk-group${lohkCollapsed ? " footer__lohk-group--collapsed" : ""}`}
                        aria-hidden="true"
                        style={{ display: "none" }}
                        hidden
                    >
                    <button
                        type="button"
                        className={`footer__metric footer__metric--libp2p${libp2pMetrics.newPubsubMessages > 0 ? " footer__metric--alert" : ""}`}
                        onClick={handleOpenLibp2p}
                        title={[
                            `libp2p — ${libp2pMetrics.activeNodes}/${libp2pMetrics.totalNodes} node(s) running`,
                            `${libp2pMetrics.connectedPeers} connected peer(s)`,
                            libp2pMetrics.lastMessage
                                ? `${libp2pMetrics.newPubsubMessages} new pubsub message(s) — last on "${libp2pMetrics.lastMessage.topic}"`
                                : `${libp2pMetrics.newPubsubMessages} new pubsub message(s)`,
                        ].join(" · ")}
                    >
                        <Globe size={11} />
                        <span className="footer__metric-value">
                            {libp2pMetrics.activeNodes}
                            {libp2pMetrics.totalNodes > libp2pMetrics.activeNodes && (
                                <span className="footer__metric-total">/{libp2pMetrics.totalNodes}</span>
                            )}
                        </span>
                        <span className="footer__metric-sep" aria-hidden="true">·</span>
                        <Users size={11} />
                        <span className="footer__metric-value">{libp2pMetrics.connectedPeers}</span>
                        <span className="footer__metric-sep" aria-hidden="true">·</span>
                        <Radio size={11} />
                        <span className="footer__metric-value">{libp2pMetrics.newPubsubMessages}</span>
                        {libp2pMetrics.newPubsubMessages > 0 && (
                            <span className="footer__metric-pulse" aria-hidden="true" />
                        )}
                    </button>

                    <button
                        type="button"
                        className={`footer__metric footer__metric--helia${heliaMetrics.newEntries > 0 ? " footer__metric--alert" : ""}`}
                        onClick={handleOpenHelia}
                        title={[
                            `Helia (IPFS) — ${heliaMetrics.activeNodes}/${heliaMetrics.totalNodes} node(s) running`,
                            `${heliaMetrics.totalEntries} CID(s) tracked`,
                            `${heliaMetrics.pinnedCount} pinned`,
                        ].join(" · ")}
                    >
                        <Boxes size={11} />
                        <span className="footer__metric-value">
                            {heliaMetrics.activeNodes}
                            {heliaMetrics.totalNodes > heliaMetrics.activeNodes && (
                                <span className="footer__metric-total">/{heliaMetrics.totalNodes}</span>
                            )}
                        </span>
                        <span className="footer__metric-sep" aria-hidden="true">·</span>
                        <Pin size={11} />
                        <span className="footer__metric-value">{heliaMetrics.pinnedCount}</span>
                        {heliaMetrics.newEntries > 0 && (
                            <span className="footer__metric-pulse" aria-hidden="true" />
                        )}
                    </button>

                    <button
                        type="button"
                        className={`footer__metric footer__metric--kubo${kuboMetrics.newEntries > 0 ? " footer__metric--alert" : ""}`}
                        onClick={handleOpenKubo}
                        title={[
                            `Kubo (remote IPFS) — ${kuboMetrics.connectedNodes}/${kuboMetrics.totalNodes} node(s) connected`,
                            `${kuboMetrics.totalEntries} CID(s) tracked`,
                            `${kuboMetrics.pinnedCount} pinned`,
                        ].join(" · ")}
                    >
                        <Server size={11} />
                        <span className="footer__metric-value">
                            {kuboMetrics.connectedNodes}
                            {kuboMetrics.totalNodes > kuboMetrics.connectedNodes && (
                                <span className="footer__metric-total">/{kuboMetrics.totalNodes}</span>
                            )}
                        </span>
                        <span className="footer__metric-sep" aria-hidden="true">·</span>
                        <Pin size={11} />
                        <span className="footer__metric-value">{kuboMetrics.pinnedCount}</span>
                        {kuboMetrics.newEntries > 0 && (
                            <span className="footer__metric-pulse" aria-hidden="true" />
                        )}
                    </button>

                    <button
                        type="button"
                        className={`footer__metric footer__metric--orbitdb${orbitdbMetrics.newDbs > 0 ? " footer__metric--alert" : ""}`}
                        onClick={handleOpenOrbitdb}
                        title={[
                            `OrbitDB — ${orbitdbMetrics.activeNodes}/${orbitdbMetrics.totalNodes} node(s) running`,
                            `${orbitdbMetrics.openDbs}/${orbitdbMetrics.totalDbs} database(s) open`,
                            `${orbitdbMetrics.totalEntries} entr${orbitdbMetrics.totalEntries === 1 ? "y" : "ies"} tracked`,
                        ].join(" · ")}
                    >
                        <Database size={11} />
                        <span className="footer__metric-value">
                            {orbitdbMetrics.activeNodes}
                            {orbitdbMetrics.totalNodes > orbitdbMetrics.activeNodes && (
                                <span className="footer__metric-total">/{orbitdbMetrics.totalNodes}</span>
                            )}
                        </span>
                        <span className="footer__metric-sep" aria-hidden="true">·</span>
                        <Layers size={11} />
                        <span className="footer__metric-value">{orbitdbMetrics.openDbs}</span>
                        {orbitdbMetrics.newDbs > 0 && (
                            <span className="footer__metric-pulse" aria-hidden="true" />
                        )}
                    </button>

                    <button
                        type="button"
                        className={`footer__metric footer__metric--orbitdb-server${orbitdbServerMetrics.newDatabases > 0 ? " footer__metric--alert" : ""}`}
                        onClick={handleOpenOrbitdbServer}
                        title={[
                            `Lagrange — ${orbitdbServerMetrics.connectedNodes}/${orbitdbServerMetrics.totalNodes} node(s) connected`,
                            `${orbitdbServerMetrics.totalDatabases} database(s) tracked`,
                            `${orbitdbServerMetrics.swarmPeers} swarm peer(s)`,
                            orbitdbServerMetrics.privateNodes > 0
                                ? `${orbitdbServerMetrics.privateNodes} pnet-private node(s)`
                                : "no pnet nodes",
                        ].join(" · ")}
                    >
                        <HardDrive size={11} />
                        <span className="footer__metric-value">
                            {orbitdbServerMetrics.connectedNodes}
                            {orbitdbServerMetrics.totalNodes > orbitdbServerMetrics.connectedNodes && (
                                <span className="footer__metric-total">/{orbitdbServerMetrics.totalNodes}</span>
                            )}
                        </span>
                        <span className="footer__metric-sep" aria-hidden="true">·</span>
                        <Layers size={11} />
                        <span className="footer__metric-value">{orbitdbServerMetrics.totalDatabases}</span>
                        {orbitdbServerMetrics.newDatabases > 0 && (
                            <span className="footer__metric-pulse" aria-hidden="true" />
                        )}
                    </button>
                    </div>

                    <button
                        type="button"
                        className={`footer__metric footer__metric--orchestrator${orchestratorMetrics.pendingDrift > 0 ? " footer__metric--alert" : ""}`}
                        onClick={handleOpenOrchestrator}
                        title={[
                            `Orchestrator \u2014 ${orchestratorMetrics.healthyStacks}/${orchestratorMetrics.totalStacks} stack(s) healthy`,
                            orchestratorMetrics.driftedStacks > 0
                                ? `${orchestratorMetrics.driftedStacks} stack(s) drifted`
                                : "no drift",
                            orchestratorMetrics.activeManifestName
                                ? `Active manifest: ${orchestratorMetrics.activeManifestName}`
                                : "No manifest linked to active stack",
                        ].join(" \u00b7 ")}
                    >
                        <Workflow size={11} />
                        <span className="footer__metric-value">
                            {orchestratorMetrics.healthyStacks}
                            {orchestratorMetrics.totalStacks > orchestratorMetrics.healthyStacks && (
                                <span className="footer__metric-total">/{orchestratorMetrics.totalStacks}</span>
                            )}
                        </span>
                        {orchestratorMetrics.driftedStacks > 0 && (
                            <>
                                <span className="footer__metric-sep" aria-hidden="true">·</span>
                                <AlertTriangle size={11} />
                                <span className="footer__metric-value">{orchestratorMetrics.driftedStacks}</span>
                            </>
                        )}
                        {orchestratorMetrics.pendingDrift > 0 && (
                            <span className="footer__metric-pulse" aria-hidden="true" />
                        )}
                    </button>
                </div>

                <div className="footer__controls">

                    <button
                        onClick={() => toggle("jobs")}
                        className={`footer__toggle ${panel === "jobs" ? "footer__toggle--active" : ""}`}
                    >
                        <Terminal size={10} />
                        Actions
                        {jobs.filter(j => j.status === 'running' || j.status === 'queued').length > 0 && (
                            <span className={`footer__badge ${panel === "jobs" ? "footer__badge--active" : ""}`}>
                                {jobs.filter(j => j.status === 'running' || j.status === 'queued').length}
                            </span>
                        )}
                    </button>
                    <span className="footer__separator">│</span>

                    <button
                        onClick={() => toggle("artifacts")}
                        className={`footer__toggle ${panel === "artifacts" ? "footer__toggle--active footer__toggle--artifacts" : ""}`}
                    >
                        <Gem size={10} color="#818cf8" />
                        Artifacts
                        {allArtifacts.length > 0 && (
                            <span className={`footer__badge footer__badge--artifacts${panel === "artifacts" ? " footer__badge--artifacts-active" : ""}`}>
                                {allArtifacts.length}
                            </span>
                        )}
                    </button>
                    {!isOnline && (
                        <>
                            <span className="footer__separator">│</span>
                            <div className="footer__offline">
                                <WifiOff size={10} />
                                <span>Offline</span>
                            </div>
                        </>
                    )}

                    <span className="footer__separator">│</span>
                    <button
                        onClick={() => toggle("display")}
                        className={`footer__toggle ${panel === "display" ? "footer__toggle--active" : ""}`}
                        title="Display settings"
                    >
                        <Monitor size={10} />
                    </button>
                </div>
            </footer >
        </>
    );
}
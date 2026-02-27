import { useState, useEffect, useRef } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, ViewId, Job, JobArtifact } from "../../types";
import { MessageCircle, Zap, WifiOff, Terminal, Gem, Monitor } from "lucide-react";
import type { ChatPosition } from "../../context/ThemeContext";
import { ActionManager } from "../actions/ActionManager";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { LLMManager } from "./LLMManager";
import { DisplayPanel } from "./DisplayPanel";
import { useLLM, type LivenessStatus } from "../../context/LLMContext";
import "../../styles/components/footer.css";
import "../../styles/components/llm-manager.css";

// Update interface
interface FooterProps {
    agents: Agent[];
    channels: Channel[];
    groups: Group[];
    messages: Message[];
    ecosystems: Network[];
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

export function Footer({ agents, channels, groups, messages, ecosystems, bridges, ecosystem, addLog, setView, jobs, removeJob, clearJobs, addJob, allArtifacts, importArtifact, removeArtifact, updateArtifact, savedJobs, saveJob, deleteJob, view, panel, setPanel, chatPosition, sideChatVisible, toggleSideChat, ...jobsProps }: FooterProps) {
    const isSideChat = chatPosition === "left" || chatPosition === "right";
    const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
    const [isExpanded, setIsExpanded] = useState(false);
    const savedHeightRef = useRef(DEFAULT_PANEL_HEIGHT);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const llm = useLLM();

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

                    {isSideChat && (
                        <>
                            <span className="footer__separator">│</span>
                            <button
                                onClick={toggleSideChat}
                                className={`footer__toggle ${sideChatVisible ? "footer__toggle--active" : ""}`}
                                title={sideChatVisible ? "Hide chat" : "Show chat"}
                            >
                                <MessageCircle size={10} />
                                Chat
                            </button>
                        </>
                    )}
                </div>

                <div className="footer__controls">
                    {!isSideChat && (
                        <>
                            <button
                                onClick={() => toggle("chat")}
                                className={`footer__toggle ${panel === "chat" ? "footer__toggle--active" : ""}`}
                            >
                                <MessageCircle size={10} />
                                Chat
                            </button>
                            <span className="footer__separator">│</span>
                        </>
                    )}

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
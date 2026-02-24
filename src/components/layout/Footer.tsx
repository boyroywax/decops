import { useState, useEffect, useRef } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, ViewId, Job, JobArtifact } from "../../types";
import { Bot, ArrowLeftRight, Hexagon, MessageSquare, Globe, Network as NetworkIcon, MessageCircle, ListTodo, Zap, WifiOff, Terminal, Gem, Sun, Moon, Sunrise } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { ActionManager } from "../actions/ActionManager";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { LLMManager } from "./LLMManager";
import { useTheme } from "../../context/ThemeContext";
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
}

type PanelMode = "none" | "chat" | "jobs" | "artifacts" | "llm";

const DEFAULT_PANEL_HEIGHT = 420;

export function Footer({ agents, channels, groups, messages, ecosystems, bridges, ecosystem, addLog, setView, jobs, removeJob, clearJobs, addJob, allArtifacts, importArtifact, removeArtifact, updateArtifact, savedJobs, saveJob, deleteJob, ...jobsProps }: FooterProps) {
    const [panel, setPanel] = useState<PanelMode>("none");
    const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
    const [isExpanded, setIsExpanded] = useState(false);
    const savedHeightRef = useRef(DEFAULT_PANEL_HEIGHT);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const { theme, toggleTheme } = useTheme();
    const llm = useLLM();

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

    const toggle = (mode: PanelMode) => setPanel(prev => prev === mode ? "none" : mode);

    // Watch for external open requests (e.g. from ProfileModal → llm.openManager())
    useEffect(() => {
        if (llm.managerOpenRequest > 0) {
            setPanel("llm");
        }
    }, [llm.managerOpenRequest]);

    const workspaceContext = { agents, channels, groups, messages, ecosystems, bridges, addJob, jobs };

    return (
        <>
            {panel === "chat" && (
                <ChatPanel
                    context={workspaceContext}
                    ecosystem={ecosystem}
                    onClose={() => setPanel("none")}
                    addLog={addLog}
                    height={panelHeight}
                    setHeight={handleSetHeight}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                />
            )}

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

            <footer className="app-footer">
                <div className="footer__stats">
                    <button onClick={() => setView("agents")} className="footer__stat-btn" title="View Agents">
                        <Bot size={10} color="#00e5a0" /> {agents.length} {!jobsProps.isMobile && "agents"}
                    </button>
                    <button onClick={() => setView("channels")} className="footer__stat-btn" title="View Channels">
                        <ArrowLeftRight size={10} color="#a78bfa" /> {channels.length} {!jobsProps.isMobile && "ch"}
                    </button>
                    <button onClick={() => setView("groups")} className="footer__stat-btn" title="View Groups">
                        <Hexagon size={10} color="#f472b6" /> {groups.length} {!jobsProps.isMobile && "groups"}
                    </button>
                    <button onClick={() => setView("messages")} className="footer__stat-btn" title="View Messages">
                        <MessageSquare size={10} color="#fbbf24" /> {messages.length} {!jobsProps.isMobile && "msgs"}
                    </button>
                    {ecosystems.length > 0 && (
                        <button onClick={() => setView("ecosystem")} className="footer__stat-btn" title="View Ecosystems">
                            <Globe size={10} color="#38bdf8" /> {ecosystems.length} {!jobsProps.isMobile && "nets"}
                        </button>
                    )}
                    {bridges.length > 0 && (
                        <button onClick={() => setView("network")} className="footer__stat-btn" title="View Topology">
                            <NetworkIcon size={10} color="#fb923c" /> {bridges.length} {!jobsProps.isMobile && "bridges"}
                        </button>
                    )}
                </div>

                <div className="footer__controls">
                    <button
                        onClick={() => toggle("chat")}
                        className={`footer__toggle ${panel === "chat" ? "footer__toggle--active" : ""}`}
                    >
                        <MessageCircle size={10} />
                        Chat
                    </button>

                    <span className="footer__separator">│</span>

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
                    <button
                        onClick={toggleTheme}
                        className="footer__toggle"
                        title={theme === "dark" ? "Switch to light" : theme === "light" ? "Switch to solar" : "Switch to dark"}
                    >
                        {theme === "dark" ? <Sun size={10} /> : theme === "light" ? <Sunrise size={10} /> : <Moon size={10} />}
                        {!jobsProps.isMobile && (theme === "dark" ? "Light" : theme === "light" ? "Solar" : "Dark")}
                    </button>
                </div>
            </footer >
        </>
    );
}
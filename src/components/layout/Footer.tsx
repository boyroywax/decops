import { useState, useEffect } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, ViewId, Job } from "../../types";
import { Bot, ArrowLeftRight, Hexagon, MessageSquare, Globe, Network as NetworkIcon, MessageCircle, ListTodo, Zap, WifiOff, Terminal } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { ActionManager } from "../actions/ActionManager";

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

type PanelMode = "none" | "chat" | "jobs";

export function Footer({ agents, channels, groups, messages, ecosystems, bridges, ecosystem, addLog, setView, jobs, removeJob, clearJobs, addJob, savedJobs, saveJob, deleteJob, ...jobsProps }: FooterProps) {
    const [panel, setPanel] = useState<PanelMode>("none");
    const [isOnline, setIsOnline] = useState(navigator.onLine);

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

    const footerBtnStyle = {
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontFamily: "inherit",
        color: "#71717a",
        padding: "2px 4px",
        borderRadius: 4,
        transition: "all 0.1s",
    };

    const pulseStyle = `
      @keyframes softPulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 229, 160, 0.4); opacity: 1; }
        70% { box-shadow: 0 0 0 6px rgba(0, 229, 160, 0); opacity: 1; }
        100% { box-shadow: 0 0 0 0 rgba(0, 229, 160, 0); opacity: 1; }
      }
    `;

    const workspaceContext = { agents, channels, groups, messages, ecosystems, bridges, addJob, jobs };

    return (
        <>
            {panel === "chat" && (
                <ChatPanel
                    context={workspaceContext}
                    ecosystem={ecosystem}
                    onClose={() => setPanel("none")}
                    addLog={addLog}
                />
            )}

            {panel === "jobs" && (
                <ActionManager
                    onClose={() => setPanel("none")}
                    isMobile={jobsProps.isMobile}
                    savedJobs={savedJobs}
                    saveJob={saveJob}
                    deleteJob={deleteJob}
                />
            )}

            <footer style={{
                background: "rgba(0,229,160,0.04)",
                borderTop: "1px solid rgba(0,229,160,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 12px",
                fontSize: 10,
                fontFamily: "inherit",
                flexShrink: 0,
                gap: 8,
                flexWrap: "wrap",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => setView("agents")} style={footerBtnStyle} title="View Agents">
                        <Bot size={10} color="#00e5a0" /> {agents.length} {!jobsProps.isMobile && "agents"}
                    </button>
                    <button onClick={() => setView("channels")} style={footerBtnStyle} title="View Channels">
                        <ArrowLeftRight size={10} color="#a78bfa" /> {channels.length} {!jobsProps.isMobile && "ch"}
                    </button>
                    <button onClick={() => setView("groups")} style={footerBtnStyle} title="View Groups">
                        <Hexagon size={10} color="#f472b6" /> {groups.length} {!jobsProps.isMobile && "groups"}
                    </button>
                    <button onClick={() => setView("messages")} style={footerBtnStyle} title="View Messages">
                        <MessageSquare size={10} color="#fbbf24" /> {messages.length} {!jobsProps.isMobile && "msgs"}
                    </button>
                    {ecosystems.length > 0 && (
                        <button onClick={() => setView("ecosystem")} style={footerBtnStyle} title="View Ecosystems">
                            <Globe size={10} color="#38bdf8" /> {ecosystems.length} {!jobsProps.isMobile && "nets"}
                        </button>
                    )}
                    {bridges.length > 0 && (
                        <button onClick={() => setView("network")} style={footerBtnStyle} title="View Topology">
                            <NetworkIcon size={10} color="#fb923c" /> {bridges.length} {!jobsProps.isMobile && "bridges"}
                        </button>
                    )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                        onClick={() => toggle("chat")}
                        style={{
                            background: panel === "chat" ? "rgba(0,229,160,0.1)" : "none",
                            border: "none",
                            color: panel === "chat" ? "#00e5a0" : "#52525b",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "2px 6px",
                            borderRadius: 3,
                            transition: "all 0.15s",
                        }}
                    >
                        <MessageCircle size={10} />
                        Chat
                    </button>

                    <span style={{ color: "#27272a", fontSize: 10 }}>│</span>

                    <button
                        onClick={() => toggle("jobs")}
                        style={{
                            background: panel === "jobs" ? "rgba(0,229,160,0.1)" : "none",
                            border: "none",
                            color: panel === "jobs" ? "#00e5a0" : "#52525b",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "2px 6px",
                            borderRadius: 3,
                            transition: "all 0.15s",
                        }}
                    >
                        <Terminal size={10} />
                        Actions
                        {jobs.filter(j => j.status === 'running' || j.status === 'queued').length > 0 && (
                            <span style={{
                                fontSize: 9,
                                background: panel === "jobs" ? "rgba(0,229,160,0.15)" : "rgba(255,255,255,0.06)",
                                padding: "0 5px",
                                borderRadius: 6,
                                color: panel === "jobs" ? "#00e5a0" : "#71717a",
                            }}>{jobs.filter(j => j.status === 'running' || j.status === 'queued').length}</span>
                        )}
                    </button>
                    {!isOnline && (
                        <>
                            <span style={{ color: "#27272a", fontSize: 10 }}>│</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#ef4444", fontSize: 10 }}>
                                <WifiOff size={10} />
                                <span>Offline</span>
                            </div>
                        </>
                    )}
                </div>
                <style>{pulseStyle}</style>
            </footer >
        </>
    );
}

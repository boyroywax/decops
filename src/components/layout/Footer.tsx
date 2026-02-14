import { useState, useRef, useEffect } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, LogEntry, ViewId } from "../../types";
import { ChatPanel } from "./ChatPanel";

interface FooterProps {
    agents: Agent[];
    channels: Channel[];
    groups: Group[];
    messages: Message[];
    ecosystems: Network[];
    bridges: Bridge[];
    log: LogEntry[];
    addLog?: (msg: string) => void;
    setView: (view: ViewId) => void;
}

type PanelMode = "none" | "activity" | "chat";

export function Footer({ agents, channels, groups, messages, ecosystems, bridges, log, addLog, setView }: FooterProps) {
    const [panel, setPanel] = useState<PanelMode>("none");
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (panel === "activity" && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [panel, log.length]);

    const toggle = (mode: PanelMode) => setPanel(prev => prev === mode ? "none" : mode);

    // Shared button style for footer items
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

    const workspaceContext = { agents, channels, groups, messages, ecosystems, bridges };

    return (
        <>
            {/* Expandable activity log panel */}
            {panel === "activity" && (
                <div style={{
                    height: 180,
                    background: "rgba(0,0,0,0.6)",
                    borderTop: "1px solid rgba(0,229,160,0.12)",
                    overflow: "auto",
                    padding: "8px 16px",
                    fontFamily: "inherit",
                    backdropFilter: "blur(8px)",
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.1em" }}>ACTIVITY LOG</span>
                        <button
                            onClick={() => setPanel("none")}
                            style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 }}
                            title="Close log"
                        >✕</button>
                    </div>
                    {log.length === 0 && <div style={{ fontSize: 10, color: "#3f3f46" }}>No activity yet</div>}
                    {log.map((l, i) => (
                        <div key={l.ts + "-" + i} style={{ fontSize: 10, color: "#71717a", marginBottom: 4, lineHeight: 1.5 }}>
                            <span style={{ color: "#00e5a0", opacity: 0.5 }}>▸</span>{" "}
                            <span style={{ color: "#52525b", fontSize: 9 }}>{new Date(l.ts).toLocaleTimeString()}</span>{" "}
                            {l.msg}
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            )}

            {/* Expandable chat panel */}
            {panel === "chat" && (
                <ChatPanel
                    context={workspaceContext}
                    onClose={() => setPanel("none")}
                    addLog={addLog}
                />
            )}

            {/* Status bar */}
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
                {/* Left: entity counts */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => setView("agents")} style={footerBtnStyle} title="View Agents">
                        <span style={{ color: "#00e5a0" }}>◉</span> {agents.length} agents
                    </button>
                    <button onClick={() => setView("channels")} style={footerBtnStyle} title="View Channels">
                        <span style={{ color: "#a78bfa" }}>⟷</span> {channels.length} ch
                    </button>
                    <button onClick={() => setView("groups")} style={footerBtnStyle} title="View Groups">
                        <span style={{ color: "#f472b6" }}>⬡</span> {groups.length} groups
                    </button>
                    <button onClick={() => setView("messages")} style={footerBtnStyle} title="View Messages">
                        <span style={{ color: "#fbbf24" }}>◆</span> {messages.length} msgs
                    </button>
                    {ecosystems.length > 0 && (
                        <button onClick={() => setView("ecosystem")} style={footerBtnStyle} title="View Ecosystems">
                            <span style={{ color: "#38bdf8" }}>◎</span> {ecosystems.length} nets
                        </button>
                    )}
                    {bridges.length > 0 && (
                        <button onClick={() => setView("network")} style={footerBtnStyle} title="View Topology">
                            <span style={{ color: "#fb923c" }}>⟷</span> {bridges.length} bridges
                        </button>
                    )}
                </div>

                {/* Right: toggles */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {/* Chat toggle */}
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
                        <span style={{ fontSize: 10 }}>◇</span>
                        Chat
                    </button>

                    {/* Divider */}
                    <span style={{ color: "#27272a", fontSize: 10 }}>│</span>

                    {/* Activity toggle */}
                    <button
                        onClick={() => toggle("activity")}
                        style={{
                            background: panel === "activity" ? "rgba(0,229,160,0.1)" : "none",
                            border: "none",
                            color: panel === "activity" ? "#00e5a0" : "#52525b",
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
                        <span style={{
                            display: "inline-block",
                            transition: "transform 0.2s",
                            transform: panel === "activity" ? "rotate(180deg)" : "rotate(0deg)",
                            fontSize: 8,
                        }}>▲</span>
                        Activity
                        {log.length > 0 && (
                            <span style={{
                                fontSize: 9,
                                background: panel === "activity" ? "rgba(0,229,160,0.15)" : "rgba(255,255,255,0.06)",
                                padding: "0 5px",
                                borderRadius: 6,
                                color: panel === "activity" ? "#00e5a0" : "#71717a",
                            }}>{log.length}</span>
                        )}
                    </button>
                </div>
            </footer>
        </>
    );
}

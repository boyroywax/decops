import { useState, useRef, useEffect } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, LogEntry } from "../../types";

interface FooterProps {
    agents: Agent[];
    channels: Channel[];
    groups: Group[];
    messages: Message[];
    ecosystems: Network[];
    bridges: Bridge[];
    log: LogEntry[];
}

export function Footer({ agents, channels, groups, messages, ecosystems, bridges, log }: FooterProps) {
    const [logOpen, setLogOpen] = useState(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logOpen && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logOpen, log.length]);

    return (
        <>
            {/* Expandable log panel */}
            {logOpen && (
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
                            onClick={() => setLogOpen(false)}
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

            {/* Status bar */}
            <footer style={{
                height: 26,
                background: "rgba(0,229,160,0.04)",
                borderTop: "1px solid rgba(0,229,160,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 12px",
                fontSize: 10,
                fontFamily: "inherit",
                flexShrink: 0,
                gap: 8,
            }}>
                {/* Left: entity counts */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#71717a" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#00e5a0" }}>◉</span> {agents.length} agents
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#a78bfa" }}>⟷</span> {channels.length} ch
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#f472b6" }}>⬡</span> {groups.length} groups
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#fbbf24" }}>◆</span> {messages.length} msgs
                    </span>
                    {ecosystems.length > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color: "#38bdf8" }}>◎</span> {ecosystems.length} nets
                        </span>
                    )}
                    {bridges.length > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color: "#fb923c" }}>⟷</span> {bridges.length} bridges
                        </span>
                    )}
                </div>

                {/* Right: log toggle */}
                <button
                    onClick={() => setLogOpen(!logOpen)}
                    style={{
                        background: logOpen ? "rgba(0,229,160,0.1)" : "none",
                        border: "none",
                        color: logOpen ? "#00e5a0" : "#52525b",
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
                        transform: logOpen ? "rotate(180deg)" : "rotate(0deg)",
                        fontSize: 8,
                    }}>▲</span>
                    Activity
                    {log.length > 0 && (
                        <span style={{
                            fontSize: 9,
                            background: logOpen ? "rgba(0,229,160,0.15)" : "rgba(255,255,255,0.06)",
                            padding: "0 5px",
                            borderRadius: 6,
                            color: logOpen ? "#00e5a0" : "#71717a",
                        }}>{log.length}</span>
                    )}
                </button>
            </footer>
        </>
    );
}

/**
 * Libp2pBotPanel — UI surface for the libp2p sub-agent.
 *
 * Shows the bot's status, recent operations, network snapshot, and
 * configuration. Mirrors the StudioBotPanel pattern. Rendered in the
 * ToolKits view under the libp2p toolkit's Agents section.
 */

import { useEffect, useState } from "react";
import {
    Bot, Activity, Zap, AlertTriangle, CheckCircle2,
    Settings, ChevronDown, ChevronUp, Clock, Terminal,
    Globe, Users, Radio, ShieldCheck, Power,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import {
    getLibp2pBotStatus,
    getLibp2pBotConfig,
    updateLibp2pBotConfig,
    getLibp2pBotLog,
} from "@/toolkits/libp2p/libp2pBot";
import { libp2pService } from "@/toolkits/libp2p/service";
import type { Libp2pBotResponse, Libp2pBotConfig } from "@/toolkits/libp2p/types/libp2pBot";
import type { ManagerSnapshot } from "@/toolkits/libp2p/service";
import "../styles/libp2p-bot.css";

export interface Libp2pBotPanelProps {
    /** When true, hides redundant header/description/recent-activity (used inside the modal). */
    compact?: boolean;
}

export function Libp2pBotPanel({ compact = false }: Libp2pBotPanelProps = {}) {
    const [status, setStatus] = useState(() => getLibp2pBotStatus());
    const [snap, setSnap] = useState<ManagerSnapshot>(() => libp2pService.snapshot());
    const [config, setConfig] = useState<Libp2pBotConfig>(() => getLibp2pBotConfig());
    const [configOpen, setConfigOpen] = useState(false);
    const [recentLog, setRecentLog] = useState<Libp2pBotResponse[]>(() => getLibp2pBotLog().slice(-5));

    // Keep snapshot + bot status in sync.
    useEffect(() => {
        const unsub = libp2pService.subscribe((s) => setSnap(s));
        const interval = setInterval(() => {
            setStatus(getLibp2pBotStatus());
            setRecentLog(getLibp2pBotLog().slice(-5));
        }, 1000);
        return () => { unsub(); clearInterval(interval); };
    }, []);

    const toggleConfig = (key: keyof Libp2pBotConfig) => {
        if (typeof config[key] !== "boolean") return;
        const patch = { [key]: !config[key] } as Partial<Libp2pBotConfig>;
        updateLibp2pBotConfig(patch);
        setConfig((prev) => ({ ...prev, ...patch }));
    };

    const setMaxRounds = (n: number) => {
        const clamped = Math.max(1, Math.min(32, Math.floor(n) || 1));
        updateLibp2pBotConfig({ maxRounds: clamped });
        setConfig((prev) => ({ ...prev, maxRounds: clamped }));
    };

    const statusColor = ({
        idle: "#6b7280",
        planning: "#fbbf24",
        executing: "#38bdf8",
        reviewing: "#a78bfa",
        error: "#ef4444",
    } as Record<string, string>)[status] || "#6b7280";

    const statusLabel = ({
        idle: "Idle",
        planning: "Planning…",
        executing: "Executing…",
        reviewing: "Reviewing…",
        error: "Error",
    } as Record<string, string>)[status] || "Unknown";

    const totals = snap.nodes.reduce(
        (acc, n) => {
            acc.peers += n.peers.length;
            acc.connected += n.peers.filter((p) => p.connected).length;
            acc.topics += n.topics.length;
            acc.pubsubMessages += n.pubsubMessageCount;
            if (n.status === "running") acc.running += 1;
            return acc;
        },
        { peers: 0, connected: 0, topics: 0, pubsubMessages: 0, running: 0 },
    );
    const active = snap.nodes.find((n) => n.nodeId === snap.activeId);

    return (
        <div className={`libp2p-bot${compact ? " libp2p-bot--compact" : ""}`}>
            {/* ── Header ── */}
            {!compact && (
            <div className="libp2p-bot__header">
                <div className="libp2p-bot__header-left">
                    <GradientIcon icon={Bot} size={18} gradient={["#38bdf8", "#a78bfa"]} />
                    <div>
                        <h4 className="libp2p-bot__title">libp2p Bot</h4>
                        <span className="libp2p-bot__subtitle">Peer-to-peer networking sub-agent</span>
                    </div>
                </div>
                <div className="libp2p-bot__header-right">
                    <span className="libp2p-bot__status" style={{ color: statusColor }}>
                        <Activity size={10} />
                        {statusLabel}
                    </span>
                </div>
            </div>
            )}

            {/* ── Description ── */}
            {!compact && (
            <p className="libp2p-bot__desc">
                Specialized sub-agent that drives the libp2p toolkit on your behalf.
                When the AI chat detects networking requests (start/stop, dial, pubsub,
                identity, vault), it delegates here so commands are scoped to the libp2p
                tool surface only.
            </p>
            )}

            {/* Compact status pill (modal mode) */}
            {compact && (
                <div className="libp2p-bot__compact-status">
                    <span className="libp2p-bot__status" style={{ color: statusColor }}>
                        <Activity size={10} />
                        {statusLabel}
                    </span>
                </div>
            )}

            {/* ── Network snapshot ── */}
            <div className="libp2p-bot__network">
                <div className="libp2p-bot__stat">
                    <Power size={11} />
                    <span className="libp2p-bot__stat-value">
                        {totals.running}<span className="libp2p-bot__stat-total">/{snap.nodes.length}</span>
                    </span>
                    <span className="libp2p-bot__stat-label">Running</span>
                </div>
                <div className="libp2p-bot__stat">
                    <Users size={11} />
                    <span className="libp2p-bot__stat-value">
                        {totals.connected}<span className="libp2p-bot__stat-total">/{totals.peers}</span>
                    </span>
                    <span className="libp2p-bot__stat-label">Peers</span>
                </div>
                <div className="libp2p-bot__stat">
                    <Radio size={11} />
                    <span className="libp2p-bot__stat-value">{totals.topics}</span>
                    <span className="libp2p-bot__stat-label">Topics</span>
                </div>
                <div className="libp2p-bot__stat">
                    <Globe size={11} />
                    <span className="libp2p-bot__stat-value">{totals.pubsubMessages}</span>
                    <span className="libp2p-bot__stat-label">Pubsub</span>
                </div>
            </div>

            {active && (
                <div className="libp2p-bot__active-node">
                    <span className="libp2p-bot__active-label">Active node</span>
                    <span className="libp2p-bot__active-name">{active.label}</span>
                    <span className={`libp2p-bot__active-status libp2p-bot__active-status--${active.status}`}>
                        {active.status}
                    </span>
                    {active.peerId && (
                        <code className="libp2p-bot__active-peer" title={active.peerId}>
                            {active.peerId.slice(0, 14)}…{active.peerId.slice(-6)}
                        </code>
                    )}
                </div>
            )}

            {/* ── Recent Activity ── */}
            {!compact && recentLog.length > 0 && (
                <div className="libp2p-bot__log">
                    <h5 className="libp2p-bot__section-title">
                        <Clock size={12} /> Recent Activity
                    </h5>
                    {recentLog.map((entry, i) => (
                        <div key={i} className={`libp2p-bot__log-entry ${entry.success ? "" : "libp2p-bot__log-entry--error"}`}>
                            <div className="libp2p-bot__log-header">
                                {entry.success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                                <span className="libp2p-bot__log-summary">
                                    {entry.summary.slice(0, 80)}{entry.summary.length > 80 ? "…" : ""}
                                </span>
                                <span className="libp2p-bot__log-time">{entry.duration_ms}ms</span>
                            </div>
                            {entry.operations.length > 0 && (
                                <div className="libp2p-bot__log-ops">
                                    {entry.operations.slice(0, 3).map((op, j) => (
                                        <span key={j} className="libp2p-bot__log-op">
                                            <Terminal size={9} /> {op.command}
                                        </span>
                                    ))}
                                    {entry.operations.length > 3 && (
                                        <span className="libp2p-bot__log-more">+{entry.operations.length - 3} more</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Configuration ── */}
            <div className="libp2p-bot__config">
                <button
                    className="libp2p-bot__config-toggle"
                    onClick={() => setConfigOpen((prev) => !prev)}
                >
                    <Settings size={12} />
                    <span>Configuration</span>
                    {configOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {configOpen && (
                    <div className="libp2p-bot__config-body">
                        <label className="libp2p-bot__config-item">
                            <input
                                type="checkbox"
                                checked={config.autoStartIfStopped}
                                onChange={() => toggleConfig("autoStartIfStopped")}
                            />
                            <span>Auto-start node if stopped</span>
                        </label>
                        <label className="libp2p-bot__config-item">
                            <input
                                type="checkbox"
                                checked={config.protectIdentities}
                                onChange={() => toggleConfig("protectIdentities")}
                            />
                            <span>Protect identities (block agent-initiated exports)</span>
                        </label>
                        <label className="libp2p-bot__config-item">
                            <span>Max tool-use rounds</span>
                            <input
                                type="number"
                                min={1}
                                max={32}
                                className="libp2p-bot__config-num"
                                value={config.maxRounds}
                                onChange={(e) => setMaxRounds(Number(e.target.value))}
                            />
                        </label>
                    </div>
                )}
            </div>

            {/* ── Capabilities ── */}
            <div className="libp2p-bot__capabilities">
                <h5 className="libp2p-bot__section-title">
                    <Zap size={12} /> Capabilities
                </h5>
                <div className="libp2p-bot__cap-list">
                    <div className="libp2p-bot__cap"><Power size={11} /><span>Start / stop nodes with custom services & transports</span></div>
                    <div className="libp2p-bot__cap"><Users size={11} /><span>Dial, ping, hang up peers; manage the contact book</span></div>
                    <div className="libp2p-bot__cap"><Radio size={11} /><span>Subscribe & publish to gossipsub topics</span></div>
                    <div className="libp2p-bot__cap"><ShieldCheck size={11} /><span>Generate, import, vault &amp; rotate identities</span></div>
                </div>
            </div>
        </div>
    );
}

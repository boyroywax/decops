/**
 * ArchitectBotPanel — UI component for the Architect Bot sub-agent.
 *
 * Displays in the ToolKits view when the "Networks & Ecosystem" toolkit is expanded,
 * and in the ToolkitDetailView agents section.
 * Shows bot status, ecosystem stats, topology analysis, and configuration.
 */

import { useState, useCallback, useMemo } from "react";
import {
    Bot, Activity, Zap, Globe, Network, AlertTriangle, CheckCircle2,
    Sparkles, Settings, ChevronDown, ChevronUp,
    Map, GitBranch, Users, Link2, Play,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useEcosystemStore } from "@/stores/ecosystemStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { NavContext, ViewId } from "@/types";
import "../styles/architect-bot.css";

interface ArchitectBotPanelProps {
    /** Navigate to a view. When provided, action buttons become active. */
    navigateTo?: (view: ViewId, ctx: NavContext) => void;
}

export function ArchitectBotPanel({ navigateTo }: ArchitectBotPanelProps) {
    const ecosystem = useEcosystemStore((s) => s.ecosystem);
    const activeNetworkId = useEcosystemStore((s) => s.activeNetworkId);
    const agents = useWorkspaceStore((s) => s.agents);
    const channels = useWorkspaceStore((s) => s.channels);
    const groups = useWorkspaceStore((s) => s.groups);

    const [configOpen, setConfigOpen] = useState(false);
    const [showStats, setShowStats] = useState(false);

    const networks = ecosystem.networks;
    const bridges = ecosystem.bridges;

    // Compute ecosystem-level stats
    const stats = useMemo(() => {
        const activeNet = activeNetworkId
            ? networks.find((n) => n.id === activeNetworkId)
            : null;
        const netAgents = activeNetworkId
            ? agents.filter((a) => a.networkId === activeNetworkId)
            : agents;
        const netChannels = activeNetworkId
            ? channels.filter((c) => c.networkId === activeNetworkId)
            : channels;
        const netGroups = activeNetworkId
            ? groups.filter((g) => g.networkId === activeNetworkId)
            : groups;

        return {
            networkCount: networks.length,
            bridgeCount: bridges.length,
            agentCount: netAgents.length,
            channelCount: netChannels.length,
            groupCount: netGroups.length,
            activeNetwork: activeNet?.name || null,
        };
    }, [networks, bridges, agents, channels, groups, activeNetworkId]);

    // Simple topology health check
    const issues = useMemo(() => {
        const problems: { severity: "warning" | "error"; message: string }[] = [];

        if (stats.networkCount === 0) {
            problems.push({ severity: "warning", message: "No networks deployed yet" });
        }
        if (stats.agentCount > 0 && stats.channelCount === 0) {
            problems.push({ severity: "warning", message: "Agents exist but no channels — agents cannot communicate" });
        }
        if (stats.networkCount >= 2 && stats.bridgeCount === 0) {
            problems.push({ severity: "warning", message: "Multiple networks but no bridges — networks are isolated" });
        }
        // Check for orphan agents (no channels)
        const connectedAgentIds = new Set<string>();
        channels.forEach((ch) => {
            if (ch.from) connectedAgentIds.add(ch.from);
            if (ch.to) connectedAgentIds.add(ch.to);
        });
        const orphanCount = agents.filter((a) => !connectedAgentIds.has(a.id)).length;
        if (orphanCount > 0 && agents.length > 1) {
            problems.push({ severity: "warning", message: `${orphanCount} agent${orphanCount !== 1 ? "s" : ""} with no channel connections` });
        }

        if (problems.length === 0 && stats.networkCount > 0) {
            // All good
        }

        return problems;
    }, [stats, agents, channels]);

    const handleDesignNetwork = useCallback(() => {
        if (navigateTo) navigateTo("architect", {});
    }, [navigateTo]);

    const handleViewTopology = useCallback(() => {
        if (navigateTo) navigateTo("networks", {});
    }, [navigateTo]);

    const statusLabel = stats.networkCount === 0 ? "Ready" : "Active";
    const statusColor = stats.networkCount === 0 ? "#6b7280" : "#22c55e";

    return (
        <div className="architect-bot">
            {/* ── Header ── */}
            <div className="architect-bot__header">
                <div className="architect-bot__header-left">
                    <GradientIcon icon={Bot} size={18} gradient={["#38bdf8", "#60a5fa"]} />
                    <div>
                        <h4 className="architect-bot__title">Architect Bot</h4>
                        <span className="architect-bot__subtitle">Network Design Sub-Agent</span>
                    </div>
                </div>
                <div className="architect-bot__header-right">
                    <span className="architect-bot__status" style={{ color: statusColor }}>
                        <Activity size={10} />
                        {statusLabel}
                    </span>
                </div>
            </div>

            {/* ── Description ── */}
            <p className="architect-bot__desc">
                AI-powered network designer that generates complete mesh topologies from
                natural language descriptions. Handles agent provisioning, channel wiring,
                group formation, bridge layout, and full deployment.
            </p>

            {/* ── Quick Actions ── */}
            <div className="architect-bot__actions">
                <button
                    className="architect-bot__action-btn"
                    onClick={handleViewTopology}
                    disabled={!navigateTo}
                    title="View network topology"
                 aria-label="View network topology">
                    <Map size={13} />
                    View Topology
                </button>
                <button
                    className="architect-bot__action-btn architect-bot__action-btn--primary"
                    onClick={handleDesignNetwork}
                    disabled={!navigateTo}
                    title="Open the Architect to design a new network"
                 aria-label="Open the Architect to design a new network">
                    <Sparkles size={13} />
                    Design Network
                </button>
            </div>

            {/* ── Ecosystem Stats ── */}
            <div className="architect-bot__stats-section">
                <button
                    className="architect-bot__stats-toggle"
                    onClick={() => setShowStats((p) => !p)}
                >
                    <Globe size={12} />
                    <span>Ecosystem Overview</span>
                    {showStats ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showStats && (
                    <div className="architect-bot__stats-body">
                        <div className="architect-bot__stats-grid">
                            <div className="architect-bot__stat">
                                <span className="architect-bot__stat-value">{stats.networkCount}</span>
                                <span className="architect-bot__stat-label">Networks</span>
                            </div>
                            <div className="architect-bot__stat">
                                <span className="architect-bot__stat-value">{stats.bridgeCount}</span>
                                <span className="architect-bot__stat-label">Bridges</span>
                            </div>
                            <div className="architect-bot__stat">
                                <span className="architect-bot__stat-value">{stats.agentCount}</span>
                                <span className="architect-bot__stat-label">Agents</span>
                            </div>
                            <div className="architect-bot__stat">
                                <span className="architect-bot__stat-value">{stats.channelCount}</span>
                                <span className="architect-bot__stat-label">Channels</span>
                            </div>
                            <div className="architect-bot__stat">
                                <span className="architect-bot__stat-value">{stats.groupCount}</span>
                                <span className="architect-bot__stat-label">Groups</span>
                            </div>
                        </div>
                        {stats.activeNetwork && (
                            <div className="architect-bot__active-net">
                                <Network size={10} />
                                <span>Active: <strong>{stats.activeNetwork}</strong></span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Topology Issues ── */}
            {issues.length > 0 && (
                <div className="architect-bot__issues">
                    {issues.map((issue, i) => (
                        <div key={i} className={`architect-bot__issue architect-bot__issue--${issue.severity}`}>
                            <AlertTriangle size={11} />
                            <span>{issue.message}</span>
                        </div>
                    ))}
                </div>
            )}
            {issues.length === 0 && stats.networkCount > 0 && (
                <div className="architect-bot__issues-ok">
                    <CheckCircle2 size={12} />
                    <span>Topology is healthy</span>
                </div>
            )}

            {/* ── Configuration ── */}
            <div className="architect-bot__config">
                <button
                    className="architect-bot__config-toggle"
                    onClick={() => setConfigOpen((prev) => !prev)}
                >
                    <Settings size={12} />
                    <span>Configuration</span>
                    {configOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {configOpen && (
                    <div className="architect-bot__config-body">
                        <label className="architect-bot__config-item">
                            <input type="checkbox" defaultChecked />
                            <span>Auto-generate DIDs for new entities</span>
                        </label>
                        <label className="architect-bot__config-item">
                            <input type="checkbox" defaultChecked />
                            <span>Create channels between co-grouped agents</span>
                        </label>
                        <label className="architect-bot__config-item">
                            <input type="checkbox" defaultChecked={false} />
                            <span>Auto-deploy after generation</span>
                        </label>
                    </div>
                )}
            </div>

            {/* ── Capabilities ── */}
            <div className="architect-bot__capabilities">
                <h5 className="architect-bot__section-title">
                    <Zap size={12} />
                    Capabilities
                </h5>
                <div className="architect-bot__cap-list">
                    <div className="architect-bot__cap">
                        <Sparkles size={11} />
                        <span>Generate mesh topologies from natural language</span>
                    </div>
                    <div className="architect-bot__cap">
                        <Users size={11} />
                        <span>Multi-agent provisioning with roles & prompts</span>
                    </div>
                    <div className="architect-bot__cap">
                        <Link2 size={11} />
                        <span>Cross-network bridge design</span>
                    </div>
                    <div className="architect-bot__cap">
                        <GitBranch size={11} />
                        <span>Optimized channel & group topology</span>
                    </div>
                    <div className="architect-bot__cap">
                        <Play size={11} />
                        <span>Full deployment to workspace</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

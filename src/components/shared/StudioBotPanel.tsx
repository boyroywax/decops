/**
 * StudioBotPanel — UI component for the Studio Bot sub-agent.
 *
 * Displays in the ToolKits view when the "Studio Bot" toolkit is expanded.
 * Shows bot status, recent operations, layout analysis, and configuration.
 */

import { useState, useCallback } from "react";
import {
    Bot, Activity, Zap, Layout, AlertTriangle, CheckCircle2,
    Play, RefreshCw, Settings, ChevronDown, ChevronUp,
    Clock, Terminal, Eye, Layers,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useStudioContext } from "@/context/StudioContext";
import {
    getStudioBotStatus,
    getStudioBotConfig,
    updateStudioBotConfig,
    analyzeLayout,
    getStudioBotLog,
} from "@/services/studioBot";
import type { LayoutAnalysis, StudioBotResponse } from "@/types/studioBot";
import "../../styles/components/studio-bot.css";

export function StudioBotPanel() {
    const { api: studioApi } = useStudioContext();
    const [status] = useState(() => getStudioBotStatus());
    const [analysis, setAnalysis] = useState<LayoutAnalysis | null>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const [config, setConfig] = useState(() => getStudioBotConfig());
    const [recentLog] = useState<StudioBotResponse[]>(() => getStudioBotLog().slice(-5));

    const handleAnalyze = useCallback(() => {
        if (!studioApi) return;
        const result = analyzeLayout(studioApi);
        setAnalysis(result);
    }, [studioApi]);

    const handleAutoLayout = useCallback(() => {
        if (!studioApi) return;
        studioApi.autoLayout();
        // Re-analyze after layout
        const result = analyzeLayout(studioApi);
        setAnalysis(result);
    }, [studioApi]);

    const toggleConfig = useCallback((key: keyof typeof config) => {
        const newVal = !config[key];
        const patch = { [key]: newVal };
        updateStudioBotConfig(patch);
        setConfig(prev => ({ ...prev, ...patch }));
    }, [config]);

    const statusColor = {
        idle: "#6b7280",
        planning: "#fbbf24",
        building: "#3b82f6",
        reviewing: "#8b5cf6",
        error: "#ef4444",
    }[status] || "#6b7280";

    const statusLabel = {
        idle: "Idle",
        planning: "Planning…",
        building: "Building…",
        reviewing: "Reviewing…",
        error: "Error",
    }[status] || "Unknown";

    return (
        <div className="studio-bot">
            {/* ── Header ── */}
            <div className="studio-bot__header">
                <div className="studio-bot__header-left">
                    <GradientIcon icon={Bot} size={18} gradient={["#8b5cf6", "#6366f1"]} />
                    <div>
                        <h4 className="studio-bot__title">Studio Bot</h4>
                        <span className="studio-bot__subtitle">Canvas & Job Expert Sub-Agent</span>
                    </div>
                </div>
                <div className="studio-bot__header-right">
                    <span className="studio-bot__status" style={{ color: statusColor }}>
                        <Activity size={10} />
                        {statusLabel}
                    </span>
                </div>
            </div>

            {/* ── Description ── */}
            <p className="studio-bot__desc">
                Specialized sub-agent that automatically handles Studio canvas operations.
                When the AI chat detects job-building requests, it delegates to this bot for
                expert layout, data flow wiring, and workflow design.
            </p>

            {/* ── Quick Actions ── */}
            <div className="studio-bot__actions">
                <button
                    className="studio-bot__action-btn"
                    onClick={handleAnalyze}
                    disabled={!studioApi}
                    title={!studioApi ? "Open Studio tab first" : "Analyze canvas layout"}
                >
                    <Eye size={13} />
                    Analyze Layout
                </button>
                <button
                    className="studio-bot__action-btn studio-bot__action-btn--primary"
                    onClick={handleAutoLayout}
                    disabled={!studioApi}
                    title={!studioApi ? "Open Studio tab first" : "Fix layout issues"}
                >
                    <Layout size={13} />
                    Auto-Layout
                </button>
            </div>

            {/* ── Layout Analysis Results ── */}
            {analysis && (
                <div className="studio-bot__analysis">
                    <h5 className="studio-bot__section-title">
                        <Layers size={12} />
                        Canvas Analysis
                    </h5>
                    <div className="studio-bot__analysis-grid">
                        <div className="studio-bot__stat">
                            <span className="studio-bot__stat-value">{analysis.stepCount}</span>
                            <span className="studio-bot__stat-label">Steps</span>
                        </div>
                        <div className="studio-bot__stat">
                            <span className="studio-bot__stat-value">{analysis.groupCount}</span>
                            <span className="studio-bot__stat-label">Groups</span>
                        </div>
                        <div className="studio-bot__stat">
                            <span className="studio-bot__stat-value">{analysis.serialChainLength}</span>
                            <span className="studio-bot__stat-label">Chain Depth</span>
                        </div>
                        <div className="studio-bot__stat">
                            <span className="studio-bot__stat-value">{analysis.maxParallelWidth}</span>
                            <span className="studio-bot__stat-label">Max Parallel</span>
                        </div>
                    </div>
                    {analysis.issues.length > 0 ? (
                        <div className="studio-bot__issues">
                            {analysis.issues.map((issue, i) => (
                                <div key={i} className={`studio-bot__issue studio-bot__issue--${issue.severity}`}>
                                    <AlertTriangle size={11} />
                                    <span>{issue.message}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="studio-bot__issues-ok">
                            <CheckCircle2 size={12} />
                            <span>No layout issues detected</span>
                        </div>
                    )}
                    <div className="studio-bot__canvas-size">
                        Canvas: {analysis.canvasExtent.width}×{analysis.canvasExtent.height}px
                    </div>
                </div>
            )}

            {/* ── Recent Activity ── */}
            {recentLog.length > 0 && (
                <div className="studio-bot__log">
                    <h5 className="studio-bot__section-title">
                        <Clock size={12} />
                        Recent Activity
                    </h5>
                    {recentLog.map((entry, i) => (
                        <div key={i} className={`studio-bot__log-entry ${entry.success ? '' : 'studio-bot__log-entry--error'}`}>
                            <div className="studio-bot__log-header">
                                {entry.success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                                <span className="studio-bot__log-summary">
                                    {entry.summary.slice(0, 80)}{entry.summary.length > 80 ? "…" : ""}
                                </span>
                                <span className="studio-bot__log-time">{entry.duration_ms}ms</span>
                            </div>
                            {entry.operations.length > 0 && (
                                <div className="studio-bot__log-ops">
                                    {entry.operations.slice(0, 3).map((op, j) => (
                                        <span key={j} className="studio-bot__log-op">
                                            <Terminal size={9} /> {op.command}
                                        </span>
                                    ))}
                                    {entry.operations.length > 3 && (
                                        <span className="studio-bot__log-more">+{entry.operations.length - 3} more</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Configuration ── */}
            <div className="studio-bot__config">
                <button
                    className="studio-bot__config-toggle"
                    onClick={() => setConfigOpen(prev => !prev)}
                >
                    <Settings size={12} />
                    <span>Configuration</span>
                    {configOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {configOpen && (
                    <div className="studio-bot__config-body">
                        <label className="studio-bot__config-item">
                            <input
                                type="checkbox"
                                checked={config.autoLayout}
                                onChange={() => toggleConfig("autoLayout")}
                            />
                            <span>Auto-layout after job creation</span>
                        </label>
                        <label className="studio-bot__config-item">
                            <input
                                type="checkbox"
                                checked={config.validateBeforeSave}
                                onChange={() => toggleConfig("validateBeforeSave")}
                            />
                            <span>Validate before saving</span>
                        </label>
                        <label className="studio-bot__config-item">
                            <input
                                type="checkbox"
                                checked={config.suggestOptimizations}
                                onChange={() => toggleConfig("suggestOptimizations")}
                            />
                            <span>Suggest optimizations</span>
                        </label>
                    </div>
                )}
            </div>

            {/* ── Capabilities ── */}
            <div className="studio-bot__capabilities">
                <h5 className="studio-bot__section-title">
                    <Zap size={12} />
                    Capabilities
                </h5>
                <div className="studio-bot__cap-list">
                    <div className="studio-bot__cap">
                        <RefreshCw size={11} />
                        <span>Auto-layout & overlap detection</span>
                    </div>
                    <div className="studio-bot__cap">
                        <Play size={11} />
                        <span>Build complete jobs from natural language</span>
                    </div>
                    <div className="studio-bot__cap">
                        <Layers size={11} />
                        <span>Fan-out/fan-in parallel workflow design</span>
                    </div>
                    <div className="studio-bot__cap">
                        <Activity size={11} />
                        <span>Data flow wiring (storage, deliverables, bindings)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

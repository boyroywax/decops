/**
 * OrchestratorView — primary UI for the orchestrator toolkit.
 *
 * Layout mirrors the canonical `.libp2p-view` template (header + tabs +
 * panels) used by the four L.O.H.K toolkits.
 */

import { useCallback, useMemo, useState } from "react";
import {
    Workflow, Plus, X, Play, RefreshCw, Save, Download, Trash2,
    AlertTriangle, CheckCircle, FileJson, Bot,
} from "lucide-react";
import { useOrchestrator } from "../OrchestratorContext";
import { orchestratorService } from "../service";
import type { OrchestratorOperationResult, OrchestratorStatus } from "../types/orchestrator";
import { useChatAgentsStore } from "@/services/chat/agents";
import "../styles/orchestrator.css";

type RunState = "idle" | "applying" | "reconciling" | "saving";

function statusToVariant(s: OrchestratorStatus): string {
    switch (s) {
        case "healthy": return "running";
        case "applying":
        case "reconciling": return "starting";
        case "drifted":
        case "error": return "error";
        default: return "stopped";
    }
}

export function OrchestratorView() {
    const {
        snapshot, nodes, activeId, manifestArtifacts,
        setActive, addNode, removeNode, setLabel, setManifestArtifact,
    } = useOrchestrator();

    const setActiveChatAgent = useChatAgentsStore((s) => s.setActive);
    const [runState, setRunState] = useState<RunState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [exportName, setExportName] = useState("Exported Stack");
    const [labelDraft, setLabelDraft] = useState(snapshot.label);

    const manifestPreview = useMemo(() => {
        if (!snapshot.manifestArtifactId) return null;
        const a = manifestArtifacts.find((m) => m.id === snapshot.manifestArtifactId);
        return a?.content ?? null;
    }, [snapshot.manifestArtifactId, manifestArtifacts]);

    const openChatBot = useCallback(() => setActiveChatAgent("orchestrator-bot"), [setActiveChatAgent]);

    const handleApply = useCallback(async () => {
        setError(null); setRunState("applying");
        try { await orchestratorService.applyManifest(activeId ?? undefined); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setRunState("idle"); }
    }, [activeId]);

    const handleReconcile = useCallback(async () => {
        setError(null); setRunState("reconciling");
        try { await orchestratorService.reconcile(activeId ?? undefined); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setRunState("idle"); }
    }, [activeId]);

    const handleSaveCurrent = useCallback(() => {
        setError(null); setRunState("saving");
        try {
            const manifest = orchestratorService.exportManifest(exportName || "Exported Stack");
            orchestratorService.saveManifestToArtifact(manifest, activeId ?? undefined);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally { setRunState("idle"); }
    }, [exportName, activeId]);

    const handleDownload = useCallback(() => {
        try {
            const manifest = orchestratorService.exportManifest(exportName || "Exported Stack");
            const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${manifest.name.replace(/\s+/g, "-").toLowerCase()}.manifest.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [exportName]);

    const handleClearResults = useCallback(() => {
        orchestratorService.clearResults(activeId ?? undefined);
    }, [activeId]);

    const handleAddStack = useCallback(() => {
        const id = addNode();
        setActive(id);
    }, [addNode, setActive]);

    return (
        <div className="libp2p-view orchestrator-view">
            <div className="libp2p-header">
                <div className="libp2p-header-title">
                    <Workflow size={16} color="#10b981" />
                    <h2>Orchestrator · L.O.H.K Manifests</h2>
                </div>
                <div className="libp2p-header-center">
                    <span className={`libp2p-status libp2p-status--${statusToVariant(snapshot.status)}`}>
                        {snapshot.status}
                    </span>
                    {snapshot.manifestName && (
                        <span className="libp2p-status" title={`Manifest: ${snapshot.manifestName} v${snapshot.manifestVersion ?? "?"}`}>
                            {snapshot.manifestName} v{snapshot.manifestVersion ?? "?"}
                        </span>
                    )}
                </div>
                <div className="libp2p-header-actions">
                    <button
                        type="button"
                        className="libp2p-status libp2p-status--ai"
                        title="Open Orchestrator AI bot"
                        onClick={openChatBot}
                    >
                        <Bot size={11} />
                    </button>
                </div>
            </div>

            <div className="libp2p-tabs">
                {nodes.map((n) => (
                    <button
                        key={n.nodeId}
                        type="button"
                        onClick={() => { setActive(n.nodeId); setLabelDraft(n.label); }}
                        className={`libp2p-tab${n.nodeId === activeId ? " libp2p-tab--active" : ""}`}
                        title={`${n.label} — ${n.status}`}
                    >
                        <span className={`libp2p-tab-dot libp2p-tab-dot--${statusToVariant(n.status)}`} />
                        <span className="libp2p-tab-label">{n.label}</span>
                        {n.pendingDrift > 0 && (
                            <span className="orchestrator-tab-badge">{n.pendingDrift}</span>
                        )}
                        {nodes.length > 1 && (
                            <span
                                className="libp2p-tab-close"
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); void removeNode(n.nodeId); }}
                            >
                                <X size={10} />
                            </span>
                        )}
                    </button>
                ))}
                <button type="button" className="libp2p-tab" onClick={handleAddStack} title="Add stack">
                    <Plus size={11} />
                </button>
            </div>

            <div className="libp2p-panel">
                <h3>Stack Controls</h3>
                <div className="libp2p-section">
                    <div className="orchestrator-row">
                        <input
                            className="libp2p-input"
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            onBlur={() => labelDraft && labelDraft !== snapshot.label && setLabel(snapshot.nodeId, labelDraft)}
                            placeholder="Stack name"
                        />

                        <select
                            className="libp2p-input"
                            value={snapshot.manifestArtifactId ?? ""}
                            onChange={(e) => setManifestArtifact(e.target.value || null)}
                            title="Choose a manifest artifact"
                        >
                            <option value="">— select manifest artifact —</option>
                            {manifestArtifacts.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name} {(a.tags ?? []).includes("manifest") ? "★" : ""}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--primary"
                            onClick={handleApply}
                            disabled={!snapshot.manifestArtifactId || runState !== "idle"}
                        >
                            <Play size={11} /> {runState === "applying" ? "Applying…" : "Apply"}
                        </button>

                        <button
                            type="button"
                            className="libp2p-btn"
                            onClick={handleReconcile}
                            disabled={!snapshot.manifestArtifactId || runState !== "idle"}
                        >
                            <RefreshCw size={11} /> {runState === "reconciling" ? "Reconciling…" : "Reconcile"}
                        </button>
                    </div>

                    <div className="orchestrator-row">
                        <input
                            className="libp2p-input"
                            value={exportName}
                            onChange={(e) => setExportName(e.target.value)}
                            placeholder="Manifest name (for export)"
                        />
                        <button
                            type="button"
                            className="libp2p-btn"
                            onClick={handleSaveCurrent}
                            disabled={runState !== "idle"}
                            title="Snapshot current state → save as JSON artifact → link to this stack"
                        >
                            <Save size={11} /> Save Current State
                        </button>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={handleDownload}
                            title="Download current state as a manifest JSON file"
                        >
                            <Download size={11} /> Download
                        </button>
                    </div>

                    {error && (
                        <div className="libp2p-error" role="alert">{error}</div>
                    )}
                </div>
            </div>

            <div className="libp2p-panel">
                <h3>
                    <FileJson size={13} style={{ verticalAlign: "middle", color: "#10b981", marginRight: 4 }} />
                    Manifest {snapshot.manifestArtifactId ? `(${snapshot.manifestArtifactId})` : "(none linked)"}
                </h3>
                <div className="libp2p-section">
                    {manifestPreview ? (
                        <pre className="orchestrator-manifest-preview">{manifestPreview}</pre>
                    ) : (
                        <div className="orchestrator-empty">
                            No manifest linked. Choose one from the dropdown above, or click <b>Save Current State</b> to
                            snapshot the live L.O.H.K state into a new manifest artifact.
                        </div>
                    )}
                </div>
            </div>

            <div className="libp2p-panel">
                <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    Results — {snapshot.results.length} entr{snapshot.results.length === 1 ? "y" : "ies"}
                    {snapshot.results.length > 0 && (
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={handleClearResults}
                            style={{ marginLeft: "auto" }}
                        >
                            <Trash2 size={11} /> Clear
                        </button>
                    )}
                </h3>
                <div className="libp2p-section">
                    {snapshot.results.length === 0 ? (
                        <div className="orchestrator-empty">No operations yet. Apply or reconcile a manifest to see results here.</div>
                    ) : (
                        <ul className="orchestrator-results">
                            {snapshot.results.map((r, i) => (
                                <ResultRow key={`${r.target}:${r.specId}:${r.at}:${i}`} result={r} />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

function ResultRow({ result }: { result: OrchestratorOperationResult }) {
    const Icon = result.ok ? CheckCircle : AlertTriangle;
    const color = result.ok ? "#10b981" : "#f5b041";
    return (
        <li className="orchestrator-result">
            <Icon size={12} style={{ color }} />
            <span className="orchestrator-result__target">{result.target}</span>
            <span className="orchestrator-result__spec">{result.specId}</span>
            <span className="orchestrator-result__action" style={{ color }}>{result.action}</span>
            {result.runtimeNodeId && <span className="orchestrator-result__rid">[{result.runtimeNodeId}]</span>}
            {result.message && <span className="orchestrator-result__msg">{result.message}</span>}
            {result.error && <span className="orchestrator-result__msg" style={{ color: "#f5b041" }}>{result.error}</span>}
            <span className="orchestrator-result__time">{new Date(result.at).toLocaleTimeString()}</span>
        </li>
    );
}

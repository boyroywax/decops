/**
 * HeliaView — main UI surface for the Helia (IPFS) toolkit.
 *
 * Mirrors the libp2p toolkit's tab-strip + jobs-driven action pattern.
 * The user picks which running/paused libp2p instance backs each Helia
 * node — or leaves it unset, in which case `helia_start` auto-creates a
 * fresh libp2p node. Future toolkits (OrbitDB) will inherit both layers.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Boxes, Power, PowerOff, Plus, X, Copy, Trash2, Pin, PinOff,
    Download, FileText, Braces, ListTree, Bot, RefreshCw, Link2,
    Network, Binary, Upload,
} from "lucide-react";
import { useHelia } from "../HeliaContext";
import { heliaService } from "../service";
import { libp2pService } from "@/toolkits/libp2p/service";
import type { ManagerSnapshot as Libp2pManagerSnapshot } from "@/toolkits/libp2p/service";
import { useJobsContext } from "@/context/JobsContext";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useToolkitLogger } from "@/services/activity";
import type { Job, JobRequest } from "@/types";
import { useChatAgentsStore } from "@/services/chat/agents";
import "../styles/helia.css";

interface HeliaViewProps {
    navigateTo?: (view: string) => void;
}

/** Convert a Uint8Array to a base64 string (chunked to avoid arg-length limits). */
function bytesToBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let bin = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

const ADD_MODES: Array<{ id: "text" | "json" | "dag-json" | "dag-cbor" | "binary"; label: string; icon: React.ReactNode }> = [
    { id: "text", label: "Text", icon: <FileText size={11} /> },
    { id: "json", label: "JSON", icon: <Braces size={11} /> },
    { id: "dag-json", label: "dag-json", icon: <Network size={11} /> },
    { id: "dag-cbor", label: "dag-cbor", icon: <Binary size={11} /> },
    { id: "binary", label: "Binary", icon: <Upload size={11} /> },
];

export function HeliaView(_props: HeliaViewProps) {
    const { snapshot, nodes, activeId, setActive, addNode, removeNode } = useHelia();
    const { addJob, jobs } = useJobsContext();

    // Live libp2p snapshot for the selector
    const [libp2pState, setLibp2pState] = useState<Libp2pManagerSnapshot>(() => libp2pService.snapshot());
    useEffect(() => libp2pService.subscribe(setLibp2pState), []);

    // Selected libp2p node id for this view (empty = auto-create on start).
    const [selectedLibp2pId, setSelectedLibp2pId] = useState<string>(snapshot.libp2pNodeId ?? "");
    useEffect(() => {
        setSelectedLibp2pId(snapshot.libp2pNodeId ?? "");
    }, [snapshot.nodeId, snapshot.libp2pNodeId]);

    const { addLog } = useToolkitLogger("helia");

    const [renaming, setRenaming] = useState(false);
    const [labelDraft, setLabelDraft] = useState(snapshot.label);
    useEffect(() => { setLabelDraft(snapshot.label); }, [snapshot.nodeId, snapshot.label]);

    // Add-content form
    const [addMode, setAddMode] = useState<"text" | "json" | "dag-json" | "dag-cbor" | "binary">("text");
    const [addLabel, setAddLabel] = useState("");
    const [addText, setAddText] = useState("");
    const [addJsonText, setAddJsonText] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [pendingFile, setPendingFile] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(null);

    // Cat / fetch
    const [catCid, setCatCid] = useState("");
    const [catPath, setCatPath] = useState("");

    const isRunning = snapshot.status === "running";
    const isBusy = snapshot.status === "starting" || snapshot.status === "stopping";
    const loggedJobIds = useRef<Set<string>>(new Set());

    /** Submit a helia command as a job, scoped to the active node. */
    const dispatch = (
        type: string,
        request: Record<string, unknown> = {},
        label?: string,
    ) => {
        const payload = activeId ? { ...request, nodeId: activeId } : request;
        const job = addJob({ type, request: payload } as JobRequest);
        addLog(`Queued ${label ?? type}${job?.id ? ` (job ${job.id.slice(4, 12)}…)` : ""}`);
        return job;
    };

    // Mirror finished jobs into our local log.
    useEffect(() => {
        const myJobs = jobs.filter((j: Job) => (j.type ?? "").startsWith("helia_"));
        for (const j of myJobs) {
            if (j.status === "completed" && !loggedJobIds.current.has(j.id)) {
                loggedJobIds.current.add(j.id);
                addLog(`✓ ${j.type ?? "job"} (${j.id.slice(4, 10)})`);
            }
            if (j.status === "failed" && !loggedJobIds.current.has(j.id)) {
                loggedJobIds.current.add(j.id);
                addLog(`✗ ${j.type ?? "job"} — ${j.result ?? "failed"}`, "error");
            }
        }
    }, [jobs]);

    const onStart = () => {
        const libp2pNodeId = selectedLibp2pId.trim() || undefined;
        dispatch("helia_start", {
            ...(libp2pNodeId ? { libp2pNodeId } : {}),
        }, libp2pNodeId ? `start (libp2p ${libp2pNodeId})` : "start (auto-create libp2p)");
    };

    const onStop = () => dispatch("helia_stop", {}, "stop");

    const onSetLibp2p = (value: string) => {
        setSelectedLibp2pId(value);
        if (snapshot.status === "stopped") {
            // Update binding eagerly while stopped so subsequent starts use it.
            try {
                heliaService.setLibp2pBinding(activeId ?? undefined, value.trim() || null);
                addLog(value ? `Bound to libp2p ${value}` : "Cleared libp2p binding (auto-create on start)");
            } catch (err) {
                addLog(err instanceof Error ? err.message : String(err), "error");
            }
        }
    };

    const onRename = () => {
        const next = labelDraft.trim();
        if (!next || next === snapshot.label) { setRenaming(false); return; }
        dispatch("helia_rename_node", { label: next }, "rename");
        setRenaming(false);
    };

    const onAdd = () => {
        setAddError(null);
        if (!isRunning) { setAddError("Start the node first"); return; }
        const labelArg = addLabel.trim() ? { label: addLabel.trim() } : {};
        if (addMode === "text") {
            if (!addText) { setAddError("Enter some text"); return; }
            dispatch("helia_add_text", { text: addText, ...labelArg }, "add text");
            setAddText("");
            setAddLabel("");
            return;
        }
        if (addMode === "binary") {
            if (!pendingFile) { setAddError("Pick a file first"); return; }
            // Encode bytes to base64 for transport through the job system.
            const b64 = bytesToBase64(pendingFile.bytes);
            dispatch(
                "helia_add_bytes",
                { bytes: b64, label: addLabel.trim() || pendingFile.name },
                `add bytes (${pendingFile.name})`,
            );
            setPendingFile(null);
            setAddLabel("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        // json | dag-json | dag-cbor — all accept a JSON-shaped value
        try {
            const value = JSON.parse(addJsonText);
            const cmd =
                addMode === "json" ? "helia_add_json"
                : addMode === "dag-json" ? "helia_add_dag_json"
                : "helia_add_dag_cbor";
            dispatch(cmd, { value, ...labelArg }, `add ${addMode}`);
            setAddJsonText("");
            setAddLabel("");
        } catch (err) {
            setAddError(err instanceof Error ? err.message : "Invalid JSON");
        }
    };

    const onPickFile = async (file: File | null) => {
        setAddError(null);
        if (!file) { setPendingFile(null); return; }
        try {
            const buf = new Uint8Array(await file.arrayBuffer());
            setPendingFile({ name: file.name, size: file.size, bytes: buf });
            if (!addLabel.trim()) setAddLabel(file.name);
        } catch (err) {
            setAddError(err instanceof Error ? err.message : "Failed to read file");
        }
    };

    const onCat = (cidOverride?: string) => {
        const cid = (cidOverride ?? catCid).trim();
        if (!cid) return;
        const path = catPath.trim();
        if (path) {
            dispatch("helia_get_dag", { cid, path }, `get-dag ${cid.slice(0, 12)}…/${path}`);
        } else {
            dispatch("helia_cat", { cid }, `cat ${cid.slice(0, 12)}…`);
        }
        setCatCid("");
        setCatPath("");
    };

    const onGetDag = (cidOverride?: string) => {
        const cid = (cidOverride ?? catCid).trim();
        if (!cid) return;
        const path = catPath.trim() || undefined;
        dispatch("helia_get_dag", { cid, ...(path ? { path } : {}) }, `get-dag ${cid.slice(0, 12)}…`);
        setCatCid("");
        setCatPath("");
    };

    const onPin = (cid: string) => dispatch("helia_pin", { cid }, `pin ${cid.slice(0, 12)}…`);
    const onUnpin = (cid: string) => dispatch("helia_unpin", { cid }, `unpin ${cid.slice(0, 12)}…`);
    const onClearEntries = () => dispatch("helia_clear_entries", {}, "clear entries");

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            addLog("Copied to clipboard");
        } catch { addLog("Clipboard unavailable", "error"); }
    };

    const fmtBytes = (n: number): string => {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    };

    // Chat agent button
    const setActiveChatAgent = useChatAgentsStore((s) => s.setActive);
    const openChatBot = () => setActiveChatAgent("helia");

    // libp2p select options — running/stopped/etc.
    const libp2pOptions = useMemo(() => libp2pState.nodes, [libp2pState]);
    const boundLibp2p = useMemo(
        () => libp2pState.nodes.find((n) => n.nodeId === snapshot.libp2pNodeId) ?? null,
        [libp2pState, snapshot.libp2pNodeId],
    );

    return (
        <div className="libp2p-view helia-view">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="libp2p-header">
                <div className="libp2p-header-title">
                    <Boxes size={16} color="#f59e0b" />
                    <h2>Helia · IPFS</h2>
                </div>
                <div className="libp2p-header-center">
                    <span className={`libp2p-status libp2p-status--${snapshot.status}`}>
                        {snapshot.status}
                    </span>
                    {boundLibp2p && (
                        <span className="libp2p-status" title={`libp2p: ${boundLibp2p.label} — ${boundLibp2p.status}`}>
                            <Link2 size={10} style={{ marginRight: 4, verticalAlign: "-1px" }} />
                            {boundLibp2p.label}
                        </span>
                    )}
                </div>
                <div className="libp2p-header-actions">
                    <button
                        type="button"
                        className="libp2p-status libp2p-status--ai"
                        title="Open Helia AI bot"
                        onClick={openChatBot}
                    >
                        <Bot size={11} />
                    </button>
                </div>
            </div>

            {/* ── Tab strip ──────────────────────────────────────── */}
            <div className="libp2p-tabs">
                {nodes.map((n) => (
                    <button
                        key={n.nodeId}
                        type="button"
                        onClick={() => setActive(n.nodeId)}
                        className={`libp2p-tab${n.nodeId === activeId ? " libp2p-tab--active" : ""}`}
                        title={`${n.label} — ${n.status}`}
                    >
                        <span className={`libp2p-tab-dot libp2p-tab-dot--${n.status}`} />
                        <span className="libp2p-tab-label">{n.label}</span>
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
                <button
                    type="button"
                    className="libp2p-tab libp2p-tab--add"
                    onClick={() => addNode()}
                    title="Add Helia node"
                >
                    <Plus size={11} />
                </button>
            </div>

            {/* ── Control row ───────────────────────────────────── */}
            <div className="libp2p-control-row helia-control-row">
                <div className="helia-field">
                    <label htmlFor="helia-name">Name</label>
                    {renaming ? (
                        <input
                            id="helia-name"
                            className="libp2p-input"
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            onBlur={onRename}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onRename();
                                if (e.key === "Escape") { setLabelDraft(snapshot.label); setRenaming(false); }
                            }}
                            autoFocus
                        />
                    ) : (
                        <button
                            type="button"
                            className="libp2p-btn"
                            onClick={() => setRenaming(true)}
                            title="Rename"
                        >{snapshot.label || "(unnamed)"}</button>
                    )}
                </div>

                <div className="helia-field helia-field--grow">
                    <label htmlFor="helia-libp2p">libp2p instance</label>
                    <select
                        id="helia-libp2p"
                        className="libp2p-input"
                        value={selectedLibp2pId}
                        onChange={(e) => onSetLibp2p(e.target.value)}
                        disabled={isRunning || isBusy}
                        title={
                            isRunning
                                ? "Stop the helia node before changing its libp2p binding"
                                : "Pick the libp2p node to back this Helia. Leave empty to auto-create."
                        }
                    >
                        <option value="">— Auto-create a new libp2p node —</option>
                        {libp2pOptions.map((n) => (
                            <option key={n.nodeId} value={n.nodeId}>
                                {n.label} · {n.status}{n.peerId ? ` · ${n.peerId.slice(0, 10)}…` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="helia-actions">
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--primary"
                        onClick={onStart}
                        disabled={isRunning || isBusy}
                        title="Start Helia (and the bound libp2p if needed)"
                    >
                        <Power size={11} /> Start
                    </button>
                    <button
                        type="button"
                        className="libp2p-btn"
                        onClick={onStop}
                        disabled={!isRunning && !isBusy}
                    >
                        <PowerOff size={11} /> Stop
                    </button>
                </div>
            </div>

            {snapshot.error && (
                <div className="libp2p-error">
                    {snapshot.error}
                </div>
            )}

            {snapshot.peerId && (
                <div className="helia-peer-bar">
                    <span className="helia-peer-bar__label">Peer</span>
                    <code className="helia-peer-bar__id">{snapshot.peerId}</code>
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={() => copy(snapshot.peerId!)}
                        title="Copy peer id"
                    >
                        <Copy size={10} />
                    </button>
                </div>
            )}

            {/* ── Body: two columns ─────────────────────────────── */}
            <div className="helia-body">
                {/* Left: add + cat */}
                <section className="helia-panel">
                    <header className="helia-panel__head">
                        <span>Add to IPFS</span>
                        <div className="helia-mode-toggle">
                            {ADD_MODES.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    className={`libp2p-btn libp2p-btn--ghost${addMode === m.id ? " libp2p-btn--active" : ""}`}
                                    onClick={() => { setAddMode(m.id); setAddError(null); }}
                                    title={m.label}
                                >
                                    {m.icon} {m.label}
                                </button>
                            ))}
                        </div>
                    </header>
                    <div className="helia-panel__body">
                        <input
                            className="libp2p-input"
                            placeholder="Label (optional)"
                            value={addLabel}
                            onChange={(e) => setAddLabel(e.target.value)}
                            disabled={!isRunning}
                        />
                        {addMode === "text" && (
                            <textarea
                                className="libp2p-input helia-textarea"
                                placeholder="UTF-8 content…"
                                value={addText}
                                onChange={(e) => setAddText(e.target.value)}
                                disabled={!isRunning}
                                rows={6}
                            />
                        )}
                        {(addMode === "json" || addMode === "dag-json" || addMode === "dag-cbor") && (
                            <textarea
                                className="libp2p-input helia-textarea"
                                placeholder={
                                    addMode === "json"
                                        ? '{"hello": "world"}'
                                        : '{"name": "alice", "avatar": {"/": "bafy…"}}'
                                }
                                value={addJsonText}
                                onChange={(e) => setAddJsonText(e.target.value)}
                                disabled={!isRunning}
                                rows={6}
                            />
                        )}
                        {addMode === "binary" && (
                            <div className="helia-cat-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="libp2p-input"
                                    disabled={!isRunning}
                                    onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
                                />
                                {pendingFile && (
                                    <div className="helia-entry__meta" style={{ paddingLeft: 2 }}>
                                        <span className="helia-entry__label">{pendingFile.name}</span>
                                        <span>{fmtBytes(pendingFile.size)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {addError && <div className="libp2p-error">{addError}</div>}
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--primary"
                            onClick={onAdd}
                            disabled={!isRunning || (addMode === "binary" && !pendingFile)}
                        >
                            <Plus size={11} /> Add → CID
                        </button>
                    </div>

                    <header className="helia-panel__head">
                        <span>Fetch by CID</span>
                    </header>
                    <div className="helia-panel__body helia-cat-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                        <input
                            className="libp2p-input"
                            placeholder="bafy… / Qm…"
                            value={catCid}
                            onChange={(e) => setCatCid(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") onCat(); }}
                            disabled={!isRunning}
                        />
                        <input
                            className="libp2p-input"
                            placeholder="IPLD path (optional, e.g. author/name)"
                            value={catPath}
                            onChange={(e) => setCatPath(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") onGetDag(); }}
                            disabled={!isRunning}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                            <button
                                type="button"
                                className="libp2p-btn"
                                onClick={() => onCat()}
                                disabled={!isRunning || !catCid.trim()}
                                title="Fetch as UTF-8 text via UnixFS"
                            >
                                <Download size={11} /> Cat
                            </button>
                            <button
                                type="button"
                                className="libp2p-btn"
                                onClick={() => onGetDag()}
                                disabled={!isRunning || !catCid.trim()}
                                title="Resolve as an IPLD block (dag-cbor/dag-json/json)"
                            >
                                <Network size={11} /> Get IPLD
                            </button>
                        </div>
                    </div>
                </section>

                {/* Right: entries */}
                <section className="helia-panel">
                    <header className="helia-panel__head">
                        <span><ListTree size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                            Entries ({snapshot.entries.length}) · pinned {snapshot.pinnedCount} · {fmtBytes(snapshot.totalBytes)}
                        </span>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={onClearEntries}
                            disabled={snapshot.entries.length === 0}
                            title="Clear local entries list"
                        >
                            <RefreshCw size={11} />
                        </button>
                    </header>
                    <div className="helia-entries">
                        {snapshot.entries.length === 0 && (
                            <div className="helia-entries__empty">No entries yet — add some content or fetch a CID.</div>
                        )}
                        {snapshot.entries.map((e) => (
                            <div key={e.cid} className="helia-entry">
                                <div className="helia-entry__head">
                                    <code className="helia-entry__cid" title={e.cid}>{e.cid}</code>
                                    <span className={`helia-entry__badge helia-entry__badge--${e.source}`}>
                                        {e.source}
                                    </span>
                                    {e.codec && <span className="helia-entry__codec">{e.codec}</span>}
                                </div>
                                <div className="helia-entry__meta">
                                    {e.label && <span className="helia-entry__label">{e.label}</span>}
                                    {typeof e.bytes === "number" && <span>{fmtBytes(e.bytes)}</span>}
                                    <span>{new Date(e.addedAt).toLocaleTimeString()}</span>
                                </div>
                                {e.preview && (
                                    <pre className="helia-entry__preview">{e.preview}</pre>
                                )}
                                <div className="helia-entry__actions">
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => copy(e.cid)}
                                        title="Copy CID"
                                    >
                                        <Copy size={10} />
                                    </button>
                                    {e.pinned ? (
                                        <button
                                            type="button"
                                            className="libp2p-btn libp2p-btn--ghost"
                                            onClick={() => onUnpin(e.cid)}
                                            disabled={!isRunning}
                                            title="Unpin"
                                        >
                                            <PinOff size={10} /> Unpin
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="libp2p-btn libp2p-btn--ghost"
                                            onClick={() => onPin(e.cid)}
                                            disabled={!isRunning}
                                            title="Pin"
                                        >
                                            <Pin size={10} /> Pin
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => onCat(e.cid)}
                                        disabled={!isRunning}
                                        title="Re-fetch"
                                    >
                                        <Download size={10} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* ── Activity log ──────────────────────────────────── */}
            <section className="helia-panel">
                <ActivityFeed
                    baseFilter={{ sources: ["helia"] }}
                    sourceOptions={["helia"]}
                    title="Activity"
                    defaultTimeRange="1h"
                    emptyMessage="Helia events will appear here."
                />
            </section>
        </div>
    );
}

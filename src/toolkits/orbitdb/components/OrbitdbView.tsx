/**
 * OrbitdbView — main UI surface for the OrbitDB toolkit.
 *
 * Mirrors HeliaView's tab-strip + jobs-driven action pattern. Each
 * OrbitDB node binds to one helia node (which itself binds to one libp2p
 * node). Users open databases by friendly name (creates new) or by full
 * `/orbitdb/...` address (attaches to an existing one).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Database, Power, PowerOff, Plus, X, Copy, Trash2,
    Bot, Link2, KeyRound, List, FileText, Search,
} from "lucide-react";
import { useOrbitdb } from "../OrbitdbContext";
import { orbitdbService } from "../service";
import { heliaService } from "@/toolkits/helia/service";
import { useAuth } from "@/context/AuthContext";
import type { HeliaManagerSnapshot } from "@/toolkits/helia/types/helia";
import type { OrbitdbDbType } from "../types/orbitdb";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, JobRequest } from "@/types";
import { useChatAgentsStore } from "@/services/chat/agents";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useToolkitLogger } from "@/services/activity";
import "../styles/orbitdb.css";

interface OrbitdbViewProps {
    navigateTo?: (view: string) => void;
}

const DB_TYPES: Array<{ id: OrbitdbDbType; label: string; description: string }> = [
    { id: "events", label: "Log", description: "Append-only events log" },
    { id: "keyvalue", label: "KV", description: "Key-value store" },
    { id: "keyvalue-indexed", label: "KV (indexed)", description: "Indexed key-value" },
    { id: "documents", label: "Documents", description: "Document store" },
];

export function OrbitdbView(_props: OrbitdbViewProps) {
    const { snapshot, nodes, activeId, setActive, removeNode } = useOrbitdb();
    const { addJob, jobs } = useJobsContext();
    const { user } = useAuth();

    // Live helia snapshot for the selector.
    const [heliaState, setHeliaState] = useState<HeliaManagerSnapshot>(() => heliaService.snapshot());
    useEffect(() => heliaService.subscribe(setHeliaState), []);

    const [selectedHeliaId, setSelectedHeliaId] = useState<string>(snapshot.heliaNodeId ?? "");
    useEffect(() => { setSelectedHeliaId(snapshot.heliaNodeId ?? ""); }, [snapshot.nodeId, snapshot.heliaNodeId]);

    const { addLog } = useToolkitLogger("orbitdb");

    const [renaming, setRenaming] = useState(false);
    const [labelDraft, setLabelDraft] = useState(snapshot.label);
    useEffect(() => { setLabelDraft(snapshot.label); }, [snapshot.nodeId, snapshot.label]);

    // Open-DB form
    const [openName, setOpenName] = useState("");
    const [openType, setOpenType] = useState<OrbitdbDbType>("events");
    const [openIndexBy, setOpenIndexBy] = useState("");
    const [openError, setOpenError] = useState<string | null>(null);

    // Selected database for the inspector
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

    // Write forms (per type)
    const [kvKey, setKvKey] = useState("");
    const [kvValue, setKvValue] = useState("");
    const [logValue, setLogValue] = useState("");
    const [docJson, setDocJson] = useState("");
    const [docQuery, setDocQuery] = useState("");

    // Read form (KV/doc lookup)
    const [getKey, setGetKey] = useState("");

    const isRunning = snapshot.status === "running";
    const isBusy = snapshot.status === "starting" || snapshot.status === "stopping";

    const loggedJobIds = useRef<Set<string>>(new Set());

    /** Submit an orbitdb command as a job. */
    const dispatch = (type: string, request: Record<string, unknown> = {}, label?: string) => {
        const payload = activeId ? { ...request, nodeId: activeId } : request;
        const job = addJob({ type, request: payload } as JobRequest);
        addLog(`Queued ${label ?? type}${job?.id ? ` (job ${job.id.slice(4, 12)}…)` : ""}`);
        return job;
    };

    // Mirror finished jobs into the local log.
    useEffect(() => {
        const myJobs = jobs.filter((j: Job) => (j.type ?? "").startsWith("orbitdb_"));
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
        const heliaNodeId = selectedHeliaId.trim() || undefined;
        dispatch("orbitdb_start", { ...(heliaNodeId ? { heliaNodeId } : {}) },
            heliaNodeId ? `start (helia ${heliaNodeId})` : "start (use active helia)");
    };
    const onStop = () => dispatch("orbitdb_stop", {}, "stop");

    const onSetHelia = (value: string) => {
        setSelectedHeliaId(value);
        if (snapshot.status === "stopped") {
            try {
                orbitdbService.setHeliaBinding(activeId ?? undefined, value.trim() || null);
                addLog(value ? `Bound to helia ${value}` : "Cleared helia binding (use active on start)");
            } catch (err) {
                addLog(err instanceof Error ? err.message : String(err), "error");
            }
        }
    };

    const onRename = () => {
        const next = labelDraft.trim();
        if (!next || next === snapshot.label) { setRenaming(false); return; }
        dispatch("orbitdb_rename_node", { label: next }, "rename");
        setRenaming(false);
    };

    const onOpen = () => {
        setOpenError(null);
        if (!isRunning) { setOpenError("Start the node first"); return; }
        const name = openName.trim();
        if (!name) { setOpenError("Enter a name or address"); return; }
        const indexBy = openType === "documents" && openIndexBy.trim() ? openIndexBy.trim() : undefined;
        dispatch("orbitdb_open", {
            addressOrName: name, type: openType,
            ...(indexBy ? { indexBy } : {}),
        }, `open ${openType} "${name}"`);
        setOpenName("");
        setOpenIndexBy("");
    };

    const onClose = (address: string) =>
        dispatch("orbitdb_close", { address }, `close ${address.slice(0, 16)}…`);
    const onDrop = (address: string) => {
        if (!confirm("Drop database? This deletes all data on disk.")) return;
        dispatch("orbitdb_drop", { address }, `drop ${address.slice(0, 16)}…`);
        if (selectedAddress === address) setSelectedAddress(null);
    };

    const onKvPut = () => {
        if (!selectedAddress) return;
        if (!kvKey) { addLog("Enter a key", "error"); return; }
        dispatch("orbitdb_kv_put", { address: selectedAddress, key: kvKey, value: kvValue }, `kv put ${kvKey}`);
        setKvKey(""); setKvValue("");
    };
    const onKvGet = () => {
        if (!selectedAddress || !getKey) return;
        dispatch("orbitdb_kv_get", { address: selectedAddress, key: getKey }, `kv get ${getKey}`);
    };
    const onKvDel = (key: string) =>
        selectedAddress && dispatch("orbitdb_kv_del", { address: selectedAddress, key }, `kv del ${key}`);
    const onKvAll = () => selectedAddress && dispatch("orbitdb_kv_all", { address: selectedAddress }, "kv all");

    const onLogAdd = () => {
        if (!selectedAddress) return;
        if (!logValue) { addLog("Enter a value", "error"); return; }
        dispatch("orbitdb_log_add", { address: selectedAddress, value: logValue }, "log add");
        setLogValue("");
    };
    const onLogAll = () => selectedAddress && dispatch("orbitdb_log_all", { address: selectedAddress }, "log all");

    const onDocPut = () => {
        if (!selectedAddress) return;
        try {
            const parsed = JSON.parse(docJson);
            dispatch("orbitdb_doc_put", { address: selectedAddress, doc: parsed }, "doc put");
            setDocJson("");
        } catch (err) {
            addLog(err instanceof Error ? err.message : "Invalid JSON", "error");
        }
    };
    const onDocGet = () => {
        if (!selectedAddress || !getKey) return;
        dispatch("orbitdb_doc_get", { address: selectedAddress, key: getKey }, `doc get ${getKey}`);
    };
    const onDocDel = (key: string) =>
        selectedAddress && dispatch("orbitdb_doc_del", { address: selectedAddress, key }, `doc del ${key}`);
    const onDocAll = () => selectedAddress && dispatch("orbitdb_doc_all", { address: selectedAddress }, "doc all");
    const onDocQuery = () => {
        if (!selectedAddress || !docQuery.trim()) return;
        dispatch("orbitdb_doc_query", { address: selectedAddress, find: docQuery.trim() }, "doc query");
    };

    const copy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); addLog("Copied to clipboard"); }
        catch { addLog("Clipboard unavailable", "error"); }
    };

    const setActiveChatAgent = useChatAgentsStore((s) => s.setActive);
    const openChatBot = () => setActiveChatAgent("orbitdb");

    const heliaOptions = useMemo(() => heliaState.nodes, [heliaState]);
    const boundHelia = useMemo(
        () => heliaState.nodes.find((n) => n.nodeId === snapshot.heliaNodeId) ?? null,
        [heliaState, snapshot.heliaNodeId],
    );

    const databases = snapshot.databases;
    const selectedDb = useMemo(
        () => databases.find((d) => d.address === selectedAddress) ?? null,
        [databases, selectedAddress],
    );

    return (
        <div className="libp2p-view orbitdb-view">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="libp2p-header">
                <div className="libp2p-header-title">
                    <Database size={16} color="#a855f7" />
                    <h2>OrbitDB</h2>
                </div>
                <div className="libp2p-header-center">
                    <span className={`libp2p-status libp2p-status--${snapshot.status}`}>{snapshot.status}</span>
                    {boundHelia && (
                        <span className="libp2p-status" title={`helia: ${boundHelia.label} — ${boundHelia.status}`}>
                            <Link2 size={10} style={{ marginRight: 4, verticalAlign: "-1px" }} />
                            {boundHelia.label}
                        </span>
                    )}
                </div>
                <div className="libp2p-header-actions">
                    <button
                        type="button"
                        className="libp2p-status libp2p-status--ai"
                        title="Open OrbitDB AI bot"
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
                    onClick={() => orbitdbService.addNode()}
                    title="Add a new OrbitDB node"
                >
                    <Plus size={10} /> Add
                </button>
            </div>

            {/* ── Main content ───────────────────────────────────── */}
            <div className="libp2p-body">

                {/* Node controls */}
                <section className="libp2p-section">
                    <div className="libp2p-section-row">
                        {renaming ? (
                            <input
                                className="libp2p-input"
                                value={labelDraft}
                                onChange={(e) => setLabelDraft(e.target.value)}
                                onBlur={onRename}
                                onKeyDown={(e) => { if (e.key === "Enter") onRename(); if (e.key === "Escape") setRenaming(false); }}
                                autoFocus
                            />
                        ) : (
                            <button className="libp2p-section-title" onClick={() => setRenaming(true)} title="Rename">
                                {snapshot.label}
                            </button>
                        )}

                        <select
                            className="libp2p-select"
                            value={selectedHeliaId}
                            onChange={(e) => onSetHelia(e.target.value)}
                            title="Helia node binding"
                            disabled={isRunning || isBusy}
                        >
                            <option value="">— use active helia —</option>
                            {heliaOptions.map((h) => (
                                <option key={h.nodeId} value={h.nodeId}>
                                    {h.label} ({h.status})
                                </option>
                            ))}
                        </select>

                        {isRunning ? (
                            <button className="libp2p-btn libp2p-btn--stop" onClick={onStop} disabled={isBusy}>
                                <PowerOff size={11} /> Stop
                            </button>
                        ) : (
                            <button className="libp2p-btn libp2p-btn--start" onClick={onStart} disabled={isBusy}>
                                <Power size={11} /> Start
                            </button>
                        )}
                    </div>

                    {snapshot.error && (
                        <div className="libp2p-error" role="alert">{snapshot.error}</div>
                    )}

                    <div className="libp2p-meta">
                        <div>
                            <span className="libp2p-meta-key">Identity:</span>{" "}
                            <span className="libp2p-meta-value">
                                {snapshot.identityId ? `${snapshot.identityId.slice(0, 32)}…` : "—"}
                            </span>
                            {snapshot.identityId && (
                                <button className="libp2p-icon-btn" onClick={() => copy(snapshot.identityId!)} title="Copy identity id">
                                    <Copy size={10} />
                                </button>
                            )}
                            {user?.did && snapshot.identityId === user.did && (
                                <span
                                    className="libp2p-badge libp2p-badge--ok"
                                    title={`Derived from logged-in user ${user.profile?.name ?? user.email}`}
                                    style={{ marginLeft: 6 }}
                                >
                                    user
                                </span>
                            )}
                            {!isRunning && user?.did && (
                                <span className="libp2p-meta-key" style={{ marginLeft: 6 }}>
                                    (will use {user.did.slice(0, 18)}… on start)
                                </span>
                            )}
                        </div>
                        <div>
                            <span className="libp2p-meta-key">Peer:</span>{" "}
                            <span className="libp2p-meta-value">
                                {snapshot.peerId ? `${snapshot.peerId.slice(0, 24)}…` : "—"}
                            </span>
                        </div>
                    </div>
                </section>

                {/* Open database form */}
                <section className="libp2p-section">
                    <h3 className="libp2p-section-title">Open / create database</h3>
                    <div className="libp2p-section-row">
                        <input
                            className="libp2p-input"
                            placeholder="db name or /orbitdb/<address>"
                            value={openName}
                            onChange={(e) => setOpenName(e.target.value)}
                            disabled={!isRunning}
                        />
                        <select
                            className="libp2p-select"
                            value={openType}
                            onChange={(e) => setOpenType(e.target.value as OrbitdbDbType)}
                            disabled={!isRunning}
                        >
                            {DB_TYPES.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                        {openType === "documents" && (
                            <input
                                className="libp2p-input"
                                placeholder="indexBy (default _id)"
                                value={openIndexBy}
                                onChange={(e) => setOpenIndexBy(e.target.value)}
                                style={{ maxWidth: 160 }}
                                disabled={!isRunning}
                            />
                        )}
                        <button className="libp2p-btn libp2p-btn--primary" onClick={onOpen} disabled={!isRunning}>
                            <Plus size={11} /> Open
                        </button>
                    </div>
                    {openError && <div className="libp2p-error">{openError}</div>}
                </section>

                {/* Database list */}
                <section className="libp2p-section">
                    <h3 className="libp2p-section-title">Databases ({databases.length})</h3>
                    {databases.length === 0 ? (
                        <div className="libp2p-empty">No databases yet. Open one above to get started.</div>
                    ) : (
                        <div className="orbitdb-db-list">
                            {databases.map((db) => (
                                <div
                                    key={db.address}
                                    className={`orbitdb-db${selectedAddress === db.address ? " orbitdb-db--active" : ""}`}
                                    onClick={() => setSelectedAddress(db.address)}
                                >
                                    <span className="orbitdb-db__type">{db.type}</span>
                                    <span className="orbitdb-db__name">{db.name}</span>
                                    <span className="orbitdb-db__addr" title={db.address}>{db.address.slice(0, 28)}…</span>
                                    {typeof db.count === "number" && (
                                        <span className="orbitdb-db__count">{db.count}</span>
                                    )}
                                    <button
                                        className="libp2p-icon-btn"
                                        onClick={(e) => { e.stopPropagation(); copy(db.address); }}
                                        title="Copy address"
                                    >
                                        <Copy size={10} />
                                    </button>
                                    {db.open && (
                                        <button
                                            className="libp2p-icon-btn"
                                            onClick={(e) => { e.stopPropagation(); onClose(db.address); }}
                                            title="Close"
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                    <button
                                        className="libp2p-icon-btn"
                                        onClick={(e) => { e.stopPropagation(); onDrop(db.address); }}
                                        title="Drop (delete data)"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Database inspector */}
                {selectedDb && (
                    <section className="libp2p-section">
                        <h3 className="libp2p-section-title">
                            {selectedDb.type} · {selectedDb.name}
                        </h3>

                        {(selectedDb.type === "keyvalue" || selectedDb.type === "keyvalue-indexed") && (
                            <>
                                <div className="libp2p-section-row">
                                    <input
                                        className="libp2p-input"
                                        placeholder="key"
                                        value={kvKey}
                                        onChange={(e) => setKvKey(e.target.value)}
                                        style={{ maxWidth: 160 }}
                                    />
                                    <input
                                        className="libp2p-input"
                                        placeholder="value (JSON ok)"
                                        value={kvValue}
                                        onChange={(e) => setKvValue(e.target.value)}
                                    />
                                    <button className="libp2p-btn libp2p-btn--primary" onClick={onKvPut}>
                                        <KeyRound size={11} /> Put
                                    </button>
                                </div>
                                <div className="libp2p-section-row">
                                    <input
                                        className="libp2p-input"
                                        placeholder="get key"
                                        value={getKey}
                                        onChange={(e) => setGetKey(e.target.value)}
                                        style={{ maxWidth: 200 }}
                                    />
                                    <button className="libp2p-btn" onClick={onKvGet} disabled={!getKey}>
                                        <Search size={11} /> Get
                                    </button>
                                    <button className="libp2p-btn" onClick={() => onKvDel(getKey)} disabled={!getKey}>
                                        <Trash2 size={11} /> Del
                                    </button>
                                    <button className="libp2p-btn" onClick={onKvAll}>
                                        <List size={11} /> List all
                                    </button>
                                </div>
                            </>
                        )}

                        {selectedDb.type === "events" && (
                            <>
                                <div className="libp2p-section-row">
                                    <input
                                        className="libp2p-input"
                                        placeholder="event value (JSON ok)"
                                        value={logValue}
                                        onChange={(e) => setLogValue(e.target.value)}
                                    />
                                    <button className="libp2p-btn libp2p-btn--primary" onClick={onLogAdd}>
                                        <Plus size={11} /> Add
                                    </button>
                                    <button className="libp2p-btn" onClick={onLogAll}>
                                        <List size={11} /> List all
                                    </button>
                                </div>
                            </>
                        )}

                        {selectedDb.type === "documents" && (
                            <>
                                <div className="libp2p-section-row">
                                    <textarea
                                        className="libp2p-input"
                                        placeholder={`document JSON (must include "${selectedDb.indexBy || "_id"}")`}
                                        value={docJson}
                                        onChange={(e) => setDocJson(e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className="libp2p-section-row">
                                    <button className="libp2p-btn libp2p-btn--primary" onClick={onDocPut}>
                                        <FileText size={11} /> Put doc
                                    </button>
                                    <button className="libp2p-btn" onClick={onDocAll}>
                                        <List size={11} /> List all
                                    </button>
                                </div>
                                <div className="libp2p-section-row">
                                    <input
                                        className="libp2p-input"
                                        placeholder={`get by ${selectedDb.indexBy || "_id"}`}
                                        value={getKey}
                                        onChange={(e) => setGetKey(e.target.value)}
                                        style={{ maxWidth: 200 }}
                                    />
                                    <button className="libp2p-btn" onClick={onDocGet} disabled={!getKey}>
                                        <Search size={11} /> Get
                                    </button>
                                    <button className="libp2p-btn" onClick={() => onDocDel(getKey)} disabled={!getKey}>
                                        <Trash2 size={11} /> Del
                                    </button>
                                </div>
                                <div className="libp2p-section-row">
                                    <input
                                        className="libp2p-input"
                                        placeholder='predicate, e.g. (doc) => doc.tag === "todo"'
                                        value={docQuery}
                                        onChange={(e) => setDocQuery(e.target.value)}
                                    />
                                    <button className="libp2p-btn" onClick={onDocQuery} disabled={!docQuery.trim()}>
                                        <Search size={11} /> Query
                                    </button>
                                </div>
                            </>
                        )}
                    </section>
                )}

                {/* Log */}
                <section className="libp2p-section">
                    <ActivityFeed
                        baseFilter={{ sources: ["orbitdb"] }}
                        sourceOptions={["orbitdb"]}
                        title="Activity"
                        defaultTimeRange="1h"
                        emptyMessage="OrbitDB events will appear here."
                    />
                </section>
            </div>
        </div>
    );
}

/**
 * OrbitdbServerView — main UI surface for the OrbitDB Server Connector.
 *
 * Mirrors the Kubo view tab-strip + jobs-driven action pattern. Each tab
 * is a separate orbitdb-server endpoint. Connect/disconnect is driven via
 * `orbitdbServerService`; all mutating commands flow through the shared
 * jobs queue so the AI bot can observe progress.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    HardDrive, Cloud, CloudOff, Plus, X, Copy, Trash2,
    Bot, RefreshCw, Globe, Hash, KeyRound, Eye, EyeOff,
    Database, ShieldCheck, ShieldAlert, KeyIcon, Network,
    PlusSquare, Trash, Search, FileText,
} from "lucide-react";
import { useOrbitdbServer } from "../OrbitdbServerContext";
import { orbitdbServerService } from "../service";
import { ORBITDB_SERVER_STORE_TYPES, type OrbitdbServerStoreType, type OrbitdbServerDatabaseEntry } from "../types/orbitdbServer";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, JobRequest } from "@/types";
import { useChatAgentsStore } from "@/services/chat/agents";
import "../styles/orbitdb-server.css";

interface OrbitdbServerViewProps {
    navigateTo?: (view: string) => void;
}

function normalizeAuth(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (/^(bearer|basic|token)\s+/i.test(trimmed)) return trimmed;
    return `Bearer ${trimmed}`;
}

function truncate(s: string, n = 24): string {
    if (s.length <= n) return s;
    return `${s.slice(0, n - 1)}…`;
}

export function OrbitdbServerView(_props: OrbitdbServerViewProps) {
    const { snapshot, nodes, activeId, setActive, addNode, removeNode } = useOrbitdbServer();
    const { addJob, jobs } = useJobsContext();

    // Endpoint config draft
    const [urlDraft, setUrlDraft] = useState(snapshot.endpoint);
    const [authDraft, setAuthDraft] = useState(snapshot.authorization ?? "");
    const [showAuth, setShowAuth] = useState(false);
    const [revealAuth, setRevealAuth] = useState(false);
    useEffect(() => {
        setUrlDraft(snapshot.endpoint);
        setAuthDraft(snapshot.authorization ?? "");
    }, [snapshot.nodeId, snapshot.endpoint, snapshot.authorization]);

    // Rename
    const [renaming, setRenaming] = useState(false);
    const [labelDraft, setLabelDraft] = useState(snapshot.label);
    useEffect(() => { setLabelDraft(snapshot.label); }, [snapshot.nodeId, snapshot.label]);

    // Local action log
    const [log, setLog] = useState<{ ts: number; msg: string; level: "info" | "error" }[]>([]);
    const addLog = (msg: string, level: "info" | "error" = "info") =>
        setLog((l) => [{ ts: Date.now(), msg, level }, ...l].slice(0, 100));

    // Create-db form
    const [newDbName, setNewDbName] = useState("");
    const [newDbType, setNewDbType] = useState<OrbitdbServerStoreType>("keyvalue");

    // Selected db + write form
    const [selectedDb, setSelectedDb] = useState<string | null>(null);
    const [putKey, setPutKey] = useState("");
    const [putValueText, setPutValueText] = useState("");
    const [getKey, setGetKey] = useState("");
    const [getResult, setGetResult] = useState<string | null>(null);
    const [queryFilterText, setQueryFilterText] = useState('{"_id": "…"}');
    const [queryResult, setQueryResult] = useState<unknown[] | null>(null);
    const [writeError, setWriteError] = useState<string | null>(null);

    // Swarm
    const [swarmDial, setSwarmDial] = useState("");
    const [swarmPeers, setSwarmPeers] = useState<Array<{ peerId: string; addr: string }>>([]);

    // Pnet
    const [pnetGenerated, setPnetGenerated] = useState<string | null>(null);

    const isConnected = snapshot.status === "connected";
    const isBusy = snapshot.status === "connecting";
    const loggedJobIds = useRef<Set<string>>(new Set());

    const selected: OrbitdbServerDatabaseEntry | undefined = useMemo(
        () => snapshot.databases.find((d) => d.name === selectedDb) ?? snapshot.databases[0],
        [snapshot.databases, selectedDb],
    );

    useEffect(() => {
        if (!selected && snapshot.databases[0]) setSelectedDb(snapshot.databases[0].name);
    }, [snapshot.databases, selected]);

    /** Submit a command as a job, scoped to active node. */
    const dispatch = (type: string, request: Record<string, unknown> = {}, label?: string) => {
        const payload = activeId ? { ...request, nodeId: activeId } : request;
        const job = addJob({ type, request: payload } as JobRequest);
        addLog(`Queued ${label ?? type}${job?.id ? ` (job ${job.id.slice(4, 12)}…)` : ""}`);
        return job;
    };

    useEffect(() => {
        const myJobs = jobs.filter((j: Job) => (j.type ?? "").startsWith("orbitdb_server_"));
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

    // ── Handlers ──

    const onConnect = () => {
        const url = urlDraft.trim();
        if (!/^https?:\/\//i.test(url)) {
            addLog("URL must start with http:// or https://", "error");
            return;
        }
        const payload: Record<string, unknown> = { url };
        const auth = normalizeAuth(authDraft);
        if (auth) payload.authorization = auth;
        dispatch("orbitdb_server_connect", payload, `connect ${url}`);
    };

    const onDisconnect = () => dispatch("orbitdb_server_disconnect", {}, "disconnect");
    const onRefreshIdentity = () => dispatch("orbitdb_server_id", {}, "id refresh");

    const onSaveEndpoint = () => {
        if (isConnected || isBusy) {
            addLog("Disconnect before changing endpoint config", "error");
            return;
        }
        try {
            orbitdbServerService.setConfig(activeId ?? undefined, {
                endpoint: urlDraft.trim(),
                authorization: normalizeAuth(authDraft) || null,
            });
            addLog(`Endpoint updated → ${urlDraft.trim()}${authDraft.trim() ? " (auth saved)" : ""}`);
        } catch (err) {
            addLog(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const onRename = () => {
        const next = labelDraft.trim();
        if (!next || next === snapshot.label) { setRenaming(false); return; }
        dispatch("orbitdb_server_rename_node", { nodeId: activeId, label: next }, "rename");
        setRenaming(false);
    };

    const onCreateDb = () => {
        const name = newDbName.trim();
        if (!name) { addLog("Database name required", "error"); return; }
        dispatch("orbitdb_server_create_db", { name, type: newDbType }, `create ${newDbType} "${name}"`);
        setNewDbName("");
    };

    const onDropDb = (name: string) => {
        if (!confirm(`Drop database "${name}" on the server? This is irreversible.`)) return;
        dispatch("orbitdb_server_drop_db", { name }, `drop "${name}"`);
    };

    const onListDbs = () => dispatch("orbitdb_server_list_dbs", {}, "list dbs");

    const onPut = () => {
        setWriteError(null);
        if (!selected) { setWriteError("Select a database first"); return; }
        let value: unknown;
        try { value = JSON.parse(putValueText); }
        catch { setWriteError("Value must be valid JSON"); return; }
        const args: Record<string, unknown> = { db: selected.name, value };
        if (selected.type !== "events" && putKey.trim()) args.key = putKey.trim();
        const cmd = selected.type === "events" ? "orbitdb_server_add_event" : "orbitdb_server_put";
        dispatch(cmd, args, `${cmd} ${selected.name}/${putKey.trim() || "·"}`);
        setPutValueText("");
        setPutKey("");
    };

    const onGet = async () => {
        if (!selected || !getKey.trim()) return;
        try {
            const value = await orbitdbServerService.get(selected.name, getKey.trim(), activeId ?? undefined);
            setGetResult(JSON.stringify(value, null, 2));
            addLog(`get ${selected.name}/${getKey.trim()} → ok`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setGetResult(`// error: ${msg}`);
            addLog(msg, "error");
        }
    };

    const onDel = () => {
        if (!selected || !getKey.trim()) return;
        dispatch("orbitdb_server_del", { db: selected.name, key: getKey.trim() }, `del ${selected.name}/${getKey.trim()}`);
    };

    const onAll = () => {
        if (!selected) return;
        dispatch("orbitdb_server_all", { db: selected.name }, `all ${selected.name}`);
    };

    const onQuery = async () => {
        if (!selected) return;
        let filter: Record<string, unknown>;
        try { filter = JSON.parse(queryFilterText); }
        catch { setQueryResult(["// invalid filter JSON"]); return; }
        try {
            const rows = await orbitdbServerService.query(selected.name, filter, activeId ?? undefined);
            setQueryResult(rows);
            addLog(`query ${selected.name} → ${rows.length} row(s)`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setQueryResult([`// error: ${msg}`]);
            addLog(msg, "error");
        }
    };

    const onSwarmPeers = async () => {
        try {
            const peers = await orbitdbServerService.swarmListPeers(activeId ?? undefined);
            setSwarmPeers(peers);
            addLog(`Fetched ${peers.length} swarm peer(s)`);
        } catch (err) {
            addLog(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const onSwarmConnect = () => {
        const addr = swarmDial.trim();
        if (!addr) return;
        dispatch("orbitdb_server_swarm_connect", { multiaddr: addr }, `dial ${addr.slice(0, 32)}…`);
        setSwarmDial("");
    };

    const onPnetStatus = () => dispatch("orbitdb_server_pnet_status", {}, "pnet status");
    const onPnetGenerate = async () => {
        try {
            const r = await orbitdbServerService.pnetGenerate(activeId ?? undefined);
            setPnetGenerated(r.key);
            addLog("Generated pnet swarm key (NOT auto-applied)");
        } catch (err) {
            addLog(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const copy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); addLog("Copied to clipboard"); }
        catch { addLog("Clipboard unavailable", "error"); }
    };

    const setActiveChatAgent = useChatAgentsStore((s) => s.setActive);
    const openChatBot = () => setActiveChatAgent("orbitdb-server");

    const peerLine = snapshot.peer;
    const pnetMode = peerLine?.pnetMode ?? "?";

    return (
        <div className="libp2p-view orbitdb-server-view">
            {/* ── Header ───────────────────────────── */}
            <div className="libp2p-header">
                <div className="libp2p-header-title">
                    <HardDrive size={16} color="#ec4899" />
                    <h2>Lagrange</h2>
                </div>
                <div className="libp2p-header-center">
                    <span className={`libp2p-status libp2p-status--${snapshot.status === "connected" ? "running" : snapshot.status === "connecting" ? "starting" : snapshot.status === "error" ? "error" : "stopped"}`}>
                        {snapshot.status}
                    </span>
                    {peerLine?.serverVersion && (
                        <span className="libp2p-status" title="Remote server version">{peerLine.serverVersion}</span>
                    )}
                    {peerLine?.pnetMode && (
                        <span className={`libp2p-status orbitdb-server-pnet--${peerLine.pnetMode}`} title={`pnet ${peerLine.pnetMode}`}>
                            {peerLine.pnetMode === "private" ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />} {peerLine.pnetMode}
                        </span>
                    )}
                </div>
                <div className="libp2p-header-actions">
                    <button
                        type="button"
                        className="libp2p-status libp2p-status--ai"
                        title="Open orbitdb-server AI bot"
                        onClick={openChatBot}
                    >
                        <Bot size={11} />
                    </button>
                </div>
            </div>

            {/* ── Tab strip ───────────────────────── */}
            <div className="libp2p-tabs">
                {nodes.map((n) => (
                    <button
                        key={n.nodeId}
                        type="button"
                        onClick={() => setActive(n.nodeId)}
                        className={`libp2p-tab${n.nodeId === activeId ? " libp2p-tab--active" : ""}`}
                        title={`${n.label} — ${n.status} — ${n.endpoint}`}
                    >
                        <span className={`libp2p-tab-dot libp2p-tab-dot--${n.status === "connected" ? "running" : n.status === "connecting" ? "starting" : n.status === "error" ? "error" : "stopped"}`} />
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
                    title="Add orbitdb-server endpoint"
                >
                    <Plus size={11} />
                </button>
            </div>

            {/* ── Control row ────────────────────── */}
            <div className="libp2p-control-row orbitdb-server-control-row">
                <div className="orbitdb-server-field">
                    <label htmlFor="obs-name">Name</label>
                    {renaming ? (
                        <input
                            id="obs-name"
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

                <div className="orbitdb-server-field orbitdb-server-field--grow">
                    <label htmlFor="obs-url"><Globe size={10} style={{ verticalAlign: "-1px", marginRight: 4 }} />API URL</label>
                    <input
                        id="obs-url"
                        className="libp2p-input"
                        value={urlDraft}
                        placeholder="http://127.0.0.1:3000"
                        onChange={(e) => setUrlDraft(e.target.value)}
                        disabled={isConnected || isBusy}
                        spellCheck={false}
                    />
                </div>

                <div className="orbitdb-server-actions">
                    {!isConnected ? (
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--primary"
                            onClick={onConnect}
                            disabled={isBusy}
                        >
                            <Cloud size={11} /> {isBusy ? "Connecting…" : "Connect"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="libp2p-btn"
                            onClick={onDisconnect}
                        >
                            <CloudOff size={11} /> Disconnect
                        </button>
                    )}
                    <button
                        type="button"
                        className={`libp2p-btn libp2p-btn--ghost${snapshot.authorization ? " libp2p-btn--active" : ""}`}
                        onClick={() => setShowAuth((v) => !v)}
                        title={snapshot.authorization ? "Auth header saved — click to edit" : "Set auth header"}
                    >
                        <KeyRound size={11} />
                        {snapshot.authorization && <span className="orbitdb-server-auth-dot" aria-hidden="true" />}
                    </button>
                </div>
            </div>

            {showAuth && (
                <div className="libp2p-control-row orbitdb-server-auth-row">
                    <div className="orbitdb-server-field orbitdb-server-field--grow">
                        <label htmlFor="obs-auth">
                            Authorization header (sent verbatim){snapshot.authorization ? " — saved" : ""}
                        </label>
                        <div className="orbitdb-server-auth-input-wrap">
                            <input
                                id="obs-auth"
                                className="libp2p-input"
                                type={revealAuth ? "text" : "password"}
                                value={authDraft}
                                placeholder="Bearer … or paste a raw token (Bearer will be added)"
                                onChange={(e) => setAuthDraft(e.target.value)}
                                disabled={isConnected || isBusy}
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <button
                                type="button"
                                className="orbitdb-server-auth-reveal"
                                onClick={() => setRevealAuth((v) => !v)}
                                tabIndex={-1}
                            >
                                {revealAuth ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="libp2p-btn"
                        onClick={onSaveEndpoint}
                        disabled={isConnected || isBusy}
                    >Save</button>
                    {snapshot.authorization && (
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={() => {
                                setAuthDraft("");
                                try {
                                    orbitdbServerService.setConfig(activeId ?? undefined, { authorization: null });
                                    addLog("Auth header cleared");
                                } catch (err) {
                                    addLog(err instanceof Error ? err.message : String(err), "error");
                                }
                            }}
                            disabled={isConnected || isBusy}
                        >Clear</button>
                    )}
                </div>
            )}

            {snapshot.error && (
                <div className="libp2p-error orbitdb-server-error">
                    {snapshot.error.includes("CORS") ? (
                        <>
                            <strong>Connection blocked by CORS.</strong>
                            <div>
                                The remote server is not allowing this origin. Configure CORS on the server
                                (allow this origin, methods <code>GET/POST/PUT/DELETE/OPTIONS</code>, and the
                                <code>Authorization</code> header) and restart it. Bearer-token auth is
                                independent of CORS and still required.
                            </div>
                        </>
                    ) : /unauthor|401/i.test(snapshot.error) ? (
                        <>
                            <strong>Unauthorized (401).</strong>
                            <div>Check that the bearer token is current and matches what the server expects.</div>
                        </>
                    ) : (
                        snapshot.error
                    )}
                </div>
            )}

            {peerLine && (
                <div className="orbitdb-server-peer-bar">
                    <span className="orbitdb-server-peer-bar__label"><Hash size={10} /> Peer</span>
                    <code className="orbitdb-server-peer-bar__id" title={peerLine.peerId}>{peerLine.peerId || "(no peer id)"}</code>
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={() => copy(peerLine.peerId)}
                        title="Copy peer id"
                        disabled={!peerLine.peerId}
                    >
                        <Copy size={10} />
                    </button>
                    {peerLine.did && (
                        <>
                            <span className="orbitdb-server-peer-bar__label"><KeyIcon size={10} /> DID</span>
                            <code className="orbitdb-server-peer-bar__id" title={peerLine.did}>{truncate(peerLine.did, 32)}</code>
                            <button
                                type="button"
                                className="libp2p-btn libp2p-btn--ghost"
                                onClick={() => copy(peerLine.did ?? "")}
                            >
                                <Copy size={10} />
                            </button>
                        </>
                    )}
                    {typeof peerLine.connectedPeers === "number" && (
                        <span className="orbitdb-server-peer-bar__meta">peers: {peerLine.connectedPeers}</span>
                    )}
                    <span className="orbitdb-server-peer-bar__meta">pnet: {pnetMode}</span>
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={onRefreshIdentity}
                        disabled={!isConnected}
                        title="Refresh remote identity"
                    >
                        <RefreshCw size={10} />
                    </button>
                </div>
            )}

            {/* ── Body: two columns ────────────── */}
            <div className="orbitdb-server-body">
                {/* Left: databases */}
                <section className="orbitdb-server-panel">
                    <header className="orbitdb-server-panel__head">
                        <span><Database size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Databases ({snapshot.databases.length})</span>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={onListDbs}
                            disabled={!isConnected}
                            title="Refresh database list from server"
                        >
                            <RefreshCw size={11} />
                        </button>
                    </header>
                    <div className="orbitdb-server-panel__body">
                        <div className="orbitdb-server-create-row">
                            <input
                                className="libp2p-input"
                                placeholder="new-database-name"
                                value={newDbName}
                                onChange={(e) => setNewDbName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") onCreateDb(); }}
                                disabled={!isConnected}
                                spellCheck={false}
                            />
                            <select
                                className="libp2p-input"
                                value={newDbType}
                                onChange={(e) => setNewDbType(e.target.value as OrbitdbServerStoreType)}
                                disabled={!isConnected}
                            >
                                {ORBITDB_SERVER_STORE_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="libp2p-btn libp2p-btn--primary"
                                onClick={onCreateDb}
                                disabled={!isConnected || !newDbName.trim()}
                                title="Create / open database"
                            >
                                <PlusSquare size={11} /> Open
                            </button>
                        </div>

                        <div className="orbitdb-server-db-list">
                            {snapshot.databases.length === 0 && (
                                <div className="orbitdb-server-entries__empty">No databases opened yet.</div>
                            )}
                            {snapshot.databases.map((db) => (
                                <div
                                    key={db.name}
                                    className={`orbitdb-server-db-row${selected?.name === db.name ? " orbitdb-server-db-row--active" : ""}`}
                                    onClick={() => setSelectedDb(db.name)}
                                >
                                    <div className="orbitdb-server-db-row__head">
                                        <span className="orbitdb-server-db-row__name">{db.name}</span>
                                        <span className={`orbitdb-server-type-badge orbitdb-server-type-badge--${db.type}`}>{db.type}</span>
                                        {!db.confirmedOnServer && (
                                            <span className="orbitdb-server-type-badge orbitdb-server-type-badge--pending">local</span>
                                        )}
                                    </div>
                                    <div className="orbitdb-server-db-row__meta">
                                        {typeof db.entryCount === "number" && <span>{db.entryCount} entries</span>}
                                        {db.lastActivityAt && <span>· {new Date(db.lastActivityAt).toLocaleTimeString()}</span>}
                                    </div>
                                    <div className="orbitdb-server-db-row__actions">
                                        <button
                                            type="button"
                                            className="libp2p-btn libp2p-btn--ghost"
                                            onClick={(e) => { e.stopPropagation(); copy(db.name); }}
                                            title="Copy db name"
                                        >
                                            <Copy size={10} />
                                        </button>
                                        <button
                                            type="button"
                                            className="libp2p-btn libp2p-btn--ghost"
                                            onClick={(e) => { e.stopPropagation(); onDropDb(db.name); }}
                                            disabled={!isConnected}
                                            title="Drop database"
                                        >
                                            <Trash size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Right: entries / write / query */}
                <section className="orbitdb-server-panel">
                    <header className="orbitdb-server-panel__head">
                        <span>
                            <FileText size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                            {selected ? `Entries · ${selected.name} (${selected.type})` : "Entries"}
                        </span>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={onAll}
                            disabled={!isConnected || !selected}
                            title="Fetch all entries"
                        >
                            <RefreshCw size={11} />
                        </button>
                    </header>
                    <div className="orbitdb-server-panel__body">
                        {!selected && (
                            <div className="orbitdb-server-entries__empty">Select or open a database.</div>
                        )}

                        {selected && (
                            <>
                                <div className="orbitdb-server-write-form">
                                    {selected.type !== "events" && (
                                        <input
                                            className="libp2p-input"
                                            placeholder={selected.type === "documents" ? "_id (optional — may be inside value)" : "key"}
                                            value={putKey}
                                            onChange={(e) => setPutKey(e.target.value)}
                                            spellCheck={false}
                                        />
                                    )}
                                    <textarea
                                        className="libp2p-input orbitdb-server-textarea"
                                        placeholder={
                                            selected.type === "events"
                                                ? '{"event": "…"}  (appended to the log)'
                                                : '{"hello": "world"}'
                                        }
                                        value={putValueText}
                                        onChange={(e) => setPutValueText(e.target.value)}
                                        rows={5}
                                    />
                                    {writeError && <div className="libp2p-error">{writeError}</div>}
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--primary"
                                        onClick={onPut}
                                        disabled={!isConnected || !putValueText.trim()}
                                    >
                                        <Plus size={11} /> {selected.type === "events" ? "Append" : "Put"}
                                    </button>
                                </div>

                                {selected.type !== "events" && (
                                    <div className="orbitdb-server-get-form">
                                        <input
                                            className="libp2p-input"
                                            placeholder="key to get / delete"
                                            value={getKey}
                                            onChange={(e) => setGetKey(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") void onGet(); }}
                                            spellCheck={false}
                                        />
                                        <div className="orbitdb-server-get-actions">
                                            <button
                                                type="button"
                                                className="libp2p-btn"
                                                onClick={() => void onGet()}
                                                disabled={!isConnected || !getKey.trim()}
                                            >Get</button>
                                            <button
                                                type="button"
                                                className="libp2p-btn libp2p-btn--ghost"
                                                onClick={onDel}
                                                disabled={!isConnected || !getKey.trim()}
                                            >
                                                <Trash size={11} /> Del
                                            </button>
                                        </div>
                                        {getResult !== null && (
                                            <pre className="orbitdb-server-result">{getResult}</pre>
                                        )}
                                    </div>
                                )}

                                {selected.type === "documents" && (
                                    <div className="orbitdb-server-query-form">
                                        <header className="orbitdb-server-panel__sub">
                                            <Search size={11} /> Query (equality filter)
                                        </header>
                                        <textarea
                                            className="libp2p-input orbitdb-server-textarea"
                                            placeholder='{"role": "admin"}'
                                            value={queryFilterText}
                                            onChange={(e) => setQueryFilterText(e.target.value)}
                                            rows={3}
                                        />
                                        <button
                                            type="button"
                                            className="libp2p-btn"
                                            onClick={() => void onQuery()}
                                            disabled={!isConnected}
                                        >
                                            <Search size={11} /> Query
                                        </button>
                                        {queryResult && (
                                            <pre className="orbitdb-server-result">{JSON.stringify(queryResult, null, 2)}</pre>
                                        )}
                                    </div>
                                )}

                                {selected.preview && selected.preview.length > 0 && (
                                    <div className="orbitdb-server-preview">
                                        <header className="orbitdb-server-panel__sub">Preview ({selected.preview.length} of {selected.entryCount ?? "?"})</header>
                                        {selected.preview.map((row, i) => (
                                            <div key={`${selected.name}-${i}`} className="orbitdb-server-preview-row">
                                                {row.key && <code className="orbitdb-server-preview-key">{row.key}</code>}
                                                <pre className="orbitdb-server-preview-value">{JSON.stringify(row.value, null, 2)}</pre>
                                                {row.hash && <code className="orbitdb-server-preview-hash" title={row.hash}>{truncate(row.hash, 16)}</code>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>
            </div>

            {/* ── Swarm + pnet row ─────────────────── */}
            <div className="orbitdb-server-body">
                <section className="orbitdb-server-panel">
                    <header className="orbitdb-server-panel__head">
                        <span><Network size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Swarm ({swarmPeers.length})</span>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={() => void onSwarmPeers()}
                            disabled={!isConnected}
                        >
                            <RefreshCw size={11} />
                        </button>
                    </header>
                    <div className="orbitdb-server-panel__body">
                        <div className="orbitdb-server-create-row">
                            <input
                                className="libp2p-input"
                                placeholder="/ip4/1.2.3.4/tcp/4001/p2p/12D3…"
                                value={swarmDial}
                                onChange={(e) => setSwarmDial(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") onSwarmConnect(); }}
                                disabled={!isConnected}
                                spellCheck={false}
                            />
                            <button
                                type="button"
                                className="libp2p-btn"
                                onClick={onSwarmConnect}
                                disabled={!isConnected || !swarmDial.trim()}
                            >Dial</button>
                        </div>
                        <div className="orbitdb-server-swarm-list">
                            {swarmPeers.length === 0
                                ? <div className="orbitdb-server-entries__empty">{isConnected ? "No peers fetched yet." : "Connect to view swarm."}</div>
                                : swarmPeers.slice(0, 50).map((p, i) => (
                                    <div key={`${p.peerId}-${i}`} className="orbitdb-server-swarm-row">
                                        <code title={p.peerId}>{truncate(p.peerId || "?", 20)}</code>
                                        <span className="orbitdb-server-swarm-row__addr" title={p.addr}>{p.addr}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </section>

                <section className="orbitdb-server-panel">
                    <header className="orbitdb-server-panel__head">
                        <span><ShieldCheck size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Private network (pnet)</span>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={onPnetStatus}
                            disabled={!isConnected}
                        >
                            <RefreshCw size={11} />
                        </button>
                    </header>
                    <div className="orbitdb-server-panel__body">
                        <div className="orbitdb-server-pnet-status">
                            <span>Mode: <strong className={`orbitdb-server-pnet--${pnetMode}`}>{pnetMode}</strong></span>
                            {peerLine?.pnetFingerprint && (
                                <span>Key: <code>{truncate(peerLine.pnetFingerprint, 24)}</code></span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="libp2p-btn"
                            onClick={() => void onPnetGenerate()}
                            disabled={!isConnected}
                        >
                            <KeyIcon size={11} /> Generate swarm key
                        </button>
                        {pnetGenerated && (
                            <>
                                <div className="orbitdb-server-pnet-hint">
                                    Copy into <code>config/swarm.key</code> on the server and restart. Not auto-applied.
                                </div>
                                <pre className="orbitdb-server-pnet-key">{pnetGenerated}</pre>
                                <button
                                    type="button"
                                    className="libp2p-btn libp2p-btn--ghost"
                                    onClick={() => copy(pnetGenerated)}
                                >
                                    <Copy size={11} /> Copy
                                </button>
                            </>
                        )}
                    </div>
                </section>
            </div>

            {/* ── Log ────────────────────────────── */}
            <section className="orbitdb-server-panel">
                <header className="orbitdb-server-panel__head">
                    <span>Log</span>
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={() => setLog([])}
                        disabled={log.length === 0}
                    >
                        <Trash2 size={11} />
                    </button>
                </header>
                <div className="orbitdb-server-log">
                    {log.length === 0
                        ? <div className="orbitdb-server-entries__empty">No activity yet.</div>
                        : log.map((l, i) => (
                            <div key={`${l.ts}-${i}`} className={`orbitdb-server-log__row${l.level === "error" ? " orbitdb-server-log__row--error" : ""}`}>
                                <span className="orbitdb-server-log__time">{new Date(l.ts).toLocaleTimeString()}</span>
                                <span className="orbitdb-server-log__msg">{l.msg}</span>
                            </div>
                        ))
                    }
                </div>
            </section>
        </div>
    );
}

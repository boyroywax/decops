/**
 * KuboView — main UI surface for the Kubo IPFS Connector toolkit.
 *
 * Mirrors the helia toolkit's tab-strip + jobs-driven action pattern.
 * Each tab is a separate Kubo endpoint configuration. Connect / disconnect
 * is driven through the {@link kuboService} singleton, and commands flow
 * through the shared jobs queue so the AI bot can observe progress.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Server, Cloud, CloudOff, Plus, X, Copy, Trash2, Pin, PinOff,
    Download, FileText, Braces, Bot, RefreshCw, Upload, ListTree,
    Globe, Hash, KeyRound, Eye, EyeOff,
} from "lucide-react";
import { useKubo } from "../KuboContext";
import { kuboService } from "../service";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, JobRequest } from "@/types";
import { useChatAgentsStore } from "@/services/chat/agents";
import "../styles/kubo.css";

interface KuboViewProps {
    navigateTo?: (view: string) => void;
}

function bytesToBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let bin = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

/**
 * Normalize an auth header value: trim, and auto-prepend `Bearer ` when the
 * user pastes a raw token without a scheme. Returns "" when input is blank.
 */
function normalizeAuth(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (/^(bearer|basic|token)\s+/i.test(trimmed)) return trimmed;
    return `Bearer ${trimmed}`;
}

type AddMode = "text" | "json" | "binary";

const ADD_MODES: Array<{ id: AddMode; label: string; icon: React.ReactNode }> = [
    { id: "text", label: "Text", icon: <FileText size={11} /> },
    { id: "json", label: "JSON", icon: <Braces size={11} /> },
    { id: "binary", label: "File", icon: <Upload size={11} /> },
];

export function KuboView(_props: KuboViewProps) {
    const { snapshot, nodes, activeId, setActive, addNode, removeNode } = useKubo();
    const { addJob, jobs } = useJobsContext();

    // Endpoint config draft (URL / auth / timeout).
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

    // Add-content form
    const [addMode, setAddMode] = useState<AddMode>("text");
    const [addLabel, setAddLabel] = useState("");
    const [addText, setAddText] = useState("");
    const [addJsonText, setAddJsonText] = useState("");
    const [addPin, setAddPin] = useState(true);
    const [addError, setAddError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [pendingFile, setPendingFile] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(null);

    // Cat / ls
    const [catCid, setCatCid] = useState("");

    // Pin list (remote authoritative)
    const [remotePins, setRemotePins] = useState<Array<{ cid: string; type: string }>>([]);
    const [pinsLoading, setPinsLoading] = useState(false);

    const isConnected = snapshot.status === "connected";
    const isBusy = snapshot.status === "connecting";
    const loggedJobIds = useRef<Set<string>>(new Set());

    /** Submit a kubo command as a job, scoped to the active node. */
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

    useEffect(() => {
        const myJobs = jobs.filter((j: Job) => (j.type ?? "").startsWith("kubo_"));
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
        dispatch("kubo_connect", payload, `connect ${url}`);
    };

    const onDisconnect = () => dispatch("kubo_disconnect", {}, "disconnect");

    const onRefreshIdentity = () => dispatch("kubo_id", {}, "id refresh");

    const onSaveEndpoint = () => {
        if (snapshot.status === "connected" || snapshot.status === "connecting") {
            addLog("Disconnect before changing endpoint config", "error");
            return;
        }
        try {
            kuboService.setConfig(activeId ?? undefined, {
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
        dispatch("kubo_rename_node", { nodeId: activeId, label: next }, "rename");
        setRenaming(false);
    };

    const onAdd = () => {
        setAddError(null);
        if (!isConnected) { setAddError("Connect to a Kubo daemon first"); return; }
        const labelArg = addLabel.trim() ? { label: addLabel.trim() } : {};
        if (addMode === "text") {
            if (!addText) { setAddError("Enter some text"); return; }
            dispatch("kubo_add_text", { text: addText, pin: addPin, ...labelArg }, "add text");
            setAddText("");
            setAddLabel("");
            return;
        }
        if (addMode === "binary") {
            if (!pendingFile) { setAddError("Pick a file first"); return; }
            const b64 = bytesToBase64(pendingFile.bytes);
            dispatch(
                "kubo_add_bytes",
                { base64: b64, pin: addPin, label: addLabel.trim() || pendingFile.name },
                `add bytes (${pendingFile.name})`,
            );
            setPendingFile(null);
            setAddLabel("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        // json
        try {
            const value = JSON.parse(addJsonText);
            dispatch("kubo_add_json", { value, pin: addPin, ...labelArg }, "add json");
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
        dispatch("kubo_cat", { cid }, `cat ${cid.slice(0, 12)}…`);
        setCatCid("");
    };

    const onLs = () => {
        const cid = catCid.trim();
        if (!cid) return;
        dispatch("kubo_ls", { cid }, `ls ${cid.slice(0, 12)}…`);
    };

    const onPin = (cid: string) => dispatch("kubo_pin", { cid }, `pin ${cid.slice(0, 12)}…`);
    const onUnpin = (cid: string) => dispatch("kubo_unpin", { cid }, `unpin ${cid.slice(0, 12)}…`);
    const onClearEntries = () => dispatch("kubo_clear_entries", {}, "clear entries");

    const onRefreshPins = async () => {
        if (!isConnected) return;
        setPinsLoading(true);
        try {
            const pins = await kuboService.listPins(undefined, activeId ?? undefined);
            setRemotePins(pins);
            addLog(`Fetched ${pins.length} pin(s) from remote`);
        } catch (err) {
            addLog(err instanceof Error ? err.message : String(err), "error");
        } finally {
            setPinsLoading(false);
        }
    };

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
    const openChatBot = () => setActiveChatAgent("kubo");

    const peerLine = useMemo(() => {
        const p = snapshot.peer;
        if (!p) return null;
        return p;
    }, [snapshot.peer]);

    return (
        <div className="libp2p-view kubo-view">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="libp2p-header">
                <div className="libp2p-header-title">
                    <Server size={16} color="#06b6d4" />
                    <h2>Kubo · IPFS Connector</h2>
                </div>
                <div className="libp2p-header-center">
                    <span className={`libp2p-status libp2p-status--${snapshot.status === "connected" ? "running" : snapshot.status === "connecting" ? "starting" : snapshot.status === "error" ? "error" : "stopped"}`}>
                        {snapshot.status}
                    </span>
                    {peerLine?.agentVersion && (
                        <span className="libp2p-status" title="Remote agent version">
                            {peerLine.agentVersion}
                        </span>
                    )}
                </div>
                <div className="libp2p-header-actions">
                    <button
                        type="button"
                        className="libp2p-status libp2p-status--ai"
                        title="Open Kubo AI bot"
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
                    title="Add Kubo endpoint"
                >
                    <Plus size={11} />
                </button>
            </div>

            {/* ── Control row ───────────────────────────────────── */}
            <div className="libp2p-control-row kubo-control-row">
                <div className="kubo-field">
                    <label htmlFor="kubo-name">Name</label>
                    {renaming ? (
                        <input
                            id="kubo-name"
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

                <div className="kubo-field kubo-field--grow">
                    <label htmlFor="kubo-url"><Globe size={10} style={{ verticalAlign: "-1px", marginRight: 4 }} />API URL</label>
                    <input
                        id="kubo-url"
                        className="libp2p-input"
                        value={urlDraft}
                        placeholder="http://127.0.0.1:5001"
                        onChange={(e) => setUrlDraft(e.target.value)}
                        disabled={isConnected || isBusy}
                        spellCheck={false}
                    />
                </div>

                <div className="kubo-actions">
                    {!isConnected ? (
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--primary"
                            onClick={onConnect}
                            disabled={isBusy}
                            title="Connect to the Kubo daemon"
                        >
                            <Cloud size={11} /> {isBusy ? "Connecting…" : "Connect"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="libp2p-btn"
                            onClick={onDisconnect}
                            title="Drop the local client (remote daemon keeps running)"
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
                        {snapshot.authorization && <span className="kubo-auth-dot" aria-hidden="true" />}
                    </button>
                </div>
            </div>

            {showAuth && (
                <div className="libp2p-control-row kubo-auth-row">
                    <div className="kubo-field kubo-field--grow">
                        <label htmlFor="kubo-auth">
                            Authorization header (sent verbatim){snapshot.authorization ? " — saved" : ""}
                        </label>
                        <div className="kubo-auth-input-wrap">
                            <input
                                id="kubo-auth"
                                className="libp2p-input"
                                type={revealAuth ? "text" : "password"}
                                value={authDraft}
                                placeholder="Bearer …  or paste a raw token (Bearer will be added)"
                                onChange={(e) => setAuthDraft(e.target.value)}
                                disabled={isConnected || isBusy}
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <button
                                type="button"
                                className="kubo-auth-reveal"
                                onClick={() => setRevealAuth((v) => !v)}
                                title={revealAuth ? "Hide token" : "Reveal token"}
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
                        title="Save endpoint config"
                    >Save</button>
                    {snapshot.authorization && (
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={() => {
                                setAuthDraft("");
                                try {
                                    kuboService.setConfig(activeId ?? undefined, { authorization: null });
                                    addLog("Auth header cleared");
                                } catch (err) {
                                    addLog(err instanceof Error ? err.message : String(err), "error");
                                }
                            }}
                            disabled={isConnected || isBusy}
                            title="Clear saved auth header"
                        >Clear</button>
                    )}
                </div>
            )}

            {snapshot.error && (
                <div className="libp2p-error kubo-error">
                    {snapshot.error.startsWith("PROXY-DOWN") ? (
                        <>
                            <strong>Dev proxy not responding.</strong>
                            <div>
                                The API URL points at <code>/kubo-proxy</code> on this origin, but the dev server didn't forward the request.
                                Almost always this means the dev server was started <em>without</em> the proxy env var.
                            </div>
                            <div className="kubo-error__hint">Stop the dev server (Ctrl-C in its terminal) and restart it with:</div>
                            <pre className="kubo-error__code">{`VITE_KUBO_PROXY_TARGET=https://kubo.ipfs.dvln.net npm run dev`}</pre>
                            <div className="kubo-error__hint">
                                Then click Connect again and watch the dev-server terminal — you should see lines like
                                {" "}<code>[kubo-proxy] → POST /api/v0/id  auth=present</code>{" "}
                                followed by the upstream status. If they don't print, the env var still isn't being picked up.
                            </div>
                        </>
                    ) : snapshot.error.includes("CORS") ? (
                        <>
                            <strong>Connection blocked by CORS.</strong>
                            <div>The remote Kubo daemon is not allowing this origin. Pick one:</div>
                            <div className="kubo-error__hint"><strong>Option A —</strong> fix it on the daemon host:</div>
                            <pre className="kubo-error__code">{`ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["${typeof location !== "undefined" ? location.origin : "https://your-app.example"}"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST","PUT"]'
# then restart the daemon`}</pre>
                            <div className="kubo-error__hint"><strong>Option B —</strong> use the built-in dev proxy (no server access needed):</div>
                            <pre className="kubo-error__code">{`# stop and restart the dev server with:
VITE_KUBO_PROXY_TARGET=${snapshot.endpoint.replace(/\/$/, "")} npm run dev
# then set the API URL above to:
${typeof location !== "undefined" ? location.origin : ""}/kubo-proxy`}</pre>
                        </>
                    ) : /unauthor|401/i.test(snapshot.error) ? (
                        <>
                            <strong>Unauthorized (401).</strong>
                            <div>The request reached the server but the auth header was rejected. Check:</div>
                            <ul className="kubo-error__list">
                                <li>The token value is correct and not expired</li>
                                <li>The scheme matches what the server expects (Bearer vs Basic vs Token)</li>
                                <li>
                                    For Kubo's built-in auth (v0.27+), the server must be configured with{" "}
                                    <code>API.Authorizations</code>:
                                </li>
                            </ul>
                            <pre className="kubo-error__code">{`# Bearer:
ipfs config --json API.Authorizations.app '{"AuthSecret":"bearer:<your-token>","AllowedPaths":["/api/v0"]}'

# Basic (user:pass → base64):
ipfs config --json API.Authorizations.app '{"AuthSecret":"basic:<base64(user:pass)>","AllowedPaths":["/api/v0"]}'

# then restart the daemon`}</pre>
                            <div className="kubo-error__hint">
                                Tip: open DevTools → Network → the failed <code>/api/v0/id</code> request → Request Headers, and confirm the <code>Authorization</code> header value matches what you saved above.
                            </div>
                        </>
                    ) : (
                        snapshot.error
                    )}
                </div>
            )}

            {peerLine && (
                <div className="kubo-peer-bar">
                    <span className="kubo-peer-bar__label"><Hash size={10} /> Peer</span>
                    <code className="kubo-peer-bar__id" title={peerLine.peerId}>{peerLine.peerId}</code>
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={() => copy(peerLine.peerId)}
                        title="Copy peer id"
                    >
                        <Copy size={10} />
                    </button>
                    {typeof peerLine.connectedPeers === "number" && (
                        <span className="kubo-peer-bar__meta">peers: {peerLine.connectedPeers}</span>
                    )}
                    <button
                        type="button"
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={onRefreshIdentity}
                        disabled={!isConnected}
                        title="Refresh remote identity (id + peers)"
                    >
                        <RefreshCw size={10} />
                    </button>
                </div>
            )}

            {/* ── Body: two columns ─────────────────────────────── */}
            <div className="kubo-body">
                {/* Left: add + cat */}
                <section className="kubo-panel">
                    <header className="kubo-panel__head">
                        <span><Upload size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Add to IPFS</span>
                        <div className="kubo-mode-toggle">
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
                    <div className="kubo-panel__body">
                        <input
                            className="libp2p-input"
                            placeholder="Label / file name (optional)"
                            value={addLabel}
                            onChange={(e) => setAddLabel(e.target.value)}
                            disabled={!isConnected}
                        />
                        {addMode === "text" && (
                            <textarea
                                className="libp2p-input kubo-textarea"
                                placeholder="UTF-8 content…"
                                value={addText}
                                onChange={(e) => setAddText(e.target.value)}
                                disabled={!isConnected}
                                rows={6}
                            />
                        )}
                        {addMode === "json" && (
                            <textarea
                                className="libp2p-input kubo-textarea"
                                placeholder='{"hello": "world"}'
                                value={addJsonText}
                                onChange={(e) => setAddJsonText(e.target.value)}
                                disabled={!isConnected}
                                rows={6}
                            />
                        )}
                        {addMode === "binary" && (
                            <div className="kubo-file-row">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="libp2p-input"
                                    disabled={!isConnected}
                                    onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
                                />
                                {pendingFile && (
                                    <div className="kubo-entry__meta">
                                        <span className="kubo-entry__label">{pendingFile.name}</span>
                                        <span>{fmtBytes(pendingFile.size)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        <label className="kubo-pin-toggle">
                            <input
                                type="checkbox"
                                checked={addPin}
                                onChange={(e) => setAddPin(e.target.checked)}
                                disabled={!isConnected}
                            />
                            <Pin size={10} /> Pin on remote node
                        </label>
                        {addError && <div className="libp2p-error">{addError}</div>}
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--primary"
                            onClick={onAdd}
                            disabled={!isConnected || (addMode === "binary" && !pendingFile)}
                        >
                            <Plus size={11} /> Add → CID
                        </button>
                    </div>

                    <header className="kubo-panel__head">
                        <span><Download size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Fetch by CID</span>
                    </header>
                    <div className="kubo-panel__body kubo-cat-row">
                        <input
                            className="libp2p-input"
                            placeholder="bafy… / Qm… / /ipfs/CID/path"
                            value={catCid}
                            onChange={(e) => setCatCid(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") onCat(); }}
                            disabled={!isConnected}
                        />
                        <div className="kubo-cat-actions">
                            <button
                                type="button"
                                className="libp2p-btn"
                                onClick={() => onCat()}
                                disabled={!isConnected || !catCid.trim()}
                                title="Fetch as UTF-8 text"
                            >
                                <Download size={11} /> Cat
                            </button>
                            <button
                                type="button"
                                className="libp2p-btn"
                                onClick={onLs}
                                disabled={!isConnected || !catCid.trim()}
                                title="List directory entries"
                            >
                                <ListTree size={11} /> ls
                            </button>
                            <button
                                type="button"
                                className="libp2p-btn"
                                onClick={() => catCid.trim() && onPin(catCid.trim())}
                                disabled={!isConnected || !catCid.trim()}
                                title="Pin this CID on the remote node"
                            >
                                <Pin size={11} /> Pin
                            </button>
                        </div>
                    </div>
                </section>

                {/* Right: entries + remote pins */}
                <section className="kubo-panel">
                    <header className="kubo-panel__head">
                        <span>
                            <ListTree size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                            Activity ({snapshot.entries.length}) · {snapshot.pinnedCount} pinned · {fmtBytes(snapshot.totalBytes)}
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
                    <div className="kubo-entries">
                        {snapshot.entries.length === 0 && (
                            <div className="kubo-entries__empty">No activity yet — add content or fetch a CID.</div>
                        )}
                        {snapshot.entries.map((e) => (
                            <div key={e.cid} className="kubo-entry">
                                <div className="kubo-entry__head">
                                    <code className="kubo-entry__cid" title={e.cid}>{e.cid}</code>
                                    <span className={`kubo-entry__badge kubo-entry__badge--${e.source}`}>
                                        {e.source}
                                    </span>
                                    {e.pinned && <span className="kubo-entry__badge kubo-entry__badge--pinned">pinned</span>}
                                </div>
                                <div className="kubo-entry__meta">
                                    {e.label && <span className="kubo-entry__label">{e.label}</span>}
                                    {typeof e.bytes === "number" && <span>{fmtBytes(e.bytes)}</span>}
                                    <span>{new Date(e.addedAt).toLocaleTimeString()}</span>
                                </div>
                                {e.preview && (
                                    <pre className="kubo-entry__preview">{e.preview}</pre>
                                )}
                                <div className="kubo-entry__actions">
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
                                            disabled={!isConnected}
                                            title="Unpin"
                                        >
                                            <PinOff size={10} /> Unpin
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="libp2p-btn libp2p-btn--ghost"
                                            onClick={() => onPin(e.cid)}
                                            disabled={!isConnected}
                                            title="Pin"
                                        >
                                            <Pin size={10} /> Pin
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => onCat(e.cid)}
                                        disabled={!isConnected}
                                        title="Re-fetch"
                                    >
                                        <Download size={10} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <header className="kubo-panel__head">
                        <span><Pin size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Remote pins ({remotePins.length})</span>
                        <button
                            type="button"
                            className="libp2p-btn libp2p-btn--ghost"
                            onClick={onRefreshPins}
                            disabled={!isConnected || pinsLoading}
                            title="Refresh pin list from remote daemon"
                        >
                            <RefreshCw size={11} />
                        </button>
                    </header>
                    <div className="kubo-pins">
                        {remotePins.length === 0
                            ? <div className="kubo-entries__empty">{isConnected ? "No pins or list not fetched yet." : "Connect to view remote pins."}</div>
                            : remotePins.slice(0, 50).map((p) => (
                                <div key={p.cid} className="kubo-pin-row">
                                    <code className="kubo-entry__cid" title={p.cid}>{p.cid}</code>
                                    <span className="kubo-entry__badge">{p.type}</span>
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => copy(p.cid)}
                                        title="Copy CID"
                                    >
                                        <Copy size={10} />
                                    </button>
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => onCat(p.cid)}
                                        title="Cat"
                                    >
                                        <Download size={10} />
                                    </button>
                                    <button
                                        type="button"
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => onUnpin(p.cid)}
                                        title="Unpin"
                                    >
                                        <PinOff size={10} />
                                    </button>
                                </div>
                            ))
                        }
                        {remotePins.length > 50 && (
                            <div className="kubo-entries__empty">… {remotePins.length - 50} more</div>
                        )}
                    </div>
                </section>
            </div>

            {/* ── Activity log ──────────────────────────────────── */}
            <section className="kubo-panel">
                <header className="kubo-panel__head">
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
                <div className="kubo-log">
                    {log.length === 0
                        ? <div className="kubo-entries__empty">No activity yet.</div>
                        : log.map((l, i) => (
                            <div key={`${l.ts}-${i}`} className={`kubo-log__row${l.level === "error" ? " kubo-log__row--error" : ""}`}>
                                <span className="kubo-log__time">{new Date(l.ts).toLocaleTimeString()}</span>
                                <span className="kubo-log__msg">{l.msg}</span>
                            </div>
                        ))
                    }
                </div>
            </section>
        </div>
    );
}

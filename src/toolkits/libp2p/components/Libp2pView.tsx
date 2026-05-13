/**
 * Libp2pView — main UI surface for the libp2p toolkit.
 *
 * Supports multiple libp2p nodes via a tab strip. All actions
 * (start/stop/dial/ping/hangup/pubsub/identity) are dispatched
 * through the job creator so they land in the queue, get a timeline
 * entry, and surface in the notebook just like every other toolkit
 * command. Identity import/export lets the user persist or share
 * a node's peer key.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Globe, Power, PowerOff, Link2, Trash2,
    Wifi, WifiOff, RefreshCw, Copy, AlertTriangle, Activity,
    Plus, X, KeyRound, Download, Upload, Sparkles, BookUser,
    Settings2, Check, Square, Bot, Network, Lock, Unlock, UserPlus,
} from "lucide-react";
import { useLibp2p } from "../Libp2pContext";
import { DEFAULT_BOOTSTRAP, libp2pService } from "../service";
import type { Libp2pServiceToggles, Libp2pDiscoveryToggles, Libp2pTransportToggles } from "../service";
import { logAudit } from "@/services/logging";
import { useJobsContext } from "@/context/JobsContext";
import type { JobRequest } from "@/types";
import { Libp2pCollectionsModal, type CollectionsTab } from "./Libp2pCollectionsModal";
import { Libp2pNetworksModal } from "./Libp2pNetworksModal";
import { useLibp2pCollections, decryptIdentity, encryptIdentity, decryptPnetKey } from "../utils/collections";
import { PubsubPanel } from "./PubsubPanel";
import { useChatAgentsStore } from "@/services/chat/agents";
import { useCommandCtx } from "@/context/CommandContextProvider";
import "../styles/libp2p.css";

interface Libp2pViewProps {
    navigateTo?: (view: string) => void;
}

export function Libp2pView(_props: Libp2pViewProps) {
    const { snapshot, nodes, activeId, setActive, addNode, removeNode } = useLibp2p();
    const { addJob, jobs } = useJobsContext();
    const contacts = useLibp2pCollections((s) => s.contacts);
    const vault = useLibp2pCollections((s) => s.vault);

    const [dialTarget, setDialTarget] = useState("");
    const [log, setLog] = useState<{ ts: number; msg: string; level: "info" | "error" }[]>([]);

    // ── Start options (toggles for transports / services / discovery / bootstrap) ──
    const [services, setServices] = useState<Required<Libp2pServiceToggles>>({
        identify: true,
        ping: true,
        dcutr: true,
        pubsub: true,
        kadDht: false,
    });
    const [discovery, setDiscovery] = useState<Required<Libp2pDiscoveryToggles>>({
        bootstrap: true,
        pubsubPeerDiscovery: true,
    });
    const [transports, setTransports] = useState<Required<Libp2pTransportToggles>>({
        webSockets: true,
        webRTC: true,
        circuitRelay: true,
    });
    const [disabledBootstrap, setDisabledBootstrap] = useState<Set<string>>(new Set());
    const [extraBootstrap, setExtraBootstrap] = useState<string[]>([]);
    const [bootstrapInput, setBootstrapInput] = useState("");
    const [showContactPicker, setShowContactPicker] = useState(false);
    const toggleBootstrap = (addr: string) =>
        setDisabledBootstrap((s) => {
            const next = new Set(s);
            if (next.has(addr)) next.delete(addr);
            else next.add(addr);
            return next;
        });
    const transportCount =
        (transports.webSockets ? 1 : 0) + (transports.webRTC ? 1 : 0) + (transports.circuitRelay ? 1 : 0);
    const allBootstrap = useMemo(
        () => [...DEFAULT_BOOTSTRAP, ...extraBootstrap],
        [extraBootstrap],
    );
    const enabledBootstrapCount = allBootstrap.length - disabledBootstrap.size;
    const addBootstrap = (addr: string) => {
        const trimmed = addr.trim();
        if (!trimmed) return;
        if (!trimmed.startsWith("/")) {
            addLog("Bootstrap entry must be a multiaddr (start with '/')", "error");
            return;
        }
        if (allBootstrap.includes(trimmed)) {
            addLog("Bootstrap entry already in the list", "error");
            return;
        }
        setExtraBootstrap((prev) => [...prev, trimmed]);
        // Newly added entries default to enabled.
        setDisabledBootstrap((s) => {
            if (!s.has(trimmed)) return s;
            const next = new Set(s);
            next.delete(trimmed);
            return next;
        });
    };
    const removeBootstrap = (addr: string) => {
        setExtraBootstrap((prev) => prev.filter((a) => a !== addr));
        setDisabledBootstrap((s) => {
            if (!s.has(addr)) return s;
            const next = new Set(s);
            next.delete(addr);
            return next;
        });
    };

    // Identity panel local UI state
    const [showImport, setShowImport] = useState(false);
    const [importKey, setImportKey] = useState("");
    const [showVaultPicker, setShowVaultPicker] = useState(false);
    const [vaultEntryId, setVaultEntryId] = useState("");
    const [vaultPassphrase, setVaultPassphrase] = useState("");
    const [vaultBusy, setVaultBusy] = useState(false);
    const [vaultError, setVaultError] = useState<string | null>(null);
    // Export — download-encrypted prompt
    const [exportModalOpen, setExportModalOpen] = useState(false);
    /** What to do once the export-identity job returns the private key. */
    const [exportPending, setExportPending] = useState<"copy" | "encrypt" | null>(null);
    const [showExportPassphrase, setShowExportPassphrase] = useState(false);
    const [exportPassphrase, setExportPassphrase] = useState("");
    const [exportConfirm, setExportConfirm] = useState("");
    const [exportBusy, setExportBusy] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    // Import — encrypted-file passphrase prompt
    const [pendingEncryptedFile, setPendingEncryptedFile] = useState<
        { peerId?: string; ciphertext: string; salt: string; iv: string } | null
    >(null);
    const [filePassphrase, setFilePassphrase] = useState("");
    const [fileBusy, setFileBusy] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [exported, setExported] = useState<{ peerId: string; privateKey: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Collections modal
    const [collectionsOpen, setCollectionsOpen] = useState(false);
    const [collectionsTab, setCollectionsTab] = useState<CollectionsTab>("contacts");
    const openCollections = (tab: CollectionsTab) => {
        setCollectionsTab(tab);
        setCollectionsOpen(true);
    };

    // libp2p chat agent registration. The Bot button in the header activates
    // this agent in the unified chat panel; user input is routed through
    // NOTE: do not subscribe to the whole chat-agents store — use getState().

    // Networks (pnet) modal + per-view selection
    const [networksModalOpen, setNetworksModalOpen] = useState(false);
    const networks = useLibp2pCollections((s) => s.networks);
    const [pnetMode, setPnetMode] = useState<"public" | "private">("public");
    const [selectedPnetId, setSelectedPnetId] = useState<string>("");
    const [pnetPassphrase, setPnetPassphrase] = useState("");
    const [pnetUnlockedKey, setPnetUnlockedKey] = useState<string | null>(null);
    const [pnetUnlockedLabel, setPnetUnlockedLabel] = useState<string | null>(null);
    const [pnetError, setPnetError] = useState<string | null>(null);
    const [pnetBusy, setPnetBusy] = useState(false);

    // Auto-clear the unlocked PSK when the user switches selection / mode
    useEffect(() => {
        setPnetUnlockedKey(null);
        setPnetUnlockedLabel(null);
        setPnetError(null);
        setPnetPassphrase("");
    }, [selectedPnetId, pnetMode]);

    // Forget the unlocked key once the node stops
    useEffect(() => {
        if (snapshot.status === "stopped" || snapshot.status === "error") {
            setPnetUnlockedKey(null);
            setPnetUnlockedLabel(null);
        }
    }, [snapshot.status]);

    const handleUnlockPnet = async () => {
        setPnetError(null);
        const entry = networks.find((n) => n.id === selectedPnetId);
        if (!entry) { setPnetError("Select a network first"); return; }
        if (!pnetPassphrase) { setPnetError("Passphrase is required"); return; }
        setPnetBusy(true);
        try {
            const ascii = await decryptPnetKey(entry, pnetPassphrase);
            setPnetUnlockedKey(ascii);
            setPnetUnlockedLabel(entry.label);
            setPnetPassphrase("");
            addLog(`Unlocked private network "${entry.label}"`);
        } catch (err: any) {
            setPnetError(err?.message ?? String(err));
        } finally {
            setPnetBusy(false);
        }
    };

    const handleLockPnet = () => {
        setPnetUnlockedKey(null);
        setPnetUnlockedLabel(null);
        setPnetError(null);
    };

    const addLog = (msg: string, level: "info" | "error" = "info") =>
        setLog((l) => [{ ts: Date.now(), msg, level }, ...l].slice(0, 100));

    const isRunning = snapshot.status === "running";

    /** Submit a libp2p command as a job, scoped to the active node. */
    const dispatch = (
        type: string,
        request: Record<string, any> = {},
        label?: string,
    ) => {
        const payload = activeId ? { ...request, nodeId: activeId } : request;
        const job = addJob({ type, request: payload } as JobRequest);
        addLog(`Queued ${label ?? type}${job?.id ? ` (job ${job.id.slice(4, 12)}…)` : ""}`);
        return job;
    };

    const peers = useMemo(() => {
        return [...snapshot.peers].sort((a, b) =>
            (b.connected ? 1 : 0) - (a.connected ? 1 : 0) ||
            a.id.localeCompare(b.id),
        );
    }, [snapshot.peers]);

    const connectedCount = peers.filter((p) => p.connected).length;

    /** True while a libp2p job is queued or running. */
    const busy = useMemo(() => {
        return jobs.some((j: any) =>
            typeof j.type === "string" &&
            j.type.startsWith("libp2p_") &&
            (j.status === "queued" || j.status === "running"),
        );
    }, [jobs]);

    // Surface job results into the local activity log.
    useEffect(() => {
        const recent = jobs
            .filter((j: any) =>
                typeof j.type === "string" &&
                j.type.startsWith("libp2p_") &&
                (j.status === "completed" || j.status === "failed") &&
                j.completedAt && j.completedAt > Date.now() - 10_000,
            )
            .slice(0, 5);
        for (const j of recent) {
            const key = `__libp2p_logged_${j.id}`;
            if ((window as any)[key]) continue;
            (window as any)[key] = true;
            if (j.status === "completed") {
                // Capture the export-identity result so the UI can reveal it.
                const result: any = j.result;
                if (j.type === "libp2p_export_identity" && result && typeof result === "object" && result.privateKey) {
                    setExported({ peerId: result.peerId, privateKey: result.privateKey });
                }
                addLog(`${j.type} completed`);
            } else {
                if (j.type === "libp2p_export_identity") {
                    // Surface the failure inside the export modal and let the
                    // user retry/cancel — otherwise the "Fetching…" / "Waiting
                    // for key…" labels would hang forever.
                    setExportError(
                        typeof j.result === "string"
                            ? j.result
                            : "Export failed — start the node or load an identity first",
                    );
                    setExportPending(null);
                }
                addLog(`${j.type} failed: ${j.result ?? "unknown error"}`, "error");
            }
        }
    }, [jobs]);

    useEffect(() => {
        if (snapshot.error) addLog(snapshot.error, "error");
    }, [snapshot.error]);

    // ── Action handlers ──
    const handleStart = () => {
        if (transportCount === 0) {
            addLog("Enable at least one transport before starting", "error");
            return;
        }
        if (pnetMode === "private" && !pnetUnlockedKey) {
            addLog("Unlock a private network before starting, or switch to the public network", "error");
            return;
        }
        dispatch(
            "libp2p_start",
            {
                services,
                discovery,
                transports,
                bootstrap: allBootstrap,
                disabledBootstrap: Array.from(disabledBootstrap),
                pnetKey: pnetMode === "private" ? pnetUnlockedKey ?? undefined : undefined,
            },
            `start ${snapshot.label}`,
        );
    };
    const handleStop = () => dispatch("libp2p_stop", {}, `stop ${snapshot.label}`);

    const handleDial = () => {
        if (!dialTarget.trim()) return;
        dispatch("libp2p_dial", { target: dialTarget.trim() }, `dial ${dialTarget.trim().slice(0, 24)}…`);
        setDialTarget("");
    };

    const handlePing = (peerId: string) =>
        dispatch("libp2p_ping", { peerId }, `ping ${peerId.slice(0, 12)}…`);

    const handleHangUp = (peerId: string) =>
        dispatch("libp2p_hangup", { peerId }, `hangup ${peerId.slice(0, 12)}…`);

    const handleClearPeers = () => dispatch("libp2p_clear_peers", {}, "clear peer book");

    // ── Identity handlers ──
    const handleGenerateIdentity = () => {
        setExported(null);
        dispatch("libp2p_generate_identity", {}, "generate identity");
    };
    const handleExportIdentity = () => {
        // Open the modal first; the actual export job is only dispatched
        // once the user picks an option (copy base64 vs download encrypted).
        setExported(null);
        setExportPending(null);
        setShowExportPassphrase(false);
        setExportPassphrase("");
        setExportConfirm("");
        setExportError(null);
        setExportModalOpen(true);
    };
    const closeExportModal = () => {
        setExportModalOpen(false);
        setExported(null);
        setExportPending(null);
        setShowExportPassphrase(false);
        setExportPassphrase("");
        setExportConfirm("");
        setExportError(null);
    };
    const requestExport = async (action: "copy" | "encrypt") => {
        setExportError(null);
        setExportPending(action);
        try {
            const result = await libp2pService.exportIdentity();
            logAudit("libp2p.identity.export", {
                peerId: result.peerId,
                surface: action === "copy" ? "ui-copy" : "ui-encrypt-download",
                initiatedBy: "user",
                timestamp: new Date().toISOString(),
            });
            if (action === "copy") {
                // Clipboard writes require a fresh user gesture — keep the
                // service call inside the click handler chain.
                await navigator.clipboard.writeText(result.privateKey);
                addLog(`Copied base64 private key for ${result.peerId.slice(0, 16)}… to clipboard`);
                setExportPending(null);
                setExportModalOpen(false);
                setExported(null);
                return;
            }
            // Encrypted-download: stash the key and reveal the passphrase form.
            setExported({ peerId: result.peerId, privateKey: result.privateKey });
            setExportPending(null);
            setShowExportPassphrase(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setExportError(msg || "Failed to export identity");
            setExportPending(null);
        }
    };
    const handleClearIdentity = () => {
        setExported(null);
        dispatch("libp2p_clear_identity", {}, "clear identity");
    };
    const handleSubmitImport = () => {
        if (!importKey.trim()) return;
        dispatch("libp2p_import_identity", { privateKey: importKey.trim() }, "import identity");
        setImportKey("");
        setShowImport(false);
    };
    const handleLoadFromVault = async () => {
        if (!vaultEntryId) return;
        const entry = vault.find((v) => v.id === vaultEntryId);
        if (!entry) {
            setVaultError("Vault entry not found");
            return;
        }
        try {
            setVaultBusy(true);
            setVaultError(null);
            const privateKey = await decryptIdentity(entry, vaultPassphrase);
            dispatch("libp2p_import_identity", { privateKey }, `load identity from vault (${entry.label})`);
            setVaultPassphrase("");
            setVaultEntryId("");
            setShowVaultPicker(false);
        } catch (err) {
            setVaultError(err instanceof Error ? err.message : String(err));
        } finally {
            setVaultBusy(false);
        }
    };
    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = String(reader.result ?? "").trim();
                if (text.startsWith("{")) {
                    const parsed = JSON.parse(text);
                    // Encrypted export: contains ciphertext + salt + iv.
                    if (parsed.ciphertext && parsed.salt && parsed.iv) {
                        setPendingEncryptedFile({
                            peerId: parsed.peerId,
                            ciphertext: parsed.ciphertext,
                            salt: parsed.salt,
                            iv: parsed.iv,
                        });
                        setFilePassphrase("");
                        setFileError(null);
                        return;
                    }
                    const key = parsed.privateKey ?? parsed.key ?? "";
                    if (!key) throw new Error("no privateKey or ciphertext field in file");
                    setImportKey(key);
                    setShowImport(true);
                    return;
                }
                // Raw base64 fallback.
                if (!text) throw new Error("empty file");
                setImportKey(text);
                setShowImport(true);
            } catch (err) {
                addLog(`Failed to read identity file: ${err instanceof Error ? err.message : err}`, "error");
            }
        };
        reader.readAsText(file);
    };
    const handleDecryptImportedFile = async () => {
        if (!pendingEncryptedFile) return;
        try {
            setFileBusy(true);
            setFileError(null);
            const privateKey = await decryptIdentity(pendingEncryptedFile, filePassphrase);
            dispatch("libp2p_import_identity", { privateKey }, "import identity (encrypted file)");
            setPendingEncryptedFile(null);
            setFilePassphrase("");
        } catch (err) {
            setFileError(err instanceof Error ? err.message : String(err));
        } finally {
            setFileBusy(false);
        }
    };
    const handleDownloadEncrypted = async () => {
        if (!exported) return;
        if (exportPassphrase.length < 8) {
            setExportError("Passphrase must be at least 8 characters");
            return;
        }
        if (exportPassphrase !== exportConfirm) {
            setExportError("Passphrases do not match");
            return;
        }
        try {
            setExportBusy(true);
            setExportError(null);
            const enc = await encryptIdentity(exported.privateKey, exportPassphrase);
            const payload = JSON.stringify({
                type: "libp2p-identity-encrypted",
                peerId: exported.peerId,
                ciphertext: enc.ciphertext,
                salt: enc.salt,
                iv: enc.iv,
                exportedAt: new Date().toISOString(),
            }, null, 2);
            const blob = new Blob([payload], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${exported.peerId.slice(0, 16)}.libp2p-identity.enc.json`;
            a.click();
            URL.revokeObjectURL(url);
            setShowExportPassphrase(false);
            setExportPassphrase("");
            setExportConfirm("");
            setExportPending(null);
            setExportModalOpen(false);
            setExported(null);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : String(err));
        } finally {
            setExportBusy(false);
        }
    };

    // ── Node management ──
    const handleAddNode = () => {
        const id = addNode();
        addLog(`Added node (${id})`);
    };
    const handleRemoveNode = async (id: string, label: string) => {
        if (nodes.length <= 1) {
            addLog("Cannot remove the last node", "error");
            return;
        }
        await removeNode(id);
        addLog(`Removed ${label}`);
    };

    const copy = (text: string) => {
        try { navigator.clipboard?.writeText(text); } catch { /* noop */ }
    };

    // Use the service directly to render up-to-date status badges in tabs
    // (avoids extra prop drilling — the snapshot list already includes them).
    void libp2pService;

    return (
        <div className="libp2p-view">
            <header className="libp2p-header">
                <div className="libp2p-header-title">
                    <Globe size={18} />
                    <h2>libp2p</h2>
                    <button
                        type="button"
                        className={`libp2p-status libp2p-status--${snapshot.status} libp2p-status--ai`}
                        onClick={() => useChatAgentsStore.getState().open("libp2p")}
                        title="Open the libp2p AI agent in chat"
                        aria-label="Open libp2p AI agent in chat"
                    >
                        <Bot size={12} />
                    </button>
                </div>
                <div className="libp2p-header-center">
                    <button
                        className="libp2p-btn"
                        onClick={() => openCollections("contacts")}
                        title="Open the peer contact book"
                    >
                        <BookUser size={14} /> Contacts
                    </button>
                    <button
                        className="libp2p-btn"
                        onClick={() => openCollections("vault")}
                        title="Open the encrypted identity vault"
                    >
                        <KeyRound size={14} /> Vault
                    </button>
                    <button
                        className="libp2p-btn"
                        onClick={() => setNetworksModalOpen(true)}
                        title="Manage private network keys"
                    >
                        <Network size={14} /> Networks
                        {networks.length > 0 && (
                            <span className="libp2p-badge libp2p-badge--count">{networks.length}</span>
                        )}
                    </button>
                </div>
                <div className="libp2p-header-actions">
                    <button
                        className="libp2p-btn libp2p-btn--icon"
                        onClick={handleAddNode}
                        title="Spawn a new libp2p node"
                        aria-label="Add node"
                    >
                        <Plus size={14} />
                    </button>
                    {!isRunning ? (
                        <button
                            className="libp2p-btn libp2p-btn--primary"
                            disabled={busy || snapshot.status === "starting" || !activeId || transportCount === 0 || (pnetMode === "private" && !pnetUnlockedKey)}
                            onClick={handleStart}
                            title={
                                transportCount === 0
                                    ? "Enable at least one transport in Start options"
                                    : pnetMode === "private" && !pnetUnlockedKey
                                        ? "Unlock a private network in the NETWORK panel, or switch to the public network"
                                        : undefined
                            }
                         aria-label={
                                transportCount === 0
                                    ? "Enable at least one transport in Start options"
                                    : pnetMode === "private" && !pnetUnlockedKey
                                        ? "Unlock a private network in the NETWORK panel, or switch to the public network"
                                        : undefined
                            }>
                            <Power size={14} /> Start node
                        </button>
                    ) : (
                        <button
                            className="libp2p-btn libp2p-btn--danger"
                            disabled={busy}
                            onClick={handleStop}
                        >
                            <PowerOff size={14} /> Stop node
                        </button>
                    )}
                </div>
            </header>

            {/* ── Node tabs ── */}
            <nav className="libp2p-tabs" role="tablist" aria-label="libp2p nodes">
                {nodes.map((n) => {
                    const isActive = n.nodeId === activeId;
                    return (
                        <div
                            key={n.nodeId}
                            role="tab"
                            aria-selected={isActive}
                            className={`libp2p-tab ${isActive ? "libp2p-tab--active" : ""}`}
                            onClick={() => setActive(n.nodeId)}
                        >
                            <span className="libp2p-tab-label">{n.label}</span>
                            <span className={`libp2p-tab-badge libp2p-tab-badge--${n.status}`}>
                                {n.status}
                            </span>
                            {nodes.length > 1 && (
                                <button
                                    className="libp2p-tab-close"
                                    title="Remove node"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void handleRemoveNode(n.nodeId, n.label);
                                    }} aria-label="Remove node"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </nav>

            {snapshot.error && (
                <div className="libp2p-alert">
                    <AlertTriangle size={14} /> {snapshot.error}
                </div>
            )}

            {/* ── Start options ── */}
            <section className="libp2p-panel">
                <details className="libp2p-options" open={!isRunning}>
                    <summary>
                        <Settings2 size={14} />
                        <span>Start options</span>
                        <span className="libp2p-options-summary">
                            <span className="libp2p-badge">{transportCount} transports</span>
                            <span className="libp2p-badge">
                                {Object.values(services).filter(Boolean).length} services
                            </span>
                            <span className="libp2p-badge">
                                {enabledBootstrapCount}/{allBootstrap.length} bootstrap
                            </span>
                        </span>
                    </summary>

                    {isRunning && (
                        <p className="libp2p-muted libp2p-muted--small">
                            Stop the node to apply changes — options are read at start time.
                        </p>
                    )}

                    <div className="libp2p-options-grid">
                        <div className="libp2p-options-group">
                            <h4>Transports</h4>
                            <ToggleRow
                                label="WebSockets"
                                hint="ws / wss multiaddrs"
                                checked={transports.webSockets}
                                disabled={isRunning}
                                onChange={(v) => setTransports((s) => ({ ...s, webSockets: v }))}
                            />
                            <ToggleRow
                                label="WebRTC"
                                hint="browser-to-browser"
                                checked={transports.webRTC}
                                disabled={isRunning}
                                onChange={(v) => setTransports((s) => ({ ...s, webRTC: v }))}
                            />
                            <ToggleRow
                                label="Circuit Relay v2"
                                hint="relay through public hops"
                                checked={transports.circuitRelay}
                                disabled={isRunning}
                                onChange={(v) => setTransports((s) => ({ ...s, circuitRelay: v }))}
                            />
                        </div>

                        <div className="libp2p-options-group">
                            <h4>Services</h4>
                            <ToggleRow
                                label="Identify"
                                hint="required by dcutr"
                                checked={services.identify}
                                disabled={isRunning}
                                onChange={(v) => setServices((s) => ({ ...s, identify: v, dcutr: v ? s.dcutr : false }))}
                            />
                            <ToggleRow
                                label="Ping"
                                checked={services.ping}
                                disabled={isRunning}
                                onChange={(v) => setServices((s) => ({ ...s, ping: v }))}
                            />
                            <ToggleRow
                                label="DCUtR"
                                hint="hole-punch"
                                checked={services.dcutr}
                                disabled={isRunning || !services.identify}
                                onChange={(v) => setServices((s) => ({ ...s, dcutr: v }))}
                            />
                            <ToggleRow
                                label="Pubsub (gossipsub)"
                                checked={services.pubsub}
                                disabled={isRunning}
                                onChange={(v) => setServices((s) => ({
                                    ...s, pubsub: v,
                                }))}
                            />
                            <ToggleRow
                                label="Kademlia DHT"
                                hint="client-mode"
                                checked={services.kadDht}
                                disabled={isRunning}
                                onChange={(v) => setServices((s) => ({ ...s, kadDht: v }))}
                            />
                        </div>

                        <div className="libp2p-options-group">
                            <h4>Discovery</h4>
                            <ToggleRow
                                label="Bootstrap"
                                hint="static peer list"
                                checked={discovery.bootstrap}
                                disabled={isRunning}
                                onChange={(v) => setDiscovery((s) => ({ ...s, bootstrap: v }))}
                            />
                            <ToggleRow
                                label="Pubsub peer discovery"
                                hint="needs pubsub"
                                checked={discovery.pubsubPeerDiscovery}
                                disabled={isRunning || !services.pubsub}
                                onChange={(v) => setDiscovery((s) => ({ ...s, pubsubPeerDiscovery: v }))}
                            />
                        </div>
                    </div>

                    <div className="libp2p-options-group">
                        <h4>
                            Bootstrap peers
                            <span className="libp2p-muted libp2p-muted--small">
                                {enabledBootstrapCount} of {allBootstrap.length} enabled
                            </span>
                            <button
                                type="button"
                                className="libp2p-icon-btn libp2p-icon-btn--right"
                                title={disabledBootstrap.size === 0 ? "Disable all" : "Enable all"}
                                disabled={isRunning}
                                onClick={() => setDisabledBootstrap(
                                    disabledBootstrap.size === 0 ? new Set(allBootstrap) : new Set(),
                                )} aria-label={disabledBootstrap.size === 0 ? "Disable all" : "Enable all"}
                            >
                                {disabledBootstrap.size === 0 ? <Square size={11} /> : <Check size={11} />}
                            </button>
                        </h4>
                        {!discovery.bootstrap && (
                            <p className="libp2p-muted libp2p-muted--small">
                                Bootstrap discovery is disabled — these peers will not be dialed.
                            </p>
                        )}
                        <ul className="libp2p-bootstrap-list">
                            {allBootstrap.map((addr) => {
                                const enabled = !disabledBootstrap.has(addr);
                                const isDefault = (DEFAULT_BOOTSTRAP as readonly string[]).includes(addr);
                                return (
                                    <li key={addr} className={enabled ? "" : "libp2p-bootstrap--off"}>
                                        <button
                                            type="button"
                                            className="libp2p-checkbox"
                                            disabled={isRunning}
                                            onClick={() => toggleBootstrap(addr)}
                                            title={enabled ? "Disable this bootstrap peer" : "Enable this bootstrap peer"}
                                        >
                                            {enabled ? <Check size={11} /> : <Square size={11} />}
                                        </button>
                                        <code className="libp2p-mono libp2p-mono--wrap">{addr}</code>
                                        {!isDefault && (
                                            <button
                                                type="button"
                                                className="libp2p-icon-btn"
                                                title="Remove this bootstrap peer"
                                                disabled={isRunning}
                                                onClick={() => removeBootstrap(addr)} aria-label="Remove this bootstrap peer"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        )}
                                        {isDefault && (
                                            <span className="libp2p-badge libp2p-badge--muted" title="Built-in default">
                                                default
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="libp2p-bootstrap-add">
                            <input
                                className="libp2p-input"
                                type="text"
                                placeholder="/dns4/example.com/tcp/443/wss/p2p/Qm…"
                                value={bootstrapInput}
                                disabled={isRunning}
                                onChange={(e) => setBootstrapInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addBootstrap(bootstrapInput);
                                        setBootstrapInput("");
                                    }
                                }}
                            />
                            <button
                                type="button"
                                className="libp2p-btn libp2p-btn--small"
                                disabled={isRunning || !bootstrapInput.trim()}
                                onClick={() => { addBootstrap(bootstrapInput); setBootstrapInput(""); }}
                            >
                                <Plus size={11} /> Add
                            </button>
                            <button
                                type="button"
                                className="libp2p-btn libp2p-btn--small"
                                disabled={isRunning}
                                onClick={() => setShowContactPicker((v) => !v)}
                                title="Add a bootstrap peer from the contact book"
                            >
                                <BookUser size={11} /> From contacts
                            </button>
                        </div>
                        {showContactPicker && (
                            <div className="libp2p-bootstrap-contacts">
                                {contacts.length === 0 ? (
                                    <p className="libp2p-muted libp2p-muted--small">
                                        No contacts yet — add one from the Contacts dialog.
                                    </p>
                                ) : (
                                    <ul className="libp2p-bootstrap-contact-list">
                                        {contacts.map((c) => {
                                            const addr = c.multiaddr || (c.peerId ? `/p2p/${c.peerId}` : "");
                                            const already = !!addr && allBootstrap.includes(addr);
                                            const usable = !!addr && !already;
                                            return (
                                                <li key={c.id}>
                                                    <div className="libp2p-bootstrap-contact-info">
                                                        <span className="libp2p-bootstrap-contact-name">
                                                            {c.name || c.peerId.slice(0, 12) + "…"}
                                                        </span>
                                                        <code className="libp2p-mono libp2p-mono--wrap">
                                                            {addr || "(no multiaddr)"}
                                                        </code>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="libp2p-btn libp2p-btn--small"
                                                        disabled={isRunning || !usable}
                                                        title={
                                                            !addr
                                                                ? "Contact has no multiaddr or peer id"
                                                                : already
                                                                    ? "Already in the bootstrap list"
                                                                    : "Add this contact as a bootstrap peer"
                                                        }
                                                        onClick={() => {
                                                            if (usable) addBootstrap(addr);
                                                        }} aria-label={
                                                            !addr
                                                                ? "Contact has no multiaddr or peer id"
                                                                : already
                                                                    ? "Already in the bootstrap list"
                                                                    : "Add this contact as a bootstrap peer"
                                                        }
                                                    >
                                                        <Plus size={10} /> Add
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </details>
            </section>

            {/* ── Network panel ── */}
            <section className="libp2p-panel">
                <h3>
                    <Network size={14} /> Network
                    {pnetMode === "private" && pnetUnlockedLabel && (
                        <span className="libp2p-badge libp2p-badge--ok" title="A private network key is loaded">
                            pnet: {pnetUnlockedLabel}
                        </span>
                    )}
                </h3>
                {isRunning && pnetMode === "private" && pnetUnlockedLabel ? (
                    <div className="libp2p-row">
                        <span className="libp2p-label">
                            <Lock size={12} /> Private network
                        </span>
                        <span className="libp2p-mono">{pnetUnlockedLabel}</span>
                        <span className="libp2p-muted libp2p-muted--small">
                            Stop the node to switch networks.
                        </span>
                    </div>
                ) : isRunning ? (
                    <div className="libp2p-row">
                        <span className="libp2p-label">
                            <Globe size={12} /> Public network
                        </span>
                        <span className="libp2p-muted libp2p-muted--small">
                            Stop the node to switch to a private network.
                        </span>
                    </div>
                ) : (
                <div className="libp2p-form-row libp2p-form-row--col">
                    <label className="libp2p-radio">
                        <input
                            type="radio"
                            name="libp2p-pnet-mode"
                            checked={pnetMode === "public"}
                            onChange={() => setPnetMode("public")}
                            disabled={isRunning}
                        />
                        <span>
                            <strong>Use public network</strong>
                            <span className="libp2p-muted libp2p-muted--small">
                                Peer with anyone on the global libp2p network (default).
                            </span>
                        </span>
                    </label>
                    <label className="libp2p-radio">
                        <input
                            type="radio"
                            name="libp2p-pnet-mode"
                            checked={pnetMode === "private"}
                            onChange={() => setPnetMode("private")}
                            disabled={isRunning}
                        />
                        <span>
                            <strong>Use private network (pnet)</strong>
                            <span className="libp2p-muted libp2p-muted--small">
                                Only peer with nodes sharing the same pre-shared key.
                            </span>
                        </span>
                    </label>

                    {pnetMode === "private" && (
                        <div className="libp2p-form-row libp2p-form-row--col">
                            {networks.length === 0 ? (
                                <div className="libp2p-alert">
                                    No private networks saved yet.{" "}
                                    <button
                                        className="libp2p-btn libp2p-btn--ghost"
                                        onClick={() => setNetworksModalOpen(true)}
                                    >
                                        Open Networks…
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <select
                                        className="libp2p-input"
                                        value={selectedPnetId}
                                        onChange={(e) => setSelectedPnetId(e.target.value)}
                                        disabled={isRunning || !!pnetUnlockedKey}
                                    >
                                        <option value="">— Select a private network —</option>
                                        {networks.map((n) => (
                                            <option key={n.id} value={n.id}>
                                                {n.label}{n.fingerprint ? ` (fp:${n.fingerprint})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                    {!pnetUnlockedKey ? (
                                        <>
                                            <input
                                                className="libp2p-input"
                                                type="password"
                                                placeholder="Passphrase"
                                                value={pnetPassphrase}
                                                onChange={(e) => setPnetPassphrase(e.target.value)}
                                                disabled={!selectedPnetId || isRunning}
                                            />
                                            <div className="libp2p-form-row">
                                                <button
                                                    className="libp2p-btn libp2p-btn--primary"
                                                    onClick={handleUnlockPnet}
                                                    disabled={!selectedPnetId || !pnetPassphrase || pnetBusy || isRunning}
                                                >
                                                    <Unlock size={12} /> Unlock
                                                </button>
                                            </div>
                                            {pnetError && (
                                                <div className="libp2p-alert libp2p-alert--error">{pnetError}</div>
                                            )}
                                            <span className="libp2p-muted libp2p-muted--small">
                                                The key stays in memory until the node stops or you switch selection.
                                            </span>
                                        </>
                                    ) : (
                                        <div className="libp2p-form-row">
                                            <span className="libp2p-muted">
                                                <Lock size={12} /> Key “{pnetUnlockedLabel}” is unlocked
                                            </span>
                                            <button
                                                className="libp2p-btn libp2p-btn--ghost"
                                                onClick={handleLockPnet}
                                                disabled={isRunning}
                                            >
                                                Lock
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
                )}
            </section>

            {/* ── Identity panel ── */}
            <section className="libp2p-panel">
                <h3>
                    <KeyRound size={14} /> Identity
                    {snapshot.hasPersistedIdentity && (
                        <span className="libp2p-badge libp2p-badge--ok" title="A private key is loaded for this node">
                            persisted
                        </span>
                    )}
                </h3>
                {snapshot.peerId ? (
                    <>
                        <div className="libp2p-row">
                            <span className="libp2p-label">Peer ID</span>
                            <code className="libp2p-mono libp2p-mono--wrap">{snapshot.peerId}</code>
                            <button className="libp2p-icon-btn" title="Copy" onClick={() => copy(snapshot.peerId!)} aria-label="Copy">
                                <Copy size={12} />
                            </button>
                        </div>
                        <div className="libp2p-row libp2p-row--col">
                            <span className="libp2p-label">Listen addrs</span>
                            {snapshot.multiaddrs.length === 0 ? (
                                <span className="libp2p-muted">No multiaddrs yet — waiting for relay reservation…</span>
                            ) : (
                                <ul className="libp2p-addr-list">
                                    {snapshot.multiaddrs.map((ma) => (
                                        <li key={ma}>
                                            <code className="libp2p-mono">{ma}</code>
                                            <button className="libp2p-icon-btn" title="Copy" onClick={() => copy(ma)} aria-label="Copy">
                                                <Copy size={12} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                ) : (
                    <p className="libp2p-muted">
                        {snapshot.hasPersistedIdentity
                            ? "Identity loaded — start the node to derive its peer ID."
                            : "Start the node to mint a fresh peer ID, or import an identity below."}
                    </p>
                )}

                <div className="libp2p-form-row libp2p-form-row--wrap">
                    <button
                        className="libp2p-btn"
                        onClick={handleGenerateIdentity}
                        disabled={busy || isRunning}
                        title="Stop the node first; generates a fresh Ed25519 key for the next start"
                     aria-label="Stop the node first; generates a fresh Ed25519 key for the next start">
                        <Sparkles size={12} /> Generate
                    </button>
                    <button
                        className="libp2p-btn"
                        onClick={() => setShowImport((s) => !s)}
                        disabled={busy || isRunning}
                    >
                        <Upload size={12} /> Import…
                    </button>
                    <button
                        className="libp2p-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy || isRunning}
                        title="Load an identity from a previously-exported JSON file"
                    >
                        <Upload size={12} /> From file…
                    </button>
                    <button
                        className="libp2p-btn"
                        onClick={() => {
                            setVaultError(null);
                            setShowVaultPicker((s) => !s);
                        }}
                        disabled={busy || isRunning || vault.length === 0}
                        title={vault.length === 0
                            ? "Vault is empty — save an identity first"
                            : "Decrypt and load an identity stored in the vault"}
                    >
                        <KeyRound size={12} /> From vault…
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.txt,application/json,text/plain"
                        style={{ display: "none" }}
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImportFile(f);
                            e.target.value = "";
                        }}
                    />
                    <button
                        className="libp2p-btn"
                        onClick={handleExportIdentity}
                        disabled={busy || (!snapshot.peerId && !snapshot.hasPersistedIdentity)}
                        title="Reveal the private key (treat as a credential)"
                     aria-label="Reveal the private key (treat as a credential)">
                        <Download size={12} /> Export
                    </button>
                    <button
                        className="libp2p-btn libp2p-btn--ghost"
                        onClick={handleClearIdentity}
                        disabled={busy || isRunning || !snapshot.hasPersistedIdentity}
                    >
                        <Trash2 size={12} /> Clear
                    </button>
                </div>

                {showImport && (
                    <div className="libp2p-form-row libp2p-form-row--col">
                        <textarea
                            className="libp2p-input libp2p-textarea"
                            placeholder="Paste base64 protobuf privateKey…"
                            value={importKey}
                            onChange={(e) => setImportKey(e.target.value)}
                            rows={3}
                        />
                        <div className="libp2p-form-row">
                            <button
                                className="libp2p-btn libp2p-btn--primary"
                                onClick={handleSubmitImport}
                                disabled={busy || !importKey.trim()}
                            >
                                Load identity
                            </button>
                            <button className="libp2p-btn libp2p-btn--ghost" onClick={() => setShowImport(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {showVaultPicker && (
                    <div className="libp2p-form-row libp2p-form-row--col">
                        <select
                            className="libp2p-input"
                            value={vaultEntryId}
                            onChange={(e) => {
                                setVaultEntryId(e.target.value);
                                setVaultError(null);
                            }}
                        >
                            <option value="">— select a vault entry —</option>
                            {vault.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.label} · {v.peerId.slice(0, 16)}…
                                </option>
                            ))}
                        </select>
                        <input
                            className="libp2p-input"
                            type="password"
                            placeholder="Passphrase"
                            value={vaultPassphrase}
                            onChange={(e) => {
                                setVaultPassphrase(e.target.value);
                                setVaultError(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && vaultEntryId && vaultPassphrase && !vaultBusy) {
                                    void handleLoadFromVault();
                                }
                            }}
                        />
                        {vaultError && (
                            <div className="libp2p-alert">
                                <AlertTriangle size={14} /> {vaultError}
                            </div>
                        )}
                        <div className="libp2p-form-row">
                            <button
                                className="libp2p-btn libp2p-btn--primary"
                                onClick={() => void handleLoadFromVault()}
                                disabled={busy || vaultBusy || !vaultEntryId || !vaultPassphrase}
                            >
                                {vaultBusy ? "Decrypting…" : "Load identity"}
                            </button>
                            <button
                                className="libp2p-btn libp2p-btn--ghost"
                                onClick={() => {
                                    setShowVaultPicker(false);
                                    setVaultPassphrase("");
                                    setVaultError(null);
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {exportModalOpen && (
                    <div
                        className="libp2p-modal-backdrop"
                        onClick={closeExportModal}
                    >
                        <div
                            className="libp2p-modal libp2p-export-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Export identity"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <header className="libp2p-modal-header">
                                <div>
                                    <h3>Export identity</h3>
                                    {exported && (
                                        <span className="libp2p-muted libp2p-mono">
                                            {exported.peerId.slice(0, 16)}…
                                        </span>
                                    )}
                                </div>
                                <button
                                    className="libp2p-modal-close"
                                    onClick={closeExportModal}
                                    aria-label="Close"
                                >
                                    <X size={16} />
                                </button>
                            </header>
                            <div className="libp2p-modal-body">
                                {!showExportPassphrase ? (
                                    <div className="libp2p-form-row libp2p-form-row--col">
                                        <p className="libp2p-muted">
                                            Choose how to take this identity off the device. The encrypted
                                            download is safe to store; the base64 copy can be pasted into the
                                            Import field on another node.
                                        </p>
                                        <div className="libp2p-form-row libp2p-form-row--wrap">
                                            <button
                                                className="libp2p-btn libp2p-btn--primary"
                                                onClick={() => void requestExport("encrypt")}
                                                disabled={exportPending !== null}
                                                title="Encrypt the private key with a passphrase and download as JSON"
                                            >
                                                <Download size={12} /> Download encrypted…
                                            </button>
                                            <button
                                                className="libp2p-btn"
                                                onClick={() => void requestExport("copy")}
                                                disabled={exportPending !== null}
                                                title="Copy the raw base64 protobuf private key (unencrypted)"
                                            >
                                                <Copy size={12} />{" "}
                                                {exportPending === "copy" ? "Fetching…" : "Copy base64"}
                                            </button>
                                        </div>
                                        <span className="libp2p-muted">
                                            ⚠️ The base64 key fully impersonates this peer. Prefer the
                                            encrypted download.
                                        </span>
                                        {exportError && (
                                            <div className="libp2p-alert">
                                                <AlertTriangle size={14} /> {exportError}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="libp2p-form-row libp2p-form-row--col">
                                        {!exported && (
                                            <span className="libp2p-muted">
                                                Fetching identity from the node…
                                            </span>
                                        )}
                                        <input
                                            className="libp2p-input"
                                            type="password"
                                            placeholder="Passphrase (min 8 chars)"
                                            value={exportPassphrase}
                                            onChange={(e) => {
                                                setExportPassphrase(e.target.value);
                                                setExportError(null);
                                            }}
                                            autoFocus
                                        />
                                        <input
                                            className="libp2p-input"
                                            type="password"
                                            placeholder="Confirm passphrase"
                                            value={exportConfirm}
                                            onChange={(e) => {
                                                setExportConfirm(e.target.value);
                                                setExportError(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !exportBusy && exported) {
                                                    void handleDownloadEncrypted();
                                                }
                                            }}
                                        />
                                        {exportError && (
                                            <div className="libp2p-alert">
                                                <AlertTriangle size={14} /> {exportError}
                                            </div>
                                        )}
                                        <div className="libp2p-form-row">
                                            <button
                                                className="libp2p-btn libp2p-btn--primary"
                                                onClick={() => void handleDownloadEncrypted()}
                                                disabled={
                                                    !exported ||
                                                    exportBusy ||
                                                    !exportPassphrase ||
                                                    !exportConfirm
                                                }
                                            >
                                                {exportBusy
                                                    ? "Encrypting…"
                                                    : !exported
                                                        ? "Waiting for key…"
                                                        : "Download"}
                                            </button>
                                            <button
                                                className="libp2p-btn libp2p-btn--ghost"
                                                onClick={() => {
                                                    setShowExportPassphrase(false);
                                                    setExportPending(null);
                                                    setExportPassphrase("");
                                                    setExportConfirm("");
                                                    setExportError(null);
                                                }}
                                            >
                                                Back
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {pendingEncryptedFile && (
                    <div className="libp2p-form-row libp2p-form-row--col">
                        <span className="libp2p-label">
                            Encrypted identity file{pendingEncryptedFile.peerId
                                ? ` · ${pendingEncryptedFile.peerId.slice(0, 16)}…`
                                : ""}
                        </span>
                        <input
                            className="libp2p-input"
                            type="password"
                            placeholder="Passphrase"
                            value={filePassphrase}
                            onChange={(e) => {
                                setFilePassphrase(e.target.value);
                                setFileError(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && filePassphrase && !fileBusy) {
                                    void handleDecryptImportedFile();
                                }
                            }}
                        />
                        {fileError && (
                            <div className="libp2p-alert">
                                <AlertTriangle size={14} /> {fileError}
                            </div>
                        )}
                        <div className="libp2p-form-row">
                            <button
                                className="libp2p-btn libp2p-btn--primary"
                                onClick={() => void handleDecryptImportedFile()}
                                disabled={busy || fileBusy || !filePassphrase}
                            >
                                {fileBusy ? "Decrypting…" : "Load identity"}
                            </button>
                            <button
                                className="libp2p-btn libp2p-btn--ghost"
                                onClick={() => {
                                    setPendingEncryptedFile(null);
                                    setFilePassphrase("");
                                    setFileError(null);
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* ── Dial panel ── */}
            <section className="libp2p-panel">
                <h3><Link2 size={14} /> Connect</h3>
                <div className="libp2p-form-row">
                    <input
                        type="text"
                        className="libp2p-input"
                        placeholder="/dnsaddr/example.com/p2p/Qm… or peer id"
                        value={dialTarget}
                        onChange={(e) => setDialTarget(e.target.value)}
                        disabled={!isRunning || busy}
                    />
                    <button
                        className="libp2p-btn"
                        disabled={!isRunning || busy || !dialTarget.trim()}
                        onClick={handleDial}
                    >
                        Dial
                    </button>
                </div>
                <details className="libp2p-bootstrap">
                    <summary>Default bootstrap peers ({DEFAULT_BOOTSTRAP.length})</summary>
                    <ul className="libp2p-addr-list">
                        {DEFAULT_BOOTSTRAP.map((ma) => (
                            <li key={ma}>
                                <code className="libp2p-mono">{ma}</code>
                                <button
                                    className="libp2p-icon-btn"
                                    title="Use as dial target"
                                    onClick={() => setDialTarget(ma)} aria-label="Use as dial target"
                                >
                                    <Link2 size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            </section>

            {/* ── Peers panel ── */}
            <section className="libp2p-panel">
                <h3>
                    Peers
                    <span className="libp2p-badge">{connectedCount}/{peers.length}</span>
                    <button
                        className="libp2p-icon-btn libp2p-icon-btn--right"
                        title="Clear peer book"
                        onClick={handleClearPeers}
                        disabled={peers.length === 0 || busy}
                     aria-label="Clear peer book">
                        <Trash2 size={12} />
                    </button>
                </h3>
                {peers.length === 0 ? (
                    <p className="libp2p-muted">No peers discovered yet.</p>
                ) : (
                    <ul className="libp2p-peer-list">
                        {peers.map((p) => (
                            <li key={p.id} className={`libp2p-peer ${p.connected ? "libp2p-peer--up" : ""}`}>
                                <span className="libp2p-peer-status">
                                    {p.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                                </span>
                                <code className="libp2p-mono libp2p-peer-id" title={p.id}>
                                    {p.id.slice(0, 18)}…{p.id.slice(-6)}
                                </code>
                                {p.latencyMs !== undefined && (
                                    <span className="libp2p-latency">{p.latencyMs} ms</span>
                                )}
                                {p.source && <span className="libp2p-source">{p.source}</span>}
                                <span className="libp2p-peer-actions">
                                    {p.connected && (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Ping"
                                            onClick={() => handlePing(p.id)} aria-label="Ping"
                                        >
                                            <Activity size={12} />
                                        </button>
                                    )}
                                    {p.connected ? (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Disconnect"
                                            onClick={() => handleHangUp(p.id)} aria-label="Disconnect"
                                        >
                                            <PowerOff size={12} />
                                        </button>
                                    ) : (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Dial"
                                            onClick={() => dispatch(
                                                "libp2p_dial",
                                                { target: p.id },
                                                `dial ${p.id.slice(0, 12)}…`,
                                            )} aria-label="Dial"
                                            disabled={busy}
                                        >
                                            <Link2 size={12} />
                                        </button>
                                    )}
                                    {(() => {
                                        const saved = contacts.some((c) => c.peerId === p.id);
                                        return (
                                            <button
                                                className="libp2p-icon-btn"
                                                title={saved ? "Already in contacts" : "Add to contacts"}
                                                onClick={() => dispatch(
                                                    "libp2p_contact_add",
                                                    {
                                                        peerId: p.id,
                                                        multiaddr: p.addrs?.[0],
                                                    },
                                                    `add contact ${p.id.slice(0, 12)}…`,
                                                )} aria-label={saved ? "Already in contacts" : "Add to contacts"}
                                                disabled={saved}
                                            >
                                                {saved ? <Check size={12} /> : <UserPlus size={12} />}
                                            </button>
                                        );
                                    })()}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ── Pubsub panel ── */}
            <PubsubPanel
                snapshot={snapshot}
                isRunning={isRunning}
                onSubscribe={(t) => dispatch("libp2p_pubsub_subscribe", { topic: t }, `subscribe ${t}`)}
                onUnsubscribe={(t) => dispatch("libp2p_pubsub_unsubscribe", { topic: t }, `unsubscribe ${t}`)}
                onPublish={(t, msg) => dispatch("libp2p_pubsub_publish", { topic: t, message: msg }, `publish to ${t}`)}
            />

            {/* ── Activity log ── */}
            <section className="libp2p-panel">
                <h3>
                    Activity
                    <button
                        className="libp2p-icon-btn libp2p-icon-btn--right"
                        title="Clear"
                        onClick={() => setLog([])} aria-label="Clear"
                        disabled={log.length === 0}
                    >
                        <RefreshCw size={12} />
                    </button>
                </h3>
                {log.length === 0 ? (
                    <p className="libp2p-muted">Activity will appear here.</p>
                ) : (
                    <ul className="libp2p-log">
                        {log.map((entry) => (
                            <li key={entry.ts} className={`libp2p-log-entry libp2p-log-entry--${entry.level}`}>
                                <span className="libp2p-log-ts">
                                    {new Date(entry.ts).toLocaleTimeString()}
                                </span>
                                <span>{entry.msg}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <Libp2pCollectionsModal
                open={collectionsOpen}
                tab={collectionsTab}
                activeNodeId={activeId}
                onClose={() => setCollectionsOpen(false)}
                onTabChange={setCollectionsTab}
                onPickDial={(target) => { setDialTarget(target); setCollectionsOpen(false); }}
            />

            <Libp2pNetworksModal
                open={networksModalOpen}
                onClose={() => setNetworksModalOpen(false)}
            />
        </div>
    );
}

// ── Helpers ─────────────────────────────────────────

interface ToggleRowProps {
    label: string;
    hint?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
}

function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
    return (
        <label className={`libp2p-toggle${disabled ? " libp2p-toggle--disabled" : ""}`}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="libp2p-toggle-label">{label}</span>
            {hint && <span className="libp2p-toggle-hint">{hint}</span>}
        </label>
    );
}

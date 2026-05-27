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
    Wifi, WifiOff, Copy, AlertTriangle, Activity,
    Plus, X, KeyRound, Download, Upload, Sparkles, BookUser,
    Check, Bot, Network, UserPlus,
} from "lucide-react";
import { useLibp2p } from "../Libp2pContext";
import { DEFAULT_BOOTSTRAP, libp2pService } from "../service";
import type { Libp2pServiceToggles, Libp2pDiscoveryToggles, Libp2pTransportToggles } from "../service";
import { logAudit } from "@/services/logging";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, JobRequest } from "@/types";
import { Libp2pCollectionsModal, type CollectionsTab } from "./Libp2pCollectionsModal";
import { Libp2pNetworksModal } from "./Libp2pNetworksModal";
import { useLibp2pCollections, decryptIdentity, encryptIdentity, decryptPnetKey } from "../utils/collections";
import { PubsubPanel } from "./PubsubPanel";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useToolkitLogger } from "@/services/activity";
import { ConnectPanel } from "./panels/ConnectPanel";
import { IdentityPanel, type VaultEntry } from "./panels/IdentityPanel";
import { NetworkPanel } from "./panels/NetworkPanel";
import { StartOptionsPanel } from "./panels/StartOptionsPanel";
import { useChatAgentsStore } from "@/services/chat/agents";
import { useCommandCtx } from "@/context/CommandContextProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";
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
    const { addLog } = useToolkitLogger("libp2p");

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
    // a11y: trap focus + restore on close inside the export-identity modal [§6.2 follow-up]
    const exportModalRef = useFocusTrap<HTMLDivElement>(exportModalOpen, () => setExportModalOpen(false));
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
    const loggedJobIds = useRef<Set<string>>(new Set());

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
        } catch (err: unknown) {
            setPnetError(err instanceof Error ? err.message : String(err));
        } finally {
            setPnetBusy(false);
        }
    };

    const handleLockPnet = () => {
        setPnetUnlockedKey(null);
        setPnetUnlockedLabel(null);
        setPnetError(null);
    };

    const isRunning = snapshot.status === "running";

    /** Submit a libp2p command as a job, scoped to the active node. */
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

    const peers = useMemo(() => {
        return [...snapshot.peers].sort((a, b) =>
            (b.connected ? 1 : 0) - (a.connected ? 1 : 0) ||
            a.id.localeCompare(b.id),
        );
    }, [snapshot.peers]);

    const connectedCount = peers.filter((p) => p.connected).length;

    /** True while a libp2p job is queued or running. */
    const busy = useMemo(() => {
        return jobs.some((j: Job) =>
            typeof j.type === "string" &&
            j.type.startsWith("libp2p_") &&
            (j.status === "queued" || j.status === "running"),
        );
    }, [jobs]);

    // Surface job results into the local activity log.
    useEffect(() => {
        const recent = jobs
            .filter((j: Job) =>
                typeof j.type === "string" &&
                j.type.startsWith("libp2p_") &&
                (j.status === "completed" || j.status === "failed") &&
                j.completedAt && j.completedAt > Date.now() - 10_000,
            )
            .slice(0, 5);
        for (const j of recent) {
            if (loggedJobIds.current.has(j.id)) continue;
            loggedJobIds.current.add(j.id);
            if (j.status === "completed") {
                // Capture the export-identity result so the UI can reveal it.
                const result = j.result as { peerId?: unknown; privateKey?: unknown } | undefined;
                if (j.type === "libp2p_export_identity" && typeof result?.privateKey === "string") {
                    const peerId = typeof result.peerId === "string" ? result.peerId : "";
                    setExported({ peerId, privateKey: result.privateKey });
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
            <StartOptionsPanel
                isRunning={isRunning}
                transports={transports}
                setTransports={setTransports}
                services={services}
                setServices={setServices}
                discovery={discovery}
                setDiscovery={setDiscovery}
                transportCount={transportCount}
                enabledBootstrapCount={enabledBootstrapCount}
                allBootstrap={allBootstrap}
                disabledBootstrap={disabledBootstrap}
                setDisabledBootstrap={setDisabledBootstrap}
                toggleBootstrap={toggleBootstrap}
                addBootstrap={addBootstrap}
                removeBootstrap={removeBootstrap}
                bootstrapInput={bootstrapInput}
                setBootstrapInput={setBootstrapInput}
                showContactPicker={showContactPicker}
                setShowContactPicker={setShowContactPicker}
                contacts={contacts}
            />

            {/* ── Network panel ── */}
            <NetworkPanel
                isRunning={isRunning}
                pnetMode={pnetMode}
                setPnetMode={setPnetMode}
                pnetUnlockedLabel={pnetUnlockedLabel}
                pnetUnlockedKey={pnetUnlockedKey}
                networks={networks}
                selectedPnetId={selectedPnetId}
                setSelectedPnetId={setSelectedPnetId}
                pnetPassphrase={pnetPassphrase}
                setPnetPassphrase={setPnetPassphrase}
                pnetBusy={pnetBusy}
                pnetError={pnetError}
                onUnlockPnet={handleUnlockPnet}
                onLockPnet={handleLockPnet}
                onOpenNetworksModal={() => setNetworksModalOpen(true)}
            />

            {/* ── Identity panel ── */}
            <IdentityPanel
                snapshot={snapshot}
                busy={busy}
                isRunning={isRunning}
                contacts={contacts}
                vault={vault as unknown as VaultEntry[]}
                showImport={showImport}
                setShowImport={setShowImport}
                importKey={importKey}
                setImportKey={setImportKey}
                showVaultPicker={showVaultPicker}
                setShowVaultPicker={setShowVaultPicker}
                vaultEntryId={vaultEntryId}
                setVaultEntryId={setVaultEntryId}
                vaultPassphrase={vaultPassphrase}
                setVaultPassphrase={setVaultPassphrase}
                vaultBusy={vaultBusy}
                vaultError={vaultError}
                setVaultError={setVaultError}
                exportModalOpen={exportModalOpen}
                exported={exported}
                exportPending={exportPending}
                setExportPending={setExportPending}
                exportBusy={exportBusy}
                exportError={exportError}
                showExportPassphrase={showExportPassphrase}
                setShowExportPassphrase={setShowExportPassphrase}
                exportPassphrase={exportPassphrase}
                setExportPassphrase={setExportPassphrase}
                exportConfirm={exportConfirm}
                setExportConfirm={setExportConfirm}
                pendingEncryptedFile={pendingEncryptedFile}
                filePassphrase={filePassphrase}
                setFilePassphrase={setFilePassphrase}
                fileBusy={fileBusy}
                fileError={fileError}
                setFileError={setFileError}
                fileInputRef={fileInputRef}
                exportModalRef={exportModalRef}
                onCopy={copy}
                onGenerate={handleGenerateIdentity}
                onSubmitImport={handleSubmitImport}
                onImportFile={handleImportFile}
                onLoadFromVault={handleLoadFromVault}
                onExport={handleExportIdentity}
                onClear={handleClearIdentity}
                onRequestExport={requestExport}
                onDownloadEncrypted={handleDownloadEncrypted}
                onCloseExportModal={closeExportModal}
                onDecryptImportedFile={handleDecryptImportedFile}
                onClearPendingFile={() => setPendingEncryptedFile(null)}
            />

            {/* ── Dial panel ── */}
            <ConnectPanel
                dialTarget={dialTarget}
                setDialTarget={setDialTarget}
                isRunning={isRunning}
                busy={busy}
                onDial={handleDial}
            />

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
                <ActivityFeed
                    baseFilter={{ sources: ["libp2p"] }}
                    sourceOptions={["libp2p"]}
                    title="Activity"
                    defaultTimeRange="1h"
                    emptyMessage="libp2p events will appear here as you start nodes, dial, subscribe, and publish."
                />
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

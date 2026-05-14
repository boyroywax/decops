/**
 * Libp2pNetworksModal — manage encrypted libp2p private-swarm (pnet) keys.
 *
 * Holds a collection of pre-shared keys, each protected by a passphrase
 * and AES-GCM encrypted at rest. Users can:
 *   • generate a fresh PSK or paste an existing libp2p PSK document
 *   • reveal / copy / download the ASCII PSK after entering the passphrase
 *   • delete a network entry
 *
 * Encrypted entries are persisted to localStorage via the libp2p collections
 * Zustand store. Selecting which entry to apply to a node happens in the
 * NETWORK panel on the main libp2p view.
 */

import { useState } from "react";
import {
    Network, X, Plus, Trash2, Copy, Lock, Unlock, Download, Eye, EyeOff, Shuffle, ClipboardPaste,
} from "lucide-react";
import {
    useLibp2pCollections,
    type PnetEntry,
    generatePnetKey,
    normalisePnetKey,
    encryptPnetKey,
    decryptPnetKey,
    fingerprintPnetKey,
} from "../utils/collections";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Libp2pNetworksModalProps {
    open: boolean;
    onClose: () => void;
}

type Mode = "generate" | "import";

export function Libp2pNetworksModal({ open, onClose }: Libp2pNetworksModalProps) {
    const trapRef = useFocusTrap<HTMLDivElement>(open, onClose);
    if (!open) return null;
    return (
        <div className="libp2p-modal-backdrop" onClick={onClose}>
            <div
                ref={trapRef}
                className="libp2p-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Private networks"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="libp2p-modal-header">
                    <div className="libp2p-modal-tabs">
                        <span className="libp2p-modal-tab libp2p-modal-tab--active">
                            <Network size={14} /> Private networks
                        </span>
                    </div>
                    <button className="libp2p-icon-btn" title="Close" onClick={onClose} aria-label="Close">
                        <X size={14} />
                    </button>
                </header>
                <div className="libp2p-modal-body">
                    <NetworksPanel />
                </div>
            </div>
        </div>
    );
}

function NetworksPanel() {
    const networks = useLibp2pCollections((s) => s.networks);
    const addPnetEntry = useLibp2pCollections((s) => s.addPnetEntry);
    const removePnetEntry = useLibp2pCollections((s) => s.removePnetEntry);

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [mode, setMode] = useState<Mode>("generate");
    const [label, setLabel] = useState("");
    const [pastedKey, setPastedKey] = useState("");
    const [pass1, setPass1] = useState("");
    const [pass2, setPass2] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Reveal form state
    const [revealId, setRevealId] = useState<string | null>(null);
    const [revealPass, setRevealPass] = useState("");
    const [revealed, setRevealed] = useState<string | null>(null);
    const [revealError, setRevealError] = useState<string | null>(null);

    const resetCreate = () => {
        setShowCreate(false);
        setMode("generate");
        setLabel("");
        setPastedKey("");
        setPass1("");
        setPass2("");
        setCreateError(null);
    };

    const resetReveal = () => {
        setRevealId(null);
        setRevealPass("");
        setRevealed(null);
        setRevealError(null);
    };

    const handleCreate = async () => {
        setCreateError(null);
        if (!label.trim()) { setCreateError("Label is required"); return; }
        if (!pass1) { setCreateError("Passphrase is required"); return; }
        if (pass1 !== pass2) { setCreateError("Passphrases do not match"); return; }
        setBusy(true);
        try {
            let asciiKey: string;
            if (mode === "generate") {
                asciiKey = generatePnetKey();
            } else {
                asciiKey = normalisePnetKey(pastedKey);
            }
            const fingerprint = await fingerprintPnetKey(asciiKey);
            const { ciphertext, salt, iv } = await encryptPnetKey(asciiKey, pass1);
            addPnetEntry({ label: label.trim(), fingerprint, ciphertext, salt, iv });
            resetCreate();
        } catch (err: unknown) {
            setCreateError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const handleReveal = async (n: PnetEntry) => {
        setRevealError(null);
        setRevealed(null);
        try {
            const ascii = await decryptPnetKey(n, revealPass);
            setRevealed(ascii);
        } catch (err: unknown) {
            setRevealError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleCopy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); } catch { /* ignored */ }
    };

    const handleDownload = (label: string, text: string) => {
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${label.replace(/[^a-z0-9._-]+/gi, "_") || "pnet"}.psk`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <section className="libp2p-modal-section">
                <div className="libp2p-form-row libp2p-form-row--wrap">
                    <button
                        className="libp2p-btn libp2p-btn--primary"
                        onClick={() => setShowCreate((s) => !s)}
                    >
                        <Plus size={12} /> Add private network…
                    </button>
                </div>
                <p className="libp2p-muted libp2p-muted--small">
                    Private-network keys (libp2p PSKs) restrict a node to peer only with
                    others sharing the same key. Stored encrypted with a passphrase.
                </p>

                {showCreate && (
                    <div className="libp2p-form-row libp2p-form-row--col">
                        <div className="libp2p-form-row">
                            <button
                                className={`libp2p-btn ${mode === "generate" ? "libp2p-btn--primary" : "libp2p-btn--ghost"}`}
                                onClick={() => setMode("generate")}
                            >
                                <Shuffle size={12} /> Generate new
                            </button>
                            <button
                                className={`libp2p-btn ${mode === "import" ? "libp2p-btn--primary" : "libp2p-btn--ghost"}`}
                                onClick={() => setMode("import")}
                            >
                                <ClipboardPaste size={12} /> Paste existing
                            </button>
                        </div>

                        <input
                            className="libp2p-input"
                            placeholder="Label (e.g. Internal swarm)"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />

                        {mode === "import" && (
                            <textarea
                                className="libp2p-input"
                                rows={4}
                                placeholder={"/key/swarm/psk/1.0.0/\n/base16/\n<64 hex characters>"}
                                value={pastedKey}
                                onChange={(e) => setPastedKey(e.target.value)}
                            />
                        )}

                        <input
                            className="libp2p-input"
                            type="password"
                            placeholder="Passphrase"
                            value={pass1}
                            onChange={(e) => setPass1(e.target.value)}
                        />
                        <input
                            className="libp2p-input"
                            type="password"
                            placeholder="Confirm passphrase"
                            value={pass2}
                            onChange={(e) => setPass2(e.target.value)}
                        />

                        {createError && (
                            <div className="libp2p-alert libp2p-alert--error">{createError}</div>
                        )}

                        <div className="libp2p-form-row">
                            <button
                                className="libp2p-btn libp2p-btn--primary"
                                onClick={handleCreate}
                                disabled={busy}
                            >
                                <Lock size={12} /> Encrypt &amp; save
                            </button>
                            <button className="libp2p-btn libp2p-btn--ghost" onClick={resetCreate}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <section className="libp2p-modal-section">
                <h4>Networks ({networks.length})</h4>
                {networks.length === 0 ? (
                    <p className="libp2p-muted">No private networks saved yet.</p>
                ) : (
                    <ul className="libp2p-collection-list">
                        {networks.map((n) => (
                            <li key={n.id} className="libp2p-collection-item">
                                <div className="libp2p-collection-main">
                                    <span className="libp2p-collection-name">
                                        <Network size={12} /> {n.label}
                                    </span>
                                    {n.fingerprint && (
                                        <code className="libp2p-mono libp2p-mono--wrap">
                                            fp:{n.fingerprint}
                                        </code>
                                    )}
                                    <span className="libp2p-muted libp2p-muted--small">
                                        Encrypted • {new Date(n.createdAt).toLocaleString()}
                                    </span>

                                    {revealId === n.id && (
                                        <div className="libp2p-form-row libp2p-form-row--col">
                                            {!revealed && (
                                                <>
                                                    <input
                                                        className="libp2p-input"
                                                        type="password"
                                                        placeholder="Passphrase"
                                                        value={revealPass}
                                                        onChange={(e) => setRevealPass(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <div className="libp2p-form-row">
                                                        <button
                                                            className="libp2p-btn libp2p-btn--primary"
                                                            onClick={() => handleReveal(n)}
                                                            disabled={!revealPass}
                                                        >
                                                            <Unlock size={12} /> Decrypt
                                                        </button>
                                                        <button
                                                            className="libp2p-btn libp2p-btn--ghost"
                                                            onClick={resetReveal}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                    {revealError && (
                                                        <div className="libp2p-alert libp2p-alert--error">
                                                            {revealError}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {revealed && (
                                                <>
                                                    <textarea
                                                        className="libp2p-input"
                                                        rows={4}
                                                        readOnly
                                                        value={revealed}
                                                    />
                                                    <div className="libp2p-form-row">
                                                        <button
                                                            className="libp2p-btn"
                                                            onClick={() => handleCopy(revealed)}
                                                        >
                                                            <Copy size={12} /> Copy
                                                        </button>
                                                        <button
                                                            className="libp2p-btn"
                                                            onClick={() => handleDownload(n.label, revealed)}
                                                        >
                                                            <Download size={12} /> Download
                                                        </button>
                                                        <button
                                                            className="libp2p-btn libp2p-btn--ghost"
                                                            onClick={resetReveal}
                                                        >
                                                            <EyeOff size={12} /> Hide
                                                        </button>
                                                    </div>
                                                    <span className="libp2p-muted libp2p-muted--small">
                                                        Treat this value like a password — anyone with it can join the swarm.
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="libp2p-collection-actions">
                                    {revealId !== n.id && (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Reveal key"
                                            onClick={() => { resetReveal(); setRevealId(n.id); }} aria-label="Reveal key"
                                        >
                                            <Eye size={12} />
                                        </button>
                                    )}
                                    <button
                                        className="libp2p-icon-btn"
                                        title="Remove"
                                        onClick={() => {
                                            if (revealId === n.id) resetReveal();
                                            removePnetEntry(n.id);
                                        }} aria-label="Remove"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>
    );
}

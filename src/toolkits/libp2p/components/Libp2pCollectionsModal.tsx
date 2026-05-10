/**
 * Libp2pCollectionsModal — contact book + identity vault dialogs.
 *
 * Two views switchable by the "tab" prop:
 *   • "contacts" — peer-id address book; entries can be edited, dialed,
 *     or used to populate the dial input on the main view.
 *   • "vault"    — encrypted Ed25519 keys; entries can be loaded into the
 *     active node (after a passphrase prompt) or removed.
 *
 * All mutating operations dispatch through the job creator so they show
 * up in the queue and timeline like every other libp2p action.
 */

import { useState } from "react";
import {
    BookUser, KeyRound, X, Plus, Link2, Trash2, Copy, Lock, Unlock, Download,
} from "lucide-react";
import { useLibp2pCollections, type Contact, type VaultEntry } from "../utils/collections";
import { useJobsContext } from "@/context/JobsContext";
import type { JobRequest } from "@/types";

export type CollectionsTab = "contacts" | "vault";

interface Libp2pCollectionsModalProps {
    open: boolean;
    tab: CollectionsTab;
    activeNodeId: string | null;
    onClose: () => void;
    onTabChange: (tab: CollectionsTab) => void;
    onPickDial?: (target: string) => void;
}

export function Libp2pCollectionsModal({
    open,
    tab,
    activeNodeId,
    onClose,
    onTabChange,
    onPickDial,
}: Libp2pCollectionsModalProps) {
    if (!open) return null;
    return (
        <div className="libp2p-modal-backdrop" onClick={onClose}>
            <div
                className="libp2p-modal"
                role="dialog"
                aria-modal="true"
                aria-label={tab === "contacts" ? "Contact book" : "Identity vault"}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="libp2p-modal-header">
                    <div className="libp2p-modal-tabs">
                        <button
                            className={`libp2p-modal-tab ${tab === "contacts" ? "libp2p-modal-tab--active" : ""}`}
                            onClick={() => onTabChange("contacts")}
                        >
                            <BookUser size={14} /> Contacts
                        </button>
                        <button
                            className={`libp2p-modal-tab ${tab === "vault" ? "libp2p-modal-tab--active" : ""}`}
                            onClick={() => onTabChange("vault")}
                        >
                            <KeyRound size={14} /> Identity vault
                        </button>
                    </div>
                    <button className="libp2p-icon-btn" title="Close" onClick={onClose}>
                        <X size={14} />
                    </button>
                </header>

                <div className="libp2p-modal-body">
                    {tab === "contacts"
                        ? <ContactsPanel activeNodeId={activeNodeId} onPickDial={onPickDial} />
                        : <VaultPanel activeNodeId={activeNodeId} />
                    }
                </div>
            </div>
        </div>
    );
}

// ── Contacts ──────────────────────────────────────────────

function ContactsPanel({
    activeNodeId,
    onPickDial,
}: { activeNodeId: string | null; onPickDial?: (target: string) => void }) {
    const contacts = useLibp2pCollections((s) => s.contacts);
    const { addJob } = useJobsContext();

    const [name, setName] = useState("");
    const [peerId, setPeerId] = useState("");
    const [multiaddr, setMultiaddr] = useState("");
    const [notes, setNotes] = useState("");

    const dispatch = (type: string, request: Record<string, any>) =>
        addJob({ type, request: activeNodeId ? { ...request, nodeId: activeNodeId } : request } as JobRequest);

    const handleAdd = () => {
        if (!peerId.trim()) return;
        dispatch("libp2p_contact_add", {
            peerId: peerId.trim(),
            name: name.trim() || undefined,
            multiaddr: multiaddr.trim() || undefined,
            notes: notes.trim() || undefined,
        });
        setName(""); setPeerId(""); setMultiaddr(""); setNotes("");
    };
    const handleRemove = (id: string) => dispatch("libp2p_contact_remove", { id });
    const handleDial = (c: Contact) => dispatch("libp2p_contact_dial", { contactId: c.id });

    const copy = (t: string) => { try { navigator.clipboard?.writeText(t); } catch { /* */ } };

    return (
        <>
            <section className="libp2p-modal-section">
                <h4>Add contact</h4>
                <div className="libp2p-form-row">
                    <input className="libp2p-input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
                    <input className="libp2p-input" placeholder="Peer ID *" value={peerId} onChange={(e) => setPeerId(e.target.value)} />
                </div>
                <div className="libp2p-form-row">
                    <input className="libp2p-input" placeholder="Default multiaddr (optional)" value={multiaddr} onChange={(e) => setMultiaddr(e.target.value)} />
                </div>
                <div className="libp2p-form-row">
                    <input className="libp2p-input" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <button className="libp2p-btn libp2p-btn--primary" onClick={handleAdd} disabled={!peerId.trim()}>
                        <Plus size={12} /> Save
                    </button>
                </div>
            </section>

            <section className="libp2p-modal-section">
                <h4>Saved ({contacts.length})</h4>
                {contacts.length === 0 ? (
                    <p className="libp2p-muted">No contacts saved yet.</p>
                ) : (
                    <ul className="libp2p-collection-list">
                        {contacts.map((c) => (
                            <li key={c.id} className="libp2p-collection-item">
                                <div className="libp2p-collection-main">
                                    <span className="libp2p-collection-name">
                                        {c.name || c.peerId.slice(0, 16) + "…"}
                                    </span>
                                    <code className="libp2p-mono libp2p-mono--wrap">{c.peerId}</code>
                                    {c.multiaddr && (
                                        <code className="libp2p-mono libp2p-mono--wrap libp2p-collection-sub">
                                            {c.multiaddr}
                                        </code>
                                    )}
                                    {c.notes && <span className="libp2p-muted">{c.notes}</span>}
                                </div>
                                <div className="libp2p-collection-actions">
                                    <button
                                        className="libp2p-icon-btn"
                                        title="Dial via active node"
                                        onClick={() => handleDial(c)}
                                        disabled={!activeNodeId}
                                    >
                                        <Link2 size={12} />
                                    </button>
                                    {onPickDial && (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Use as dial target"
                                            onClick={() => { onPickDial(c.multiaddr || c.peerId); }}
                                        >
                                            <Download size={12} />
                                        </button>
                                    )}
                                    <button className="libp2p-icon-btn" title="Copy peer id" onClick={() => copy(c.peerId)}>
                                        <Copy size={12} />
                                    </button>
                                    <button className="libp2p-icon-btn" title="Remove" onClick={() => handleRemove(c.id)}>
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

// ── Vault ─────────────────────────────────────────────────

function VaultPanel({ activeNodeId }: { activeNodeId: string | null }) {
    const vault = useLibp2pCollections((s) => s.vault);
    const { addJob } = useJobsContext();

    const [showStore, setShowStore] = useState(false);
    const [storeLabel, setStoreLabel] = useState("");
    const [storePassphrase, setStorePassphrase] = useState("");

    const [unlockId, setUnlockId] = useState<string | null>(null);
    const [unlockPassphrase, setUnlockPassphrase] = useState("");

    const dispatch = (type: string, request: Record<string, any>) =>
        addJob({ type, request: activeNodeId ? { ...request, nodeId: activeNodeId } : request } as JobRequest);

    const handleStoreCurrent = () => {
        if (!storeLabel.trim() || !storePassphrase) return;
        dispatch("libp2p_vault_export_current", {
            label: storeLabel.trim(),
            passphrase: storePassphrase,
        });
        setStoreLabel(""); setStorePassphrase(""); setShowStore(false);
    };

    const handleLoad = (v: VaultEntry) => {
        if (!unlockPassphrase) return;
        dispatch("libp2p_vault_load", { vaultId: v.id, passphrase: unlockPassphrase });
        setUnlockId(null); setUnlockPassphrase("");
    };

    const handleRemove = (id: string) => dispatch("libp2p_vault_remove", { id });

    return (
        <>
            <section className="libp2p-modal-section">
                <div className="libp2p-form-row libp2p-form-row--wrap">
                    <button
                        className="libp2p-btn libp2p-btn--primary"
                        onClick={() => setShowStore((s) => !s)}
                    >
                        <Plus size={12} /> Encrypt active identity…
                    </button>
                </div>
                <p className="libp2p-muted libp2p-muted--small">
                    Encrypts the active node's current peer key with a passphrase and saves it in the vault.
                    The plaintext private key never leaves browser memory.
                </p>
                {showStore && (
                    <div className="libp2p-form-row libp2p-form-row--col">
                        <input
                            className="libp2p-input"
                            placeholder="Label (e.g. Operator key)"
                            value={storeLabel}
                            onChange={(e) => setStoreLabel(e.target.value)}
                        />
                        <input
                            className="libp2p-input"
                            type="password"
                            placeholder="Passphrase"
                            value={storePassphrase}
                            onChange={(e) => setStorePassphrase(e.target.value)}
                        />
                        <div className="libp2p-form-row">
                            <button
                                className="libp2p-btn libp2p-btn--primary"
                                onClick={handleStoreCurrent}
                                disabled={!storeLabel.trim() || !storePassphrase || !activeNodeId}
                            >
                                <Lock size={12} /> Encrypt &amp; store
                            </button>
                            <button className="libp2p-btn libp2p-btn--ghost" onClick={() => setShowStore(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <section className="libp2p-modal-section">
                <h4>Identities ({vault.length})</h4>
                {vault.length === 0 ? (
                    <p className="libp2p-muted">No identities stored yet.</p>
                ) : (
                    <ul className="libp2p-collection-list">
                        {vault.map((v) => (
                            <li key={v.id} className="libp2p-collection-item">
                                <div className="libp2p-collection-main">
                                    <span className="libp2p-collection-name">
                                        <KeyRound size={12} /> {v.label}
                                    </span>
                                    <code className="libp2p-mono libp2p-mono--wrap">{v.peerId}</code>
                                    {v.notes && <span className="libp2p-muted">{v.notes}</span>}
                                    <span className="libp2p-muted libp2p-muted--small">
                                        Encrypted • {new Date(v.createdAt).toLocaleString()}
                                    </span>
                                    {unlockId === v.id && (
                                        <div className="libp2p-form-row libp2p-form-row--col">
                                            <input
                                                className="libp2p-input"
                                                type="password"
                                                placeholder="Passphrase"
                                                value={unlockPassphrase}
                                                onChange={(e) => setUnlockPassphrase(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="libp2p-form-row">
                                                <button
                                                    className="libp2p-btn libp2p-btn--primary"
                                                    onClick={() => handleLoad(v)}
                                                    disabled={!unlockPassphrase || !activeNodeId}
                                                >
                                                    <Unlock size={12} /> Load identity
                                                </button>
                                                <button
                                                    className="libp2p-btn libp2p-btn--ghost"
                                                    onClick={() => { setUnlockId(null); setUnlockPassphrase(""); }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                            <span className="libp2p-muted libp2p-muted--small">
                                                Loads the key into the active node for the next start.
                                                The node must be stopped.
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="libp2p-collection-actions">
                                    {unlockId !== v.id && (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Load into active node"
                                            onClick={() => { setUnlockId(v.id); setUnlockPassphrase(""); }}
                                        >
                                            <Unlock size={12} />
                                        </button>
                                    )}
                                    <button className="libp2p-icon-btn" title="Remove" onClick={() => handleRemove(v.id)}>
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

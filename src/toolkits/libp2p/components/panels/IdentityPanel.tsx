/**
 * IdentityPanel — Libp2pView's "Identity" section.
 *
 * Shows peer ID, listen addrs, and identity management actions (generate,
 * import, export, vault, clear). Pure presentation: parent owns all state
 * and handlers.
 *
 * §3.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import {
    KeyRound, Copy, Sparkles, Upload, Download, Trash2,
    X, AlertTriangle, Lock,
} from "lucide-react";
import type { Libp2pSnapshot } from "../../service";
import type { Contact } from "../../utils/collections";

export interface VaultEntry {
    id: string;
    label: string;
    peerId: string;
}

interface IdentityPanelProps {
    snapshot: Libp2pSnapshot;
    busy: boolean;
    isRunning: boolean;
    contacts: Contact[];
    vault: VaultEntry[];
    // Import state
    showImport: boolean;
    setShowImport: (v: boolean | ((prev: boolean) => boolean)) => void;
    importKey: string;
    setImportKey: (v: string) => void;
    // Vault picker state
    showVaultPicker: boolean;
    setShowVaultPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
    vaultEntryId: string;
    setVaultEntryId: (v: string) => void;
    vaultPassphrase: string;
    setVaultPassphrase: (v: string) => void;
    vaultBusy: boolean;
    vaultError: string | null;
    setVaultError: (e: string | null) => void;
    // Export modal state
    exportModalOpen: boolean;
    exported: { peerId: string; privateKey: string } | null;
    exportPending: "encrypt" | "copy" | null;
    setExportPending: (v: "encrypt" | "copy" | null) => void;
    exportBusy: boolean;
    exportError: string | null;
    showExportPassphrase: boolean;
    setShowExportPassphrase: (v: boolean | ((prev: boolean) => boolean)) => void;
    exportPassphrase: string;
    setExportPassphrase: (v: string) => void;
    exportConfirm: string;
    setExportConfirm: (v: string) => void;
    // Encrypted file import state
    pendingEncryptedFile: { peerId?: string; ciphertext: string; salt: string; iv: string } | null;
    filePassphrase: string;
    setFilePassphrase: (v: string) => void;
    fileBusy: boolean;
    fileError: string | null;
    setFileError: (e: string | null) => void;
    // Refs
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    exportModalRef: React.RefObject<HTMLDivElement | null>;
    // Handlers
    onCopy: (text: string) => void;
    onGenerate: () => void;
    onSubmitImport: () => void;
    onImportFile: (file: File) => void;
    onLoadFromVault: () => Promise<void>;
    onExport: () => void;
    onClear: () => void;
    onRequestExport: (mode: "encrypt" | "copy") => Promise<void>;
    onDownloadEncrypted: () => Promise<void>;
    onCloseExportModal: () => void;
    onDecryptImportedFile: () => Promise<void>;
    onClearPendingFile: () => void;
}

export function IdentityPanel({
    snapshot, busy, isRunning, contacts: _contacts, vault,
    showImport, setShowImport, importKey, setImportKey,
    showVaultPicker, setShowVaultPicker, vaultEntryId, setVaultEntryId,
    vaultPassphrase, setVaultPassphrase, vaultBusy, vaultError, setVaultError,
    exportModalOpen, exported, exportPending, setExportPending, exportBusy, exportError,
    showExportPassphrase, setShowExportPassphrase, exportPassphrase, setExportPassphrase,
    exportConfirm, setExportConfirm,
    pendingEncryptedFile, filePassphrase, setFilePassphrase,
    fileBusy, fileError, setFileError,
    fileInputRef, exportModalRef,
    onCopy, onGenerate, onSubmitImport, onImportFile,
    onLoadFromVault, onExport, onClear, onRequestExport,
    onDownloadEncrypted, onCloseExportModal, onDecryptImportedFile,
    onClearPendingFile,
}: IdentityPanelProps) {
    return (
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
                        <button className="libp2p-icon-btn" title="Copy" onClick={() => onCopy(snapshot.peerId!)} aria-label="Copy">
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
                                        <button className="libp2p-icon-btn" title="Copy" onClick={() => onCopy(ma)} aria-label="Copy">
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
                <button className="libp2p-btn" onClick={onGenerate} disabled={busy || isRunning}
                    title="Stop the node first; generates a fresh Ed25519 key for the next start" aria-label="Stop the node first; generates a fresh Ed25519 key for the next start">
                    <Sparkles size={12} /> Generate
                </button>
                <button className="libp2p-btn" onClick={() => setShowImport((prev: boolean) => !prev)} disabled={busy || isRunning}>
                    <Upload size={12} /> Import…
                </button>
                <button className="libp2p-btn" onClick={() => fileInputRef.current?.click()} disabled={busy || isRunning}
                    title="Load an identity from a previously-exported JSON file">
                    <Upload size={12} /> From file…
                </button>
                <button className="libp2p-btn"
                    onClick={() => { setVaultError(null); setShowVaultPicker((prev: boolean) => !prev); }}
                    disabled={busy || isRunning || vault.length === 0}
                    title={vault.length === 0 ? "Vault is empty — save an identity first" : "Decrypt and load an identity stored in the vault"}>
                    <KeyRound size={12} /> From vault…
                </button>
                <input ref={fileInputRef} type="file" accept=".json,.txt,application/json,text/plain" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }} />
                <button className="libp2p-btn" onClick={onExport}
                    disabled={busy || (!snapshot.peerId && !snapshot.hasPersistedIdentity)}
                    title="Reveal the private key (treat as a credential)" aria-label="Reveal the private key (treat as a credential)">
                    <Download size={12} /> Export
                </button>
                <button className="libp2p-btn libp2p-btn--ghost" onClick={onClear}
                    disabled={busy || isRunning || !snapshot.hasPersistedIdentity}>
                    <Trash2 size={12} /> Clear
                </button>
            </div>

            {showImport && (
                <div className="libp2p-form-row libp2p-form-row--col">
                    <textarea className="libp2p-input libp2p-textarea" placeholder="Paste base64 protobuf privateKey…"
                        value={importKey} onChange={(e) => setImportKey(e.target.value)} rows={3} />
                    <div className="libp2p-form-row">
                        <button className="libp2p-btn libp2p-btn--primary" onClick={onSubmitImport} disabled={busy || !importKey.trim()}>
                            Load identity
                        </button>
                        <button className="libp2p-btn libp2p-btn--ghost" onClick={() => setShowImport(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {showVaultPicker && (
                <div className="libp2p-form-row libp2p-form-row--col">
                    <select className="libp2p-input" value={vaultEntryId}
                        onChange={(e) => { setVaultEntryId(e.target.value); setVaultError(null); }}>
                        <option value="">— select a vault entry —</option>
                        {vault.map((v) => (
                            <option key={v.id} value={v.id}>{v.label} · {v.peerId.slice(0, 16)}…</option>
                        ))}
                    </select>
                    <input className="libp2p-input" type="password" placeholder="Passphrase" value={vaultPassphrase}
                        onChange={(e) => { setVaultPassphrase(e.target.value); setVaultError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && vaultEntryId && vaultPassphrase && !vaultBusy) void onLoadFromVault(); }} />
                    {vaultError && <div className="libp2p-alert"><AlertTriangle size={14} /> {vaultError}</div>}
                    <div className="libp2p-form-row">
                        <button className="libp2p-btn libp2p-btn--primary" onClick={() => void onLoadFromVault()}
                            disabled={busy || vaultBusy || !vaultEntryId || !vaultPassphrase}>
                            {vaultBusy ? "Decrypting…" : "Load identity"}
                        </button>
                        <button className="libp2p-btn libp2p-btn--ghost" onClick={() => { setShowVaultPicker(false); setVaultPassphrase(""); setVaultError(null); }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {exportModalOpen && (
                <div className="libp2p-modal-backdrop" onClick={onCloseExportModal}>
                    <div ref={exportModalRef} className="libp2p-modal libp2p-export-modal" role="dialog" aria-modal="true"
                        aria-label="Export identity" onClick={(e) => e.stopPropagation()}>
                        <header className="libp2p-modal-header">
                            <div>
                                <h3>Export identity</h3>
                                {exported && <span className="libp2p-muted libp2p-mono">{exported.peerId.slice(0, 16)}…</span>}
                            </div>
                            <button className="libp2p-modal-close" onClick={onCloseExportModal} aria-label="Close"><X size={16} /></button>
                        </header>
                        <div className="libp2p-modal-body">
                            {!showExportPassphrase ? (
                                <div className="libp2p-form-row libp2p-form-row--col">
                                    <p className="libp2p-muted">Choose how to take this identity off the device…</p>
                                    <div className="libp2p-form-row libp2p-form-row--wrap">
                                        <button className="libp2p-btn libp2p-btn--primary" onClick={() => void onRequestExport("encrypt")}
                                            disabled={exportPending !== null} title="Encrypt the private key with a passphrase and download as JSON">
                                            <Download size={12} /> Download encrypted…
                                        </button>
                                        <button className="libp2p-btn" onClick={() => void onRequestExport("copy")}
                                            disabled={exportPending !== null} title="Copy the raw base64 protobuf private key (unencrypted)">
                                            <Copy size={12} /> {exportPending === "copy" ? "Fetching…" : "Copy base64"}
                                        </button>
                                    </div>
                                    <span className="libp2p-muted">⚠️ The base64 key fully impersonates this peer. Prefer the encrypted download.</span>
                                    {exportError && <div className="libp2p-alert"><AlertTriangle size={14} /> {exportError}</div>}
                                </div>
                            ) : (
                                <div className="libp2p-form-row libp2p-form-row--col">
                                    {!exported && <span className="libp2p-muted">Fetching identity from the node…</span>}
                                    <input className="libp2p-input" type="password" placeholder="Passphrase (min 8 chars)"
                                        value={exportPassphrase} onChange={(e) => { setExportPassphrase(e.target.value); }} autoFocus />
                                    <input className="libp2p-input" type="password" placeholder="Confirm passphrase"
                                        value={exportConfirm} onChange={(e) => { setExportConfirm(e.target.value); }}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !exportBusy && exported) void onDownloadEncrypted(); }} />
                                    {exportError && <div className="libp2p-alert"><AlertTriangle size={14} /> {exportError}</div>}
                                    <div className="libp2p-form-row">
                                        <button className="libp2p-btn libp2p-btn--primary" onClick={() => void onDownloadEncrypted()}
                                            disabled={!exported || exportBusy || !exportPassphrase || !exportConfirm}>
                                            {exportBusy ? "Encrypting…" : !exported ? "Waiting for key…" : "Download"}
                                        </button>
                                        <button className="libp2p-btn libp2p-btn--ghost" onClick={() => {
                                            setShowExportPassphrase(false);
                                            setExportPending(null);
                                            setExportPassphrase("");
                                            setExportConfirm("");
                                        }}>
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
                        Encrypted identity file{pendingEncryptedFile.peerId ? ` · ${pendingEncryptedFile.peerId.slice(0, 16)}…` : ""}
                    </span>
                    <input className="libp2p-input" type="password" placeholder="Passphrase" value={filePassphrase}
                        onChange={(e) => { setFilePassphrase(e.target.value); setFileError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && filePassphrase && !fileBusy) void onDecryptImportedFile(); }} />
                    {fileError && <div className="libp2p-alert"><AlertTriangle size={14} /> {fileError}</div>}
                    <div className="libp2p-form-row">
                        <button className="libp2p-btn libp2p-btn--primary" onClick={() => void onDecryptImportedFile()}
                            disabled={busy || fileBusy || !filePassphrase}>
                            {fileBusy ? "Decrypting…" : "Load identity"}
                        </button>
                        <button className="libp2p-btn libp2p-btn--ghost" onClick={() => { onClearPendingFile(); setFilePassphrase(""); setFileError(null); }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

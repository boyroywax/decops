/**
 * NetworkPanel — Libp2pView's "Network" section.
 *
 * Lets the user choose between public libp2p network and a private (pnet)
 * pre-shared-key network, select a saved pnet entry, and unlock/lock it
 * with a passphrase. Pure presentation: parent owns all state and handlers.
 *
 * §3.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { Network, Globe, Lock, Unlock } from "lucide-react";
import type { PnetEntry } from "../../utils/collections";

interface NetworkPanelProps {
    isRunning: boolean;
    pnetMode: "public" | "private";
    setPnetMode: (v: "public" | "private") => void;
    pnetUnlockedLabel: string | null;
    pnetUnlockedKey: string | null;
    networks: PnetEntry[];
    selectedPnetId: string;
    setSelectedPnetId: (v: string) => void;
    pnetPassphrase: string;
    setPnetPassphrase: (v: string) => void;
    pnetBusy: boolean;
    pnetError: string | null;
    onUnlockPnet: () => void;
    onLockPnet: () => void;
    onOpenNetworksModal: () => void;
}

export function NetworkPanel({
    isRunning, pnetMode, setPnetMode, pnetUnlockedLabel, pnetUnlockedKey,
    networks, selectedPnetId, setSelectedPnetId,
    pnetPassphrase, setPnetPassphrase, pnetBusy, pnetError,
    onUnlockPnet, onLockPnet, onOpenNetworksModal,
}: NetworkPanelProps) {
    return (
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
                                        onClick={onOpenNetworksModal}
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
                                                    onClick={onUnlockPnet}
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
                                                onClick={onLockPnet}
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
    );
}

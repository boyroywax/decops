/**
 * PeersPanel — Libp2pView's "Peers" section.
 *
 * Lists discovered peers with connection status, latency, source, and
 * per-row actions (ping, dial/hang-up, add-to-contacts). Pure presentation:
 * parent owns peer state, contacts, busy flag, and all action handlers.
 *
 * §3.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { Trash2, Wifi, WifiOff, Activity, PowerOff, Link2, Check, UserPlus } from "lucide-react";
import type { PeerInfo } from "../../service";
import type { Contact } from "../../utils/collections";

interface PeersPanelProps {
    peers: PeerInfo[];
    connectedCount: number;
    contacts: Contact[];
    busy: boolean;
    onClearPeers: () => void;
    onPing: (peerId: string) => void;
    onHangUp: (peerId: string) => void;
    onDial: (peerId: string) => void;
    onAddContact: (peerId: string, multiaddr?: string) => void;
}

export function PeersPanel({
    peers, connectedCount, contacts, busy,
    onClearPeers, onPing, onHangUp, onDial, onAddContact,
}: PeersPanelProps) {
    return (
        <section className="libp2p-panel">
            <h3>
                Peers
                <span className="libp2p-badge">{connectedCount}/{peers.length}</span>
                <button
                    className="libp2p-icon-btn libp2p-icon-btn--right"
                    title="Clear peer book"
                    onClick={onClearPeers}
                    disabled={peers.length === 0 || busy}
                    aria-label="Clear peer book"
                >
                    <Trash2 size={12} />
                </button>
            </h3>
            {peers.length === 0 ? (
                <p className="libp2p-muted">No peers discovered yet.</p>
            ) : (
                <ul className="libp2p-peer-list">
                    {peers.map((p) => {
                        const saved = contacts.some((c) => c.peerId === p.id);
                        return (
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
                                            onClick={() => onPing(p.id)}
                                            aria-label="Ping"
                                        >
                                            <Activity size={12} />
                                        </button>
                                    )}
                                    {p.connected ? (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Disconnect"
                                            onClick={() => onHangUp(p.id)}
                                            aria-label="Disconnect"
                                        >
                                            <PowerOff size={12} />
                                        </button>
                                    ) : (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Dial"
                                            onClick={() => onDial(p.id)}
                                            aria-label="Dial"
                                            disabled={busy}
                                        >
                                            <Link2 size={12} />
                                        </button>
                                    )}
                                    <button
                                        className="libp2p-icon-btn"
                                        title={saved ? "Already in contacts" : "Add to contacts"}
                                        onClick={() => onAddContact(p.id, p.addrs?.[0])}
                                        aria-label={saved ? "Already in contacts" : "Add to contacts"}
                                        disabled={saved}
                                    >
                                        {saved ? <Check size={12} /> : <UserPlus size={12} />}
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * StartOptionsPanel — Libp2pView's "Start options" section.
 *
 * Wraps the start-time configuration UI: transport toggles, service toggles,
 * discovery toggles, and bootstrap-peer management (default list +
 * user-added entries + contact-picker import). Pure presentation: parent
 * owns all state and handlers.
 *
 * §3.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { Settings2, Plus, Trash2, BookUser, Check, Square } from "lucide-react";
import { DEFAULT_BOOTSTRAP } from "../../service";
import type {
    Libp2pServiceToggles,
    Libp2pDiscoveryToggles,
    Libp2pTransportToggles,
} from "../../service";
import type { Contact } from "../../utils/collections";
import { ToggleRow } from "./ToggleRow";

interface StartOptionsPanelProps {
    isRunning: boolean;
    transports: Required<Libp2pTransportToggles>;
    setTransports: (v: (prev: Required<Libp2pTransportToggles>) => Required<Libp2pTransportToggles>) => void;
    services: Required<Libp2pServiceToggles>;
    setServices: (v: (prev: Required<Libp2pServiceToggles>) => Required<Libp2pServiceToggles>) => void;
    discovery: Required<Libp2pDiscoveryToggles>;
    setDiscovery: (v: (prev: Required<Libp2pDiscoveryToggles>) => Required<Libp2pDiscoveryToggles>) => void;
    transportCount: number;
    enabledBootstrapCount: number;
    allBootstrap: string[];
    disabledBootstrap: Set<string>;
    setDisabledBootstrap: (v: Set<string>) => void;
    toggleBootstrap: (addr: string) => void;
    addBootstrap: (addr: string) => void;
    removeBootstrap: (addr: string) => void;
    bootstrapInput: string;
    setBootstrapInput: (v: string) => void;
    showContactPicker: boolean;
    setShowContactPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
    contacts: Contact[];
}

export function StartOptionsPanel({
    isRunning,
    transports, setTransports,
    services, setServices,
    discovery, setDiscovery,
    transportCount, enabledBootstrapCount, allBootstrap,
    disabledBootstrap, setDisabledBootstrap,
    toggleBootstrap, addBootstrap, removeBootstrap,
    bootstrapInput, setBootstrapInput,
    showContactPicker, setShowContactPicker,
    contacts,
}: StartOptionsPanelProps) {
    return (
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
                            onClick={() => setShowContactPicker((v: boolean) => !v)}
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
    );
}

/**
 * Libp2pView — main UI surface for the libp2p toolkit.
 *
 * Allows the user to start/stop a browser libp2p node, view their
 * peer id and listen addresses, dial peers by multiaddr, ping
 * connected peers, and exchange pubsub messages.
 */

import { useEffect, useMemo, useState } from "react";
import {
    Globe, Power, PowerOff, Link2, Radio, Trash2, Send,
    Wifi, WifiOff, RefreshCw, Copy, AlertTriangle, Activity,
} from "lucide-react";
import { useLibp2p } from "./Libp2pContext";
import { DEFAULT_BOOTSTRAP } from "./service";
import "./libp2p.css";

interface Libp2pViewProps {
    navigateTo?: (view: string) => void;
}

export function Libp2pView(_props: Libp2pViewProps) {
    const {
        snapshot, start, stop, dial, hangUp, ping,
        subscribeTopic, unsubscribeTopic, publish, clearPeers,
    } = useLibp2p();

    const [dialTarget, setDialTarget] = useState("");
    const [topic, setTopic] = useState("");
    const [pubMessage, setPubMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState<{ ts: number; msg: string; level: "info" | "error" }[]>([]);

    const addLog = (msg: string, level: "info" | "error" = "info") =>
        setLog((l) => [{ ts: Date.now(), msg, level }, ...l].slice(0, 100));

    const isRunning = snapshot.status === "running";

    const peers = useMemo(() => {
        return [...snapshot.peers].sort((a, b) =>
            (b.connected ? 1 : 0) - (a.connected ? 1 : 0) ||
            a.id.localeCompare(b.id),
        );
    }, [snapshot.peers]);

    const connectedCount = peers.filter((p) => p.connected).length;

    useEffect(() => {
        if (snapshot.error) addLog(snapshot.error, "error");
    }, [snapshot.error]);

    const handleStart = async () => {
        setBusy(true);
        try {
            await start();
            addLog("libp2p node started");
        } catch (err) {
            addLog(`Start failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        } finally {
            setBusy(false);
        }
    };

    const handleStop = async () => {
        setBusy(true);
        try {
            await stop();
            addLog("libp2p node stopped");
        } finally {
            setBusy(false);
        }
    };

    const handleDial = async () => {
        if (!dialTarget.trim()) return;
        setBusy(true);
        try {
            const { remotePeer } = await dial(dialTarget.trim());
            addLog(`Dialed ${remotePeer.slice(0, 16)}…`);
            setDialTarget("");
        } catch (err) {
            addLog(`Dial failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        } finally {
            setBusy(false);
        }
    };

    const handlePing = async (peerId: string) => {
        try {
            const ms = await ping(peerId);
            addLog(`Ping ${peerId.slice(0, 16)}… → ${ms} ms`);
        } catch (err) {
            addLog(`Ping failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    };

    const handleHangUp = async (peerId: string) => {
        try {
            await hangUp(peerId);
            addLog(`Disconnected ${peerId.slice(0, 16)}…`);
        } catch (err) {
            addLog(`Hangup failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    };

    const handleSubscribe = async () => {
        if (!topic.trim()) return;
        try {
            await subscribeTopic(topic.trim());
            addLog(`Subscribed to ${topic.trim()}`);
        } catch (err) {
            addLog(`Subscribe failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    };

    const handleUnsubscribe = async (t: string) => {
        try {
            await unsubscribeTopic(t);
            addLog(`Unsubscribed ${t}`);
        } catch (err) {
            addLog(`Unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    };

    const handlePublish = async () => {
        if (!topic.trim() || !pubMessage.trim()) return;
        try {
            await publish(topic.trim(), pubMessage);
            addLog(`Published to ${topic.trim()}`);
            setPubMessage("");
        } catch (err) {
            addLog(`Publish failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    };

    const copy = (text: string) => {
        try { navigator.clipboard?.writeText(text); } catch { /* noop */ }
    };

    return (
        <div className="libp2p-view">
            <header className="libp2p-header">
                <div className="libp2p-header-title">
                    <Globe size={18} />
                    <h2>libp2p</h2>
                    <span className={`libp2p-status libp2p-status--${snapshot.status}`}>
                        {snapshot.status}
                    </span>
                </div>
                <div className="libp2p-header-actions">
                    {!isRunning ? (
                        <button
                            className="libp2p-btn libp2p-btn--primary"
                            disabled={busy || snapshot.status === "starting"}
                            onClick={handleStart}
                        >
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

            {snapshot.error && (
                <div className="libp2p-alert">
                    <AlertTriangle size={14} /> {snapshot.error}
                </div>
            )}

            {/* ── Identity panel ── */}
            <section className="libp2p-panel">
                <h3>Identity</h3>
                {snapshot.peerId ? (
                    <>
                        <div className="libp2p-row">
                            <span className="libp2p-label">Peer ID</span>
                            <code className="libp2p-mono libp2p-mono--wrap">{snapshot.peerId}</code>
                            <button className="libp2p-icon-btn" title="Copy" onClick={() => copy(snapshot.peerId!)}>
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
                                            <button className="libp2p-icon-btn" title="Copy" onClick={() => copy(ma)}>
                                                <Copy size={12} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                ) : (
                    <p className="libp2p-muted">Start the node to generate a peer ID.</p>
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
                                    onClick={() => setDialTarget(ma)}
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
                        onClick={clearPeers}
                        disabled={peers.length === 0}
                    >
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
                                            onClick={() => handlePing(p.id)}
                                        >
                                            <Activity size={12} />
                                        </button>
                                    )}
                                    {p.connected ? (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Disconnect"
                                            onClick={() => handleHangUp(p.id)}
                                        >
                                            <PowerOff size={12} />
                                        </button>
                                    ) : (
                                        <button
                                            className="libp2p-icon-btn"
                                            title="Dial"
                                            onClick={() => setDialTarget(p.id)}
                                        >
                                            <Link2 size={12} />
                                        </button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ── Pubsub panel ── */}
            <section className="libp2p-panel">
                <h3><Radio size={14} /> Pubsub</h3>
                <div className="libp2p-form-row">
                    <input
                        type="text"
                        className="libp2p-input"
                        placeholder="topic name"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        disabled={!isRunning}
                    />
                    <button
                        className="libp2p-btn"
                        disabled={!isRunning || !topic.trim()}
                        onClick={handleSubscribe}
                    >
                        Subscribe
                    </button>
                </div>
                {snapshot.topics.length > 0 && (
                    <ul className="libp2p-topic-list">
                        {snapshot.topics.map((t) => (
                            <li key={t}>
                                <code className="libp2p-mono">{t}</code>
                                <button
                                    className="libp2p-icon-btn"
                                    title="Unsubscribe"
                                    onClick={() => handleUnsubscribe(t)}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="libp2p-form-row">
                    <input
                        type="text"
                        className="libp2p-input"
                        placeholder="message body"
                        value={pubMessage}
                        onChange={(e) => setPubMessage(e.target.value)}
                        disabled={!isRunning || !topic.trim()}
                    />
                    <button
                        className="libp2p-btn"
                        disabled={!isRunning || !topic.trim() || !pubMessage.trim()}
                        onClick={handlePublish}
                    >
                        <Send size={12} /> Publish
                    </button>
                </div>
            </section>

            {/* ── Activity log ── */}
            <section className="libp2p-panel">
                <h3>
                    Activity
                    <button
                        className="libp2p-icon-btn libp2p-icon-btn--right"
                        title="Clear"
                        onClick={() => setLog([])}
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
        </div>
    );
}

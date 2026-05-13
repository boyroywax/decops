/**
 * PubsubPanel — gossipsub topic + message UI for the active libp2p node.
 *
 * Responsibilities:
 *  • Subscribe / unsubscribe to topics.
 *  • Publish a UTF-8 string to a topic.
 *  • Display a live log of sent + received messages (most recent first),
 *    with topic filtering, direction tags, byte counts, and per-message
 *    copy / clear controls.
 *
 * All state mutations dispatch through the job creator so they appear
 * in the queue / timeline like every other libp2p action.
 */

import { useMemo, useState } from "react";
import { Radio, Send, Trash2, ArrowDownLeft, ArrowUpRight, Copy, RotateCcw } from "lucide-react";
import type { Libp2pSnapshot, PubsubMessage } from "../types/libp2p";

interface PubsubPanelProps {
    snapshot: Libp2pSnapshot;
    isRunning: boolean;
    onSubscribe: (topic: string) => void;
    onUnsubscribe: (topic: string) => void;
    onPublish: (topic: string, message: string) => void;
}

export function PubsubPanel({
    snapshot,
    isRunning,
    onSubscribe,
    onUnsubscribe,
    onPublish,
}: PubsubPanelProps) {
    const [topic, setTopic] = useState("");
    const [pubMessage, setPubMessage] = useState("");
    const [filter, setFilter] = useState<string>("");

    const handleSubscribe = () => {
        if (!topic.trim()) return;
        onSubscribe(topic.trim());
    };
    const handlePublish = () => {
        if (!topic.trim() || !pubMessage.trim()) return;
        onPublish(topic.trim(), pubMessage);
        setPubMessage("");
    };
    const copy = (t: string) => { try { navigator.clipboard?.writeText(t); } catch { /* */ } };

    const messages = snapshot.pubsubMessages ?? [];
    const filtered = useMemo(() => {
        if (!filter) return messages;
        return messages.filter((m) => m.topic === filter);
    }, [messages, filter]);

    const totals = useMemo(() => {
        let inN = 0, outN = 0;
        for (const m of messages) (m.direction === "in" ? inN++ : outN++);
        return { inN, outN };
    }, [messages]);

    return (
        <section className="libp2p-panel">
            <h3>
                <Radio size={14} /> Pubsub
                <span className="libp2p-pubsub-counters" aria-label="pubsub message counts">
                    <span className="libp2p-pubsub-counter libp2p-pubsub-counter--in" title="received">
                        <ArrowDownLeft size={11} /> {totals.inN}
                    </span>
                    <span className="libp2p-pubsub-counter libp2p-pubsub-counter--out" title="sent">
                        <ArrowUpRight size={11} /> {totals.outN}
                    </span>
                </span>
            </h3>

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
                    {snapshot.topics.map((t) => {
                        const isFiltered = filter === t;
                        return (
                            <li key={t}>
                                <button
                                    type="button"
                                    className={`libp2p-topic-chip${isFiltered ? " libp2p-topic-chip--active" : ""}`}
                                    title={isFiltered ? "Clear filter" : "Filter messages by this topic"}
                                    onClick={() => setFilter(isFiltered ? "" : t)} aria-label={isFiltered ? "Clear filter" : "Filter messages by this topic"}
                                >
                                    <code className="libp2p-mono">{t}</code>
                                </button>
                                <button
                                    className="libp2p-icon-btn"
                                    title="Unsubscribe"
                                    onClick={() => onUnsubscribe(t)} aria-label="Unsubscribe"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </li>
                        );
                    })}
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
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handlePublish();
                        }
                    }}
                />
                <button
                    className="libp2p-btn"
                    disabled={!isRunning || !topic.trim() || !pubMessage.trim()}
                    onClick={handlePublish}
                >
                    <Send size={12} /> Publish
                </button>
            </div>

            <div className="libp2p-pubsub-log-header">
                <span className="libp2p-muted libp2p-muted--small">
                    Messages ({filtered.length}{filter ? ` on "${filter}"` : ""})
                </span>
                {filter && (
                    <button
                        className="libp2p-icon-btn"
                        title="Clear topic filter"
                        onClick={() => setFilter("")} aria-label="Clear topic filter"
                    >
                        <RotateCcw size={11} />
                    </button>
                )}
            </div>

            {filtered.length === 0 ? (
                <p className="libp2p-muted">
                    {isRunning ? "No messages yet. Subscribe to a topic and publish to start." : "Start the node to see pubsub traffic."}
                </p>
            ) : (
                <ul className="libp2p-pubsub-log">
                    {filtered.map((m) => (
                        <PubsubMessageRow key={m.id} message={m} onCopy={copy} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function PubsubMessageRow({
    message,
    onCopy,
}: { message: PubsubMessage; onCopy: (t: string) => void }) {
    const isOut = message.direction === "out";
    return (
        <li className={`libp2p-pubsub-msg libp2p-pubsub-msg--${message.direction}`}>
            <div className="libp2p-pubsub-msg-meta">
                <span
                    className={`libp2p-pubsub-dir libp2p-pubsub-dir--${message.direction}`}
                    title={isOut ? "Sent" : "Received"}
                >
                    {isOut ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
                </span>
                <code className="libp2p-mono libp2p-pubsub-msg-topic">{message.topic}</code>
                <span className="libp2p-muted libp2p-muted--small">
                    {new Date(message.at).toLocaleTimeString()} · {message.bytes}B
                </span>
                {message.from && (
                    <span
                        className="libp2p-muted libp2p-muted--small libp2p-pubsub-msg-from"
                        title={message.from}
                    >
                        {isOut ? "from " : "from "}
                        {message.from.slice(0, 14)}…
                    </span>
                )}
                <button
                    className="libp2p-icon-btn"
                    title="Copy message"
                    aria-label="Copy message"
                    onClick={() => onCopy(message.data)}
                >
                    <Copy size={11} />
                </button>
            </div>
            <pre className="libp2p-pubsub-msg-body">{message.data || <span className="libp2p-muted">(empty)</span>}</pre>
        </li>
    );
}

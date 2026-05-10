/**
 * Libp2pBotModal — full-screen dialog for the libp2p AI sub-agent.
 *
 * Reuses the Libp2pBotPanel for status/log/config and adds a chat-style
 * prompt input that calls `handleLibp2pBotRequest` directly via the
 * shared `CommandContext`.
 */

import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useCommandCtx } from "@/context/CommandContextProvider";
import { handleLibp2pBotRequest } from "../libp2pBot";
import type { Libp2pBotResponse } from "../types/libp2pBot";
import { Libp2pBotPanel } from "./Libp2pBotPanel";

interface Libp2pBotModalProps {
    open: boolean;
    onClose: () => void;
}

const SUGGESTED_PROMPTS: string[] = [
    "Start the active node with default services",
    "Subscribe to topic decops.discovery and publish hello",
    "List connected peers and ping the first one",
    "Generate a new identity and store it in the vault",
];

export function Libp2pBotModal({ open, onClose }: Libp2pBotModalProps) {
    const ctx = useCommandCtx();
    const [input, setInput] = useState("");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<{ prompt: string; response: Libp2pBotResponse }[]>([]);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (open) {
            // Focus shortly after mount so the textarea grabs the cursor.
            const t = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(t);
        }
    }, [open]);

    useEffect(() => {
        // Keep the conversation pinned to the latest message.
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [history.length, running]);

    if (!open) return null;

    const submit = async (text: string) => {
        const instruction = text.trim();
        if (!instruction || running) return;
        if (!ctx) {
            setError("Command context unavailable — try opening libp2p from the main app shell.");
            return;
        }
        setError(null);
        setRunning(true);
        try {
            const response = await handleLibp2pBotRequest(
                {
                    id: `libp2p-bot-modal-${Date.now()}`,
                    instruction,
                    source: "user",
                    timestamp: Date.now(),
                },
                ctx,
            );
            setHistory((prev) => [...prev, { prompt: instruction, response }]);
            setInput("");
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setRunning(false);
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit(input);
        }
    };

    return (
        <div className="libp2p-modal-backdrop" onClick={onClose}>
            <div
                className="libp2p-modal libp2p-bot-modal"
                role="dialog"
                aria-modal="true"
                aria-label="libp2p AI agent"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="libp2p-modal-header">
                    <div className="libp2p-bot-modal__title">
                        <GradientIcon icon={Bot} size={18} gradient={["#38bdf8", "#a78bfa"]} />
                        <div>
                            <h3>libp2p Bot</h3>
                            <span className="libp2p-bot-modal__subtitle">
                                Direct line to the libp2p sub-agent
                            </span>
                        </div>
                    </div>
                    <button className="libp2p-modal-close" onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </header>

                <div className="libp2p-bot-modal__body">
                    {/* Left: status / config / history panel */}
                    <aside className="libp2p-bot-modal__aside">
                        <Libp2pBotPanel compact />
                    </aside>

                    {/* Right: chat-style conversation */}
                    <section className="libp2p-bot-modal__chat">
                        <div ref={scrollRef} className="libp2p-bot-modal__history">
                            {history.length === 0 && !running && (
                                <div className="libp2p-bot-modal__empty">
                                    <GradientIcon icon={Bot} size={28} gradient={["#38bdf8", "#a78bfa"]} />
                                    <h4>Ask the libp2p bot anything</h4>
                                    <p>
                                        It can start/stop nodes, dial peers, subscribe to topics,
                                        publish messages, manage identities, and more — all
                                        scoped to the libp2p tool surface.
                                    </p>
                                    <div className="libp2p-bot-modal__suggestions">
                                        {SUGGESTED_PROMPTS.map((p) => (
                                            <button
                                                key={p}
                                                className="libp2p-bot-modal__suggestion"
                                                onClick={() => submit(p)}
                                                disabled={running}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {history.map((turn, i) => (
                                <div key={i} className="libp2p-bot-modal__turn">
                                    <div className="libp2p-bot-modal__msg libp2p-bot-modal__msg--user">
                                        <span className="libp2p-bot-modal__role">You</span>
                                        <p>{turn.prompt}</p>
                                    </div>
                                    <div
                                        className={
                                            "libp2p-bot-modal__msg libp2p-bot-modal__msg--bot " +
                                            (turn.response.success
                                                ? "libp2p-bot-modal__msg--ok"
                                                : "libp2p-bot-modal__msg--err")
                                        }
                                    >
                                        <span className="libp2p-bot-modal__role">
                                            {turn.response.success ? (
                                                <CheckCircle2 size={11} />
                                            ) : (
                                                <AlertTriangle size={11} />
                                            )}
                                            libp2p Bot · {turn.response.duration_ms}ms
                                        </span>
                                        <p>{turn.response.summary}</p>
                                        {turn.response.operations.length > 0 && (
                                            <div className="libp2p-bot-modal__ops">
                                                {turn.response.operations.map((op, j) => (
                                                    <span
                                                        key={j}
                                                        className={
                                                            "libp2p-bot-modal__op " +
                                                            (op.status === "failed"
                                                                ? "libp2p-bot-modal__op--err"
                                                                : "")
                                                        }
                                                        title={
                                                            op.error ||
                                                            (op.result
                                                                ? JSON.stringify(op.result).slice(0, 200)
                                                                : op.description)
                                                        }
                                                    >
                                                        {op.command}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {turn.response.suggestions.length > 0 && (
                                            <ul className="libp2p-bot-modal__hints">
                                                {turn.response.suggestions.map((s, k) => (
                                                    <li key={k}>{s}</li>
                                                ))}
                                            </ul>
                                        )}
                                        {turn.response.error && (
                                            <p className="libp2p-bot-modal__error-line">
                                                {turn.response.error}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {running && (
                                <div className="libp2p-bot-modal__msg libp2p-bot-modal__msg--bot libp2p-bot-modal__msg--loading">
                                    <Loader2 size={12} className="libp2p-bot-modal__spinner" />
                                    Thinking and running tools…
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="libp2p-bot-modal__alert">
                                <AlertTriangle size={12} /> {error}
                            </div>
                        )}

                        <form
                            className="libp2p-bot-modal__form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void submit(input);
                            }}
                        >
                            <textarea
                                ref={inputRef}
                                className="libp2p-bot-modal__input"
                                placeholder="Tell the libp2p bot what to do… (Enter to send, Shift+Enter for newline)"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={onKeyDown}
                                rows={2}
                                disabled={running}
                            />
                            <button
                                type="submit"
                                className="libp2p-bot-modal__send"
                                disabled={running || !input.trim()}
                                title="Send (Enter)"
                            >
                                {running ? <Loader2 size={14} className="libp2p-bot-modal__spinner" /> : <Send size={14} />}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
}

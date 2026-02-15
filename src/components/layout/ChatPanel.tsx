import { useState, useRef, useEffect, useCallback } from "react";
import { X, AlignJustify, MessageCircle } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { chatWithWorkspace, getSelectedModel } from "../../services/ai";
import type { ChatMessage, WorkspaceContext } from "../../services/ai";
import { ANTHROPIC_MODELS } from "../../constants";
import MessageBubble from "../chat/MessageBubble";
import { loadConversations, saveConversations, loadActiveId, saveActiveId, makeId, deriveTitle } from "../chat/utils";
import type { Conversation } from "../chat/types";

interface ChatPanelProps {
    context: WorkspaceContext;
    onClose: () => void;
    addLog?: (msg: string) => void;
}

export function ChatPanel({ context, onClose, addLog }: ChatPanelProps) {
    const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
    const [activeId, setActiveId] = useState<string | null>(loadActiveId);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showConvos, setShowConvos] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Derive active conversation
    const active = conversations.find(c => c.id === activeId) || null;
    const messages = active?.messages || [];

    // Persist
    useEffect(() => {
        saveConversations(conversations);
    }, [conversations]);

    useEffect(() => {
        saveActiveId(activeId);
    }, [activeId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, loading]);

    useEffect(() => {
        if (!showConvos) inputRef.current?.focus();
    }, [showConvos, activeId]);

    const updateConversation = useCallback((id: string, msgs: ChatMessage[]) => {
        setConversations(prev => prev.map(c =>
            c.id === id
                ? { ...c, messages: msgs, title: deriveTitle(msgs), updatedAt: Date.now() }
                : c
        ));
    }, []);

    const createNewChat = useCallback(() => {
        const id = makeId();
        const convo: Conversation = {
            id,
            title: "New Chat",
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        setConversations(prev => [convo, ...prev]);
        setActiveId(id);
        setShowConvos(false);
    }, []);

    const switchTo = useCallback((id: string) => {
        setActiveId(id);
        setShowConvos(false);
    }, []);

    const deleteConvo = useCallback((id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeId === id) {
            const remaining = conversations.filter(c => c.id !== id);
            setActiveId(remaining.length > 0 ? remaining[0].id : null);
        }
    }, [activeId, conversations]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput("");

        // Auto-create conversation if none active
        let currentId = activeId;
        if (!currentId) {
            const id = makeId();
            const convo: Conversation = {
                id,
                title: "New Chat",
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setConversations(prev => [convo, ...prev]);
            setActiveId(id);
            currentId = id;
        }

        const userMsg: ChatMessage = { role: "user", content: text };
        const currentMessages = conversations.find(c => c.id === currentId)?.messages || [];
        const updatedMsgs = [...currentMessages, userMsg];
        updateConversation(currentId, updatedMsgs);
        setLoading(true);

        try {
            const response = await chatWithWorkspace(text, currentMessages, context);
            const finalMsgs = [...updatedMsgs, { role: "assistant" as const, content: response }];
            updateConversation(currentId, finalMsgs);
            addLog?.(`Chat: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`);
        } catch (err) {
            const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `Error: ${err instanceof Error ? err.message : String(err)}` }];
            updateConversation(currentId, errMsg);
        } finally {
            setLoading(false);
        }
    }, [input, loading, activeId, conversations, context, addLog, updateConversation]);

    const [height, setHeight] = useState(400);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 200 && newHeight < window.innerHeight - 100) {
                setHeight(newHeight);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    const modelId = getSelectedModel();
    const modelLabel = ANTHROPIC_MODELS.find(m => m.id === modelId)?.label || modelId;

    return (
        <div style={{
            height,
            background: "rgba(0,0,0,0.8)",
            borderTop: "1px solid rgba(0,229,160,0.12)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
            backdropFilter: "blur(12px)",
            position: "relative",
            transition: isResizing ? "none" : "height 0.1s ease-out",
        }}>
            {/* Resize Handle */}
            <div
                onMouseDown={startResizing}
                style={{
                    position: "absolute",
                    top: -4,
                    left: 0,
                    right: 0,
                    height: 8,
                    cursor: "ns-resize",
                    zIndex: 10,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)" }} />
            </div>

            {/* Header */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.1em" }}>WORKSPACE CHAT</span>
                    <span style={{ fontSize: 9, color: "#3f3f46", background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 4 }}>{modelLabel}</span>
                    <span style={{ color: "#27272a", fontSize: 10 }}>│</span>
                    {/* Conversations toggle */}
                    <button
                        onClick={() => setShowConvos(!showConvos)}
                        style={{
                            background: showConvos ? "rgba(0,229,160,0.08)" : "none",
                            border: "none",
                            color: showConvos ? "#00e5a0" : "#52525b",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 9,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 6px",
                            borderRadius: 3,
                            transition: "all 0.15s",
                        }}
                    >
                        <AlignJustify size={9} />
                        Conversations
                        {conversations.length > 0 && (
                            <span style={{
                                fontSize: 8,
                                background: showConvos ? "rgba(0,229,160,0.15)" : "rgba(255,255,255,0.06)",
                                padding: "0 4px",
                                borderRadius: 4,
                                color: showConvos ? "#00e5a0" : "#52525b",
                            }}>{conversations.length}</span>
                        )}
                    </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                        onClick={createNewChat}
                        style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 9, fontFamily: "inherit", padding: "2px 6px" }}
                        title="New conversation"
                    >+ New</button>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: "0 4px", lineHeight: 1, display: "flex", alignItems: "center" }}
                        title="Close chat"
                    ><X size={14} /></button>
                </div>
            </div>

            {/* Body: either conversations list or chat */}
            {showConvos ? (
                /* Conversations list */
                <div style={{ flex: 1, overflow: "auto", padding: "8px 10px" }}>
                    {conversations.length === 0 && (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "#3f3f46" }}>
                            <div style={{ fontSize: 11, marginBottom: 6 }}>No conversations yet</div>
                            <button
                                onClick={createNewChat}
                                style={{
                                    background: "rgba(0,229,160,0.08)",
                                    border: "1px solid rgba(0,229,160,0.2)",
                                    borderRadius: 6,
                                    padding: "6px 14px",
                                    color: "#00e5a0",
                                    fontSize: 11,
                                    fontFamily: "inherit",
                                    cursor: "pointer",
                                }}
                            >+ Start a conversation</button>
                        </div>
                    )}
                    {conversations.map(c => (
                        <div
                            key={c.id}
                            onClick={() => switchTo(c.id)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 10px",
                                borderRadius: 6,
                                cursor: "pointer",
                                background: c.id === activeId ? "rgba(0,229,160,0.06)" : "transparent",
                                border: c.id === activeId ? "1px solid rgba(0,229,160,0.12)" : "1px solid transparent",
                                marginBottom: 2,
                                transition: "all 0.1s",
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 11,
                                    color: c.id === activeId ? "#e4e4e7" : "#a1a1aa",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontWeight: c.id === activeId ? 500 : 400,
                                }}>{c.title}</div>
                                <div style={{ fontSize: 9, color: "#3f3f46", marginTop: 2, display: "flex", gap: 8 }}>
                                    <span>{c.messages.length} msgs</span>
                                    <span>{new Date(c.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); deleteConvo(c.id); }}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "#3f3f46",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    padding: "2px 6px",
                                    flexShrink: 0,
                                    opacity: 0.5,
                                    transition: "opacity 0.1s",
                                }}
                                title="Delete conversation"
                                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                            ><X size={12} /></button>
                        </div>
                    ))}
                </div>
            ) : (
                /* Chat messages */
                <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
                    {messages.length === 0 && !loading && (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "#3f3f46" }}>
                            <GradientIcon icon={MessageCircle} size={24} gradient={["#00e5a0", "#38bdf8"]} />
                            <div style={{ fontSize: 11, marginBottom: 4 }}>Workspace AI Assistant</div>
                            <div style={{ fontSize: 10, color: "#27272a", maxWidth: 300, margin: "0 auto", lineHeight: 1.5 }}>
                                Ask about your agents, channels, groups, topology — or request workspace actions.
                            </div>
                        </div>
                    )}
                    {messages.map((m, i) => <MessageBubble key={i} msg={m} context={context} />)}
                    {loading && (
                        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                            <div style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: "12px 12px 12px 2px",
                                padding: "8px 16px",
                                fontSize: 12,
                                color: "#52525b",
                            }}>
                                <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>●</span>
                                <span style={{ animation: "pulse 1.5s ease-in-out 0.3s infinite" }}> ●</span>
                                <span style={{ animation: "pulse 1.5s ease-in-out 0.6s infinite" }}> ●</span>
                            </div>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>
            )}

            {/* Input (always visible) */}
            {!showConvos && (
                <div style={{
                    padding: "8px 14px",
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    gap: 8,
                    flexShrink: 0,
                }}>
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Ask about your workspace..."
                        disabled={loading}
                        style={{
                            flex: 1,
                            background: "rgba(0,0,0,0.4)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 8,
                            padding: "8px 12px",
                            color: "#e4e4e7",
                            fontSize: 12,
                            fontFamily: "inherit",
                            outline: "none",
                        }}
                    />
                    <button
                        onClick={send}
                        disabled={loading || !input.trim()}
                        style={{
                            background: input.trim() && !loading ? "rgba(0,229,160,0.15)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${input.trim() && !loading ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.06)"}`,
                            borderRadius: 8,
                            padding: "8px 14px",
                            color: input.trim() && !loading ? "#00e5a0" : "#3f3f46",
                            cursor: input.trim() && !loading ? "pointer" : "default",
                            fontSize: 12,
                            fontFamily: "inherit",
                            transition: "all 0.15s",
                        }}
                    >Send</button>
                </div>
            )}
        </div>
    );
}

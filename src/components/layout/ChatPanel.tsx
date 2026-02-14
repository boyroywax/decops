import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Bot, ArrowLeftRight, Hexagon, MessageSquare, Sparkles, Settings, PlusCircle, X, AlignJustify, MessageCircle, Image, FileJson, FileText } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { chatWithWorkspace, getSelectedModel } from "../../services/ai";
import type { ChatMessage, WorkspaceContext } from "../../services/ai";
import { ANTHROPIC_MODELS } from "../../constants";
import { marked } from "marked";

// Configure marked for safe, styled rendering
marked.setOptions({
    breaks: true,
    gfm: true,
});

interface ChatPanelProps {
    context: WorkspaceContext;
    onClose: () => void;
    addLog?: (msg: string) => void;
}

interface ParsedAction {
    type: string;
    [key: string]: any;
}

interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

const STORAGE_KEY = "decops_chat_conversations";
const ACTIVE_KEY = "decops_chat_active_id";

function loadConversations(): Conversation[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch { return []; }
}

function saveConversations(convos: Conversation[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

function loadActiveId(): string | null {
    return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string | null) {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
}

function makeId(): string {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function deriveTitle(msgs: ChatMessage[]): string {
    const first = msgs.find(m => m.role === "user");
    if (!first) return "New Chat";
    const text = first.content.slice(0, 32);
    return text + (first.content.length > 32 ? "…" : "");
}

function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
    const actions: ParsedAction[] = [];
    const cleanText = text.replace(/```action\n([\s\S]*?)```/g, (_, json) => {
        try {
            const action = JSON.parse(json.trim());
            actions.push(action);
            return "";
        } catch {
            return `\`\`\`\n${json}\`\`\``;
        }
    }).trim();
    return { cleanText, actions };
}



function ActionCard({ action, context }: { action: ParsedAction; context: WorkspaceContext }) {
    const typeLabels: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
        create_agent: { icon: <Bot size={12} color="#00e5a0" />, color: "#00e5a0", label: "Create Agent" },
        create_channel: { icon: <ArrowLeftRight size={12} color="#a78bfa" />, color: "#a78bfa", label: "Create Channel" },
        create_group: { icon: <Hexagon size={12} color="#f472b6" />, color: "#f472b6", label: "Create Group" },
        send_message: { icon: <MessageSquare size={12} color="#fbbf24" />, color: "#fbbf24", label: "Send Message" },
        generate_mesh: { icon: <Sparkles size={12} color="#fbbf24" />, color: "#fbbf24", label: "Generate Mesh" },
    };

    const meta = typeLabels[action.type] || { icon: <Settings size={12} color="#71717a" />, color: "#71717a", label: action.type };
    const details = Object.entries(action)
        .filter(([k]) => k !== "type")
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);

    // Check if this action is associated with a job
    const matchingJob = context.jobs?.find(j =>
        j.type === action.type &&
        JSON.stringify(j.request) === JSON.stringify(action)
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case "queued": return "#fbbf24";
            case "running": return "#38bdf8";
            case "completed": return "#00e5a0";
            case "failed": return "#ef4444";
            default: return "#71717a";
        }
    };

    const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);

    return (
        <div style={{
            background: `${meta.color}08`,
            border: `1px solid ${meta.color}30`,
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 6,
            fontSize: 11,
            position: "relative",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: meta.color, display: "flex", alignItems: "center" }}>{meta.icon}</span>
                    <span style={{ color: meta.color, fontWeight: 600, fontSize: 10, letterSpacing: "0.05em" }}>{meta.label}</span>
                </div>

                {matchingJob ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                            fontSize: 9,
                            color: getStatusColor(matchingJob.status),
                            background: getStatusColor(matchingJob.status) + "20",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                        }}>
                            <span style={{
                                display: "inline-block", width: 4, height: 4, borderRadius: "50%",
                                background: getStatusColor(matchingJob.status),
                                boxShadow: matchingJob.status === "running" ? `0 0 4px ${getStatusColor(matchingJob.status)}` : "none"
                            }} />
                            {matchingJob.status.toUpperCase()}
                        </span>
                    </div>
                ) : (
                    context.addJob && (
                        <button
                            onClick={() => context.addJob!({ type: action.type, request: action })}
                            style={{
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "#a1a1aa",
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: 9,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                transition: "all 0.15s"
                            }}
                            title="Add to Job Queue"
                        >
                            <PlusCircle size={10} /> Add to Job
                        </button>
                    )
                )}
            </div>

            {details.map((d, i) => (
                <div key={i} style={{ color: "#a1a1aa", fontSize: 10, marginLeft: 16 }}>{d}</div>
            ))}

            {matchingJob && matchingJob.status === "completed" && matchingJob.artifacts.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>Generated Artifacts:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {matchingJob.artifacts.map((art: any) => (
                            <button
                                key={art.id}
                                onClick={() => setExpandedArtifact(expandedArtifact === art.id ? null : art.id)}
                                style={{
                                    background: expandedArtifact === art.id ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                                    border: `1px solid ${expandedArtifact === art.id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                                    borderRadius: 4,
                                    padding: "2px 6px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    color: expandedArtifact === art.id ? "#fff" : "#e4e4e7",
                                    cursor: "pointer",
                                    fontSize: 10,
                                    fontFamily: "inherit"
                                }}
                            >
                                {art.type === "image" ? <Image size={10} /> : art.type === "json" ? <FileJson size={10} /> : <FileText size={10} />}
                                {art.name}
                            </button>
                        ))}
                    </div>
                    {expandedArtifact && (() => {
                        const art = matchingJob.artifacts.find((a: any) => a.id === expandedArtifact);
                        if (!art) return null;

                        let content = art.content;
                        if (!content && art.url) {
                            content = typeof art.url === "object" ? JSON.stringify(art.url, null, 2) : art.url;
                        }

                        return (
                            <div style={{
                                marginTop: 8,
                                background: "rgba(0,0,0,0.3)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 6,
                                padding: 8,
                                fontSize: 10,
                                fontFamily: "monospace",
                                color: "#d4d4d8",
                                overflowX: "auto",
                                maxHeight: 200,
                                whiteSpace: "pre-wrap"
                            }}>
                                {content || "No content available"}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}

function MessageBubble({ msg, context }: { msg: ChatMessage; context: WorkspaceContext }) {
    const isUser = msg.role === "user";
    const { cleanText, actions } = parseActions(msg.content);

    const renderedHtml = useMemo(() => {
        if (isUser) return null;
        try {
            return marked.parse(cleanText) as string;
        } catch {
            return null;
        }
    }, [cleanText, isUser]);

    return (
        <div style={{
            display: "flex",
            justifyContent: isUser ? "flex-end" : "flex-start",
            marginBottom: 8,
        }}>
            <div
                className={isUser ? undefined : "chat-md"}
                style={{
                    maxWidth: "85%",
                    background: isUser ? "rgba(0,229,160,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isUser ? "rgba(0,229,160,0.2)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "8px 12px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#e4e4e7",
                    wordBreak: "break-word",
                    ...(isUser ? { whiteSpace: "pre-wrap" as const } : {}),
                }}
            >
                {isUser || !renderedHtml
                    ? cleanText
                    : <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                }
                {actions.map((a, i) => <ActionCard key={i} action={a} context={context} />)}
            </div>
        </div>
    );
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

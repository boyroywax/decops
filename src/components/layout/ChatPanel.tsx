import { useState, useRef, useEffect, useCallback } from "react";
import { X, AlignJustify, MessageCircle } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { chatWithWorkspace, getSelectedModel } from "../../services/ai";
import type { ChatMessage, WorkspaceContext } from "../../services/ai";
import { ANTHROPIC_MODELS } from "../../constants";
import MessageBubble from "../chat/MessageBubble";
import { loadConversations, saveConversations, loadActiveId, saveActiveId, makeId, deriveTitle } from "../chat/utils";
import type { Conversation } from "../chat/types";
import { useCommandContext } from "../../hooks/useCommandContext";
import { useJobsContext } from "../../context/JobsContext";
import { useArchitect } from "../../hooks/useArchitect";
import { useEcosystem } from "../../hooks/useEcosystem"; // This might not be needed if ecosystem is passed as prop
import { useAuth } from "../../context/AuthContext";
import { registry } from "../../services/commands/init"; // This import is not used directly here, but might be elsewhere
import { registry as commandRegistry } from "../../services/commands/registry";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import "../../styles/components/chat-panel.css";

interface ChatPanelProps {
    context: WorkspaceContext;
    ecosystem?: any; // Automated ecosystem object
    onClose: () => void;
    addLog?: (msg: string) => void;
}

export function ChatPanel({ context, ecosystem, onClose, addLog }: ChatPanelProps) {
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

    // Build Commmand Context for CLI
    const { user } = useAuth();
    const jobs = useJobsContext();
    const architect = useArchitect(addLog, jobs.addJob, jobs.jobs);

    // We only have access to React Context "workspace" via imported hook, NOT via prop.
    // The prop `context` is `WorkspaceContext` interface (data only), not the Hook result.
    // BUT `useCommandContext` expects `WorkspaceContextType` which has setters.
    // We need to use the hook `useWorkspaceContext` here to get full context!
    // The prop `context` passed from Footer is just a data snapshot used for AI context.

    const workspaceCtx = useWorkspaceContext(); // This gives us setters too!

    // Determine which ecosystem object to use. 
    // If passed via props, use it. usage of useEcosystem inside ChatPanel would be wrong.
    // If not passed, we can't run ecosystem commands safely.

    const commandContext = useCommandContext({
        workspace: workspaceCtx,
        user,
        jobs,
        ecosystem: ecosystem || { ecosystems: [], bridges: [] }, // Fallback if missing, some cmds might fail
        architect,
        addLog: addLog || (() => { })
    });

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
            // CLI INTERCEPTION
            if (text.startsWith("/")) {
                const part1 = text.split(" ")[0];
                const commandId = part1.slice(1); // remove /
                const argsString = text.slice(part1.length).trim();

                let args: any = {};
                if (argsString) {
                    // 1. Try JSON
                    if (argsString.startsWith("{")) {
                        try {
                            args = JSON.parse(argsString);
                        } catch (e) {
                            // ignore
                        }
                    }
                    // 2. Try Key=Value if empty (simple regex)
                    if (Object.keys(args).length === 0 && argsString.includes("=")) {
                        const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
                        let match;
                        while ((match = regex.exec(argsString)) !== null) {
                            const key = match[1];
                            const value = match[2] || match[3];
                            args[key] = value;
                        }
                    }
                    // 3. If still empty and string exists, maybe it's a "query" or default arg?
                    // Some commands might take a single string.
                    // But our registry expects named args.
                    // We'll leave it empty if parsing failed, or put raw string in "input"?
                }

                addLog?.(`CLI: Executing /${commandId}`);

                // Execute
                await commandRegistry.execute(commandId, args, commandContext);

                const successMsg = [...updatedMsgs, { role: "assistant" as const, content: `✅ Command \`/${commandId}\` executed successfully.` }];
                updateConversation(currentId, successMsg);
            } else {
                const response = await chatWithWorkspace(text, currentMessages, context);
                const finalMsgs = [...updatedMsgs, { role: "assistant" as const, content: response }];
                updateConversation(currentId, finalMsgs);
                addLog?.(`Chat: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`);
            }
        } catch (err) {
            const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `Error: ${err instanceof Error ? err.message : String(err)}` }];
            updateConversation(currentId, errMsg);
        } finally {
            setLoading(false);
        }
    }, [input, loading, activeId, conversations, context, addLog, updateConversation, commandContext]);

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

    const isReady = !!input.trim() && !loading;

    return (
        <div className={`chat-panel${isResizing ? " chat-panel--resizing" : ""}`} style={{ height }}>
            {/* Resize Handle */}
            <div onMouseDown={startResizing} className="chat-panel__resize-handle">
                <div className="chat-panel__resize-indicator" />
            </div>

            {/* Header */}
            <div className="chat-panel__header">
                <div className="chat-panel__header-left">
                    <span className="chat-panel__title">WORKSPACE CHAT</span>
                    <span className="chat-panel__model-badge">{modelLabel}</span>
                    <span className="chat-panel__separator">│</span>
                    {/* Conversations toggle */}
                    <button
                        onClick={() => setShowConvos(!showConvos)}
                        className={`chat-panel__convos-toggle${showConvos ? " chat-panel__convos-toggle--active" : ""}`}
                    >
                        <AlignJustify size={9} />
                        Conversations
                        {conversations.length > 0 && (
                            <span className={`chat-panel__convos-count${showConvos ? " chat-panel__convos-count--active" : ""}`}>{conversations.length}</span>
                        )}
                    </button>
                </div>
                <div className="chat-panel__header-right">
                    <button
                        onClick={createNewChat}
                        className="chat-panel__new-btn"
                        title="New conversation"
                    >+ New</button>
                    <button
                        onClick={onClose}
                        className="chat-panel__close-btn"
                        title="Close chat"
                    ><X size={14} /></button>
                </div>
            </div>

            {/* Body: either conversations list or chat */}
            {showConvos ? (
                /* Conversations list */
                <div className="chat-panel__convos-list">
                    {conversations.length === 0 && (
                        <div className="chat-panel__empty-state">
                            <div className="chat-panel__empty-text">No conversations yet</div>
                            <button
                                onClick={createNewChat}
                                className="chat-panel__start-btn"
                            >+ Start a conversation</button>
                        </div>
                    )}
                    {conversations.map(c => (
                        <div
                            key={c.id}
                            onClick={() => switchTo(c.id)}
                            className={`chat-panel__convo-item${c.id === activeId ? " chat-panel__convo-item--active" : ""}`}
                        >
                            <div className="chat-panel__convo-info">
                                <div className="chat-panel__convo-title">{c.title}</div>
                                <div className="chat-panel__convo-meta">
                                    <span>{c.messages.length} msgs</span>
                                    <span>{new Date(c.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); deleteConvo(c.id); }}
                                className="chat-panel__convo-delete"
                                title="Delete conversation"
                            ><X size={12} /></button>
                        </div>
                    ))}
                </div>
            ) : (
                /* Chat messages */
                <div className="chat-panel__messages">
                    {messages.length === 0 && !loading && (
                        <div className="chat-panel__chat-empty">
                            <GradientIcon icon={MessageCircle} size={24} gradient={["#00e5a0", "#38bdf8"]} />
                            <div className="chat-panel__chat-empty-title">Workspace AI Assistant</div>
                            <div className="chat-panel__chat-empty-desc">
                                Ask about your agents, channels, groups, topology — or request workspace actions.
                            </div>
                        </div>
                    )}
                    {messages.map((m, i) => <MessageBubble key={i} msg={m} context={context} />)}
                    {loading && (
                        <div className="chat-panel__loading">
                            <div className="chat-panel__loading-bubble">
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
                <div className="chat-panel__input-area">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Ask about your workspace..."
                        disabled={loading}
                        className="chat-panel__input"
                    />
                    <button
                        onClick={send}
                        disabled={loading || !input.trim()}
                        className={`chat-panel__send-btn${isReady ? " chat-panel__send-btn--ready" : ""}`}
                    >Send</button>
                </div>
            )}
        </div>
    );
}

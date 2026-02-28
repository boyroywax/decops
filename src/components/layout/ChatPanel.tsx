import { useState, useRef, useEffect, useCallback } from "react";
import { X, AlignJustify, MessageCircle, ChevronsUp, ChevronsDown, Clapperboard, Edit3, Eye } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { chatWithWorkspace, streamChatWithWorkspace, getSelectedModel } from "../../services/ai";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext, StreamCallbacks } from "../../services/ai";
import { useLLM } from "../../context/LLMContext";
import MessageBubble from "../chat/MessageBubble";
import { loadConversations, saveConversations, loadActiveId, saveActiveId, makeId, deriveTitle } from "../chat/utils";
import type { Conversation } from "../chat/types";
import { useCommandContext } from "../../hooks/useCommandContext";
import { useJobsContext } from "../../context/JobsContext";
import { useArchitect } from "../../hooks/useArchitect";
import { useEcosystem } from "../../hooks/useEcosystem"; // This might not be needed if ecosystem is passed as prop
import { useAuth } from "../../context/AuthContext";
import { registry as commandRegistry } from "../../services/commands/registry";
import type { CommandDefinition } from "../../services/commands/types";
import { CommandPrompt } from "../actions/CommandPrompt";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useStudioContext } from "../../context/StudioContext";
import { useEditorContext } from "../../context/EditorContext";
import type { ChatPosition } from "../../context/ThemeContext";
import type { ViewId, JobStep } from "../../types";
import "../../styles/components/chat-panel.css";

interface ChatPanelProps {
    context: WorkspaceContext;
    ecosystem?: any; // Automated ecosystem object
    onClose: () => void;
    addLog?: (msg: string) => void;
    height: number;
    setHeight: (h: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
    position?: ChatPosition;
    view?: ViewId;
}

export function ChatPanel({ context, ecosystem, onClose, addLog, height, setHeight, isExpanded, onToggleExpand, position = "bottom", view }: ChatPanelProps) {
    const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
    const [activeId, setActiveId] = useState<string | null>(loadActiveId);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [streamingText, setStreamingText] = useState<string | null>(null);
    const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallDisplay[]>([]);
    const [showConvos, setShowConvos] = useState(false);
    const [studioMode, setStudioMode] = useState(true);
    const [editorMode, setEditorMode] = useState(true);
    const [pendingCommand, setPendingCommand] = useState<{ command: CommandDefinition; initialArgs: Record<string, any>; convoId: string; msgs: ChatMessage[] } | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const initialScrollDone = useRef(false);

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

    // Instant scroll to bottom on initial mount / conversation switch
    useEffect(() => {
        initialScrollDone.current = false;
    }, [activeId]);

    useEffect(() => {
        if (!initialScrollDone.current && messages.length > 0) {
            // Use requestAnimationFrame to ensure DOM has rendered
            requestAnimationFrame(() => {
                endRef.current?.scrollIntoView({ behavior: "instant" });
            });
            initialScrollDone.current = true;
        }
    }, [messages.length]);

    // Smooth scroll for new messages / streaming updates
    useEffect(() => {
        if (initialScrollDone.current) {
            endRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages.length, loading, streamingText]);

    useEffect(() => {
        // Only focus when the panel is actually visible (not display:none)
        if (!showConvos && inputRef.current?.offsetParent !== null) {
            inputRef.current?.focus();
        }
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
    const architect = useArchitect(addLog || (() => {}), jobs.addJob, jobs.jobs);

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
        addLog: addLog || (() => { }) as (msg: string) => void
    });

    /** Queue a command as a proper job instead of executing directly */
    const queueCommandAsJob = useCallback((
        commandId: string,
        cmdDef: CommandDefinition,
        args: Record<string, any>,
        convoId: string,
        msgs: ChatMessage[],
    ) => {
        const step: JobStep = {
            id: `step-${Date.now()}`,
            commandId,
            args,
            name: cmdDef.description,
            status: "pending",
        };

        jobs.addJob({
            type: commandId,
            request: { description: cmdDef.description },
            steps: [step],
            mode: "serial",
        });

        addLog?.(`CLI: Queued /${commandId} as job`);
        const successMsg = [...msgs, {
            role: "assistant" as const,
            content: `📋 Command \`/${commandId}\` queued as a job.${Object.keys(args).length > 0 ? `\n\nArgs: \`${JSON.stringify(args, null, 2)}\`` : ""}\n\nView progress in the **Jobs** tab.`,
        }];
        updateConversation(convoId, successMsg);
    }, [jobs, addLog, updateConversation]);

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
            // CLI INTERCEPTION — commands go through arg prompt → job queue
            if (text.startsWith("/")) {
                const part1 = text.split(" ")[0];
                const commandId = part1.slice(1);
                const argsString = text.slice(part1.length).trim();

                // Validate command exists
                const cmdDef = commandRegistry.get(commandId);
                if (!cmdDef) {
                    const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `❌ Unknown command \`/${commandId}\`. Type \`/\` to see available commands.` }];
                    updateConversation(currentId, errMsg);
                    setLoading(false);
                    return;
                }

                // Parse any inline args
                let parsedArgs: Record<string, any> = {};
                if (argsString) {
                    if (argsString.startsWith("{")) {
                        try { parsedArgs = JSON.parse(argsString); } catch { /* ignore */ }
                    }
                    if (Object.keys(parsedArgs).length === 0 && argsString.includes("=")) {
                        const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
                        let match;
                        while ((match = regex.exec(argsString)) !== null) {
                            parsedArgs[match[1]] = match[2] || match[3];
                        }
                    }
                }

                // Determine if we need the arg prompt
                const hasArgs = Object.keys(cmdDef.args).length > 0;
                const requiredArgs = Object.entries(cmdDef.args).filter(
                    ([, a]) => a.required !== false && a.defaultValue === undefined
                );
                const missingRequired = requiredArgs.filter(([name]) => !(name in parsedArgs));

                if (hasArgs && missingRequired.length > 0) {
                    // Show the prompt modal for user to fill in args
                    setPendingCommand({
                        command: cmdDef,
                        initialArgs: parsedArgs,
                        convoId: currentId,
                        msgs: updatedMsgs,
                    });
                    setLoading(false);
                    return;
                }

                // No missing required args — queue as job directly
                queueCommandAsJob(commandId, cmdDef, parsedArgs, currentId, updatedMsgs);
                setLoading(false);
                return;
            } else {
                // Streaming chat
                setStreamingText("");
                setStreamingToolCalls([]);

                const streamCallbacks: StreamCallbacks = {
                    onToken: (token) => {
                        setStreamingText(prev => (prev ?? "") + token);
                    },
                    onToolCallStart: (name) => {
                        setStreamingToolCalls(prev => [
                            ...prev,
                            { name, input: {}, result: null, duration_ms: 0 },
                        ]);
                    },
                    onToolCallComplete: (display: ToolCallDisplay) => {
                        setStreamingToolCalls(prev => {
                            const updated = [...prev];
                            // Replace the last pending tool call with the completed one (polyfill for findLastIndex)
                            let idx = -1;
                            for (let i = updated.length - 1; i >= 0; i--) {
                                if (updated[i].name === display.name && updated[i].duration_ms === 0) {
                                    idx = i;
                                    break;
                                }
                            }
                            if (idx >= 0) {
                                updated[idx] = display;
                            } else {
                                updated.push(display);
                            }
                            return updated;
                        });
                    },
                };

                // Build editor context suffix if editor mode is active
                let messageToSend = text;
                if (editorActive && editorApi) {
                    const editorState = editorApi.getState();
                    const editorSuffix = `\n\nEDITOR MODE ACTIVE:\nYou are assisting with a file open in the Editor view. The user wants help editing it.\n\nCurrent file: "${editorState.docName}" (${editorState.fileType})\nFile content (${editorState.stats.lines} lines, ${editorState.stats.words} words):\n\`\`\`${editorState.fileType === "markdown" ? "md" : editorState.fileType}\n${editorState.content.length > 4000 ? editorState.content.substring(0, 4000) + "\n... (truncated)" : editorState.content}\n\`\`\`${!editorState.validation.valid ? `\nValidation Error: ${editorState.validation.error}` : ""}\n\nWhen helping with this file:\n- Provide COMPLETE updated file content in a fenced code block so the user can apply it.\n- Be precise with the format (${editorState.fileType}).\n- For small edits, show context around the change and the complete replacement.\n- Do NOT include explanatory text inside the code block, only the file content.`;
                    messageToSend = text + editorSuffix;
                }

                const { text: response, toolCalls } = await streamChatWithWorkspace(
                    messageToSend, currentMessages, context, streamCallbacks, commandContext,
                );

                setStreamingText(null);
                setStreamingToolCalls([]);

                const finalMsgs = [...updatedMsgs, {
                    role: "assistant" as const,
                    content: response,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                }];
                updateConversation(currentId, finalMsgs);
                addLog?.(`Chat: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`);
            }
        } catch (err) {
            const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `Error: ${err instanceof Error ? err.message : String(err)}` }];
            updateConversation(currentId, errMsg);
        } finally {
            setLoading(false);
        }
    }, [input, loading, activeId, conversations, context, addLog, updateConversation, commandContext, queueCommandAsJob]);

    // Handle prompt modal submission
    const handlePromptSubmit = useCallback((commandId: string, args: Record<string, any>) => {
        if (!pendingCommand) return;
        queueCommandAsJob(commandId, pendingCommand.command, args, pendingCommand.convoId, pendingCommand.msgs);
        setPendingCommand(null);
    }, [pendingCommand, queueCommandAsJob]);

    const handlePromptCancel = useCallback(() => {
        if (pendingCommand) {
            const cancelMsg = [...pendingCommand.msgs, { role: "assistant" as const, content: `Command \`/${pendingCommand.command.id}\` cancelled.` }];
            updateConversation(pendingCommand.convoId, cancelMsg);
        }
        setPendingCommand(null);
    }, [pendingCommand, updateConversation]);

    const [isResizing, setIsResizing] = useState(false);
    const isSide = position === "left" || position === "right";

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            if (isSide) {
                const newWidth = position === "left"
                    ? e.clientX
                    : window.innerWidth - e.clientX;
                if (newWidth > 280 && newWidth < window.innerWidth - 400) {
                    setHeight(newWidth); // height prop is used as generic "size"
                }
            } else {
                const newHeight = window.innerHeight - e.clientY;
                if (newHeight > 200 && newHeight < window.innerHeight - 100) {
                    setHeight(newHeight);
                }
            }
        }
    }, [isResizing, setHeight, isSide, position]);

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
    const llm = useLLM();
    const modelLabel = llm.getModelById(modelId)?.label || modelId;
    const { api: studioApi } = useStudioContext();
    const studioAvailable = !!studioApi && view === "jobs";
    const studioActive = studioAvailable && studioMode;

    const { api: editorApi, proposeEdit } = useEditorContext();
    const editorAvailable = !!editorApi && view === "editor";
    const editorActive = editorAvailable && editorMode;

    // Auto-enable studio mode when studio becomes available
    useEffect(() => {
        if (studioAvailable) setStudioMode(true);
    }, [studioAvailable]);

    // Auto-enable editor mode when editor becomes available
    useEffect(() => {
        if (editorAvailable) setEditorMode(true);
    }, [editorAvailable]);

    // Cmd+J / Ctrl+J to toggle studio mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "j") {
                e.preventDefault();
                if (studioAvailable) setStudioMode(prev => !prev);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [studioAvailable]);

    const isReady = !!input.trim() && !loading;

    return (
        <div
            className={`chat-panel${isResizing ? " chat-panel--resizing" : ""}${isSide ? ` chat-panel--${position}` : ""}`}
            style={isSide ? { width: height, flexShrink: 0 } : { height }}
        >
            {/* Resize Handle */}
            <div onMouseDown={startResizing} className={`chat-panel__resize-handle${isSide ? " chat-panel__resize-handle--side" : ""}`}>
                <div className="chat-panel__resize-indicator" />
            </div>

            {/* Header */}
            <div className="chat-panel__header">
                <div className="chat-panel__header-left">
                    <span className="chat-panel__title">WORKSPACE CHAT</span>
                    <span className="chat-panel__model-badge">{modelLabel}</span>
                    {studioActive && (
                        <span className="chat-panel__studio-badge" title="Studio mode active — AI can build jobs on the canvas (⌘J to toggle)">
                            <Clapperboard size={10} /> <span className="chat-panel__studio-badge-label">Studio</span>
                            <button
                                className="chat-panel__studio-badge-dismiss"
                                onClick={() => setStudioMode(false)}
                                title="Disable Studio mode (⌘J)"
                            ><X size={8} /></button>
                        </span>
                    )}
                    {studioAvailable && !studioMode && (
                        <button
                            className="chat-panel__studio-badge chat-panel__studio-badge--off"
                            onClick={() => setStudioMode(true)}
                            title="Enable Studio mode (⌘J)"
                        >
                            <Clapperboard size={10} /> <span className="chat-panel__studio-badge-label">Studio</span>
                        </button>
                    )}
                    {editorActive && (
                        <span className="chat-panel__editor-badge" title="Editor mode active — AI can read and edit your file">
                            <Edit3 size={10} /> <span className="chat-panel__editor-badge-label">Editor</span>
                            <button
                                className="chat-panel__editor-badge-dismiss"
                                onClick={() => setEditorMode(false)}
                                title="Disable Editor mode"
                            ><X size={8} /></button>
                        </span>
                    )}
                    {editorAvailable && !editorMode && (
                        <button
                            className="chat-panel__editor-badge chat-panel__editor-badge--off"
                            onClick={() => setEditorMode(true)}
                            title="Enable Editor mode"
                        >
                            <Edit3 size={10} /> <span className="chat-panel__editor-badge-label">Editor</span>
                        </button>
                    )}
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
                        onClick={onToggleExpand}
                        className="chat-panel__expand-btn"
                        title={isExpanded ? "Collapse panel" : "Expand panel"}
                    >{isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}</button>
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
                    {messages.map((m, i) => (
                        <div key={i}>
                            <MessageBubble msg={m} context={context} />
                            {editorActive && editorApi && m.role === "assistant" && m.content.includes("```") && (
                                <button
                                    className="chat-panel__apply-editor-btn"
                                    onClick={() => {
                                        const match = m.content.match(/```(?:[\w]*)?\.?\n([\s\S]*?)```/);
                                        if (match?.[1]) proposeEdit(match[1].trim());
                                    }}
                                    title="Preview AI changes as inline diff in the editor"
                                >
                                    <Eye size={11} /> Preview in Editor
                                </button>
                            )}
                        </div>
                    ))}
                    {streamingText !== null && (
                        <MessageBubble
                            msg={{
                                role: "assistant",
                                content: streamingText || "",
                                toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
                            }}
                            context={context}
                            isStreaming
                        />
                    )}
                    {loading && streamingText === null && (
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
                    {studioActive && (
                        <span className="chat-panel__studio-input-badge" title="Studio mode — prompts have canvas context">
                            <Clapperboard size={13} />
                        </span>
                    )}
                    {editorActive && !studioActive && (
                        <span className="chat-panel__editor-input-badge" title="Editor mode — prompts include file context">
                            <Edit3 size={13} />
                        </span>
                    )}
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder={studioActive ? "Ask the AI to build on the Studio canvas..." : editorActive ? "Ask the AI to help edit your file..." : "Ask about your workspace..."}
                        disabled={loading}
                        className={`chat-panel__input${studioActive ? " chat-panel__input--studio" : editorActive ? " chat-panel__input--editor" : ""}`}
                    />
                    <button
                        onClick={send}
                        disabled={loading || !input.trim()}
                        className={`chat-panel__send-btn${isReady ? " chat-panel__send-btn--ready" : ""}`}
                    >Send</button>
                </div>
            )}

            {/* Command Prompt Modal */}
            {pendingCommand && (
                <CommandPrompt
                    command={pendingCommand.command}
                    initialArgs={pendingCommand.initialArgs}
                    entities={{
                        agents: workspaceCtx.agents.map((a: any) => ({ id: a.id, name: a.name })),
                        channels: workspaceCtx.channels.map((c: any) => ({ id: c.id, from: c.from, to: c.to, type: c.type })),
                        groups: workspaceCtx.groups.map((g: any) => ({ id: g.id, name: g.name })),
                        networks: (ecosystem?.ecosystems || []).map((n: any) => ({ id: n.id, name: n.name, color: n.color })),
                    }}
                    currentUser={user}
                    onSubmit={handlePromptSubmit}
                    onCancel={handlePromptCancel}
                />
            )}
        </div>
    );
}

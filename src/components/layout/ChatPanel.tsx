import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, AlignJustify, MessageCircle, ChevronsUp, ChevronsDown, Clapperboard, Edit3, Eye, Send, Square } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { chatWithWorkspace, streamChatWithWorkspace, getChatModel, chatWithAgent } from "@/services/ai";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext, StreamCallbacks } from "@/services/ai";
import { useLLM } from "@/context/LLMContext";
import MessageBubble from "@/components/chat/MessageBubble";
import { makeId } from "@/components/chat/utils";
import type { Conversation } from "@/components/chat/types";
import { useCommandContext } from "@/hooks/useCommandContext";
import { useJobsContext } from "@/context/JobsContext";
import { useArchitect } from "@/toolkits/architect";
import { useEcosystem } from "@/hooks/useEcosystem"; // Bridge UI — needed for command context ecosystem prop
import { useAuth } from "@/context/AuthContext";
import { registry as commandRegistry } from "@/services/commands/registry";
import type { CommandDefinition } from "@/services/commands/types";
import { CommandPrompt } from "@/components/actions/CommandPrompt";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useStudioContext } from "@/toolkits/studio";
import { useEditorContext } from "@/toolkits/editor";
import type { ChatPosition } from "@/context/ThemeContext";
import type { ViewId, JobStep } from "@/types";
import { useConversations } from "@/hooks/useConversations";
import { useChatResize } from "@/hooks/useChatResize";
import { useWorkspaceManager } from "@/hooks/useWorkspaceManager";
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
    const { activeWorkspaceId } = useWorkspaceManager();
    const {
        conversations, setConversations,
        activeId, setActiveId,
        showConvos, setShowConvos,
        active, messages,
        endRef, inputRef, initialScrollDone,
        updateConversation, createNewChat, switchTo, deleteConvo,
    } = useConversations(activeWorkspaceId);

    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [streamingText, setStreamingText] = useState<string | null>(null);
    const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallDisplay[]>([]);
    const [studioMode, setStudioMode] = useState(true);
    const [editorMode, setEditorMode] = useState(true);
    const [pendingCommand, setPendingCommand] = useState<{ command: CommandDefinition; initialArgs: Record<string, any>; convoId: string; msgs: ChatMessage[] } | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const abortRef = useRef<AbortController | null>(null);

    /** Cancel an in-progress streaming chat */
    const stopStreaming = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    // Smooth scroll for new messages / streaming updates
    useEffect(() => {
        if (initialScrollDone.current) {
            endRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages.length, loading, streamingText]);

    useEffect(() => {
        if (!showConvos && inputRef.current?.offsetParent !== null) {
            inputRef.current?.focus();
        }
    }, [showConvos, activeId]);

    // Build Commmand Context for CLI
    const { user } = useAuth();
    const jobs = useJobsContext();
    const architect = useArchitect(addLog || (() => {}), jobs.addJob, jobs.jobs);

    // Toolkit extension APIs — pulled early so useCommandContext can inject them
    const { api: studioApi } = useStudioContext();
    const { api: editorApi, proposeEdit } = useEditorContext();

    // We only have access to React Context "workspace" via imported hook, NOT via prop.
    // The prop `context` is `WorkspaceContext` interface (data only), not the Hook result.
    // BUT `useCommandContext` expects `WorkspaceContextType` which has setters.
    // We need to use the hook `useWorkspaceContext` here to get full context!
    // The prop `context` passed from Footer is just a data snapshot used for AI context.

    // Get workspace entity data + setters via the workspace context (required for useCommandContext)
    const workspaceCtx = useWorkspaceContext();

    // @mention autocomplete candidates
    const mentionCandidates = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        const agents = (workspaceCtx.agents || []).map((a: any) => ({
            type: "agent" as const, id: a.id as string, name: a.name as string,
            detail: (a.title || a.role || "") as string,
        }));
        const groups = (workspaceCtx.groups || []).map((g: any) => ({
            type: "group" as const, id: g.id as string, name: g.name as string,
            detail: `${g.governance} · ${g.members.length} members`,
        }));
        return [...agents, ...groups]
            .filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
            .slice(0, 8);
    }, [mentionQuery, workspaceCtx.agents, workspaceCtx.groups]);

    const insertMention = useCallback((candidate: { name: string }) => {
        const cursorPos = inputRef.current?.selectionStart || input.length;
        const before = input.slice(0, cursorPos);
        const after = input.slice(cursorPos);
        const m = before.match(/(^|.*\s)@(\w*)$/);
        if (m) {
            const prefix = m[1];
            const tag = `@${candidate.name.replace(/\s+/g, "_")}`;
            setInput(prefix + tag + (after.startsWith(" ") ? "" : " ") + after);
        }
        setMentionQuery(null);
        inputRef.current?.focus();
    }, [input]);

    // Determine which ecosystem object to use. 
    // If passed via props, use it. usage of useEcosystem inside ChatPanel would be wrong.
    // If not passed, we can't run ecosystem commands safely.

    const commandContext = useCommandContext({
        workspace: workspaceCtx,
        user,
        jobs,
        ecosystem: ecosystem || { networks: [], bridges: [] }, // Fallback if missing, some cmds might fail
        architect,
        addLog: addLog || (() => { }) as (msg: string) => void,
        extensions: { studio: studioApi ?? undefined, editor: editorApi ?? undefined },
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

        const newJob = jobs.addJob({
            type: commandId,
            request: { description: cmdDef.description },
            steps: [step],
            mode: "serial",
        });

        addLog?.(`CLI: Queued /${commandId} as job`);
        const successMsg = [...msgs, {
            role: "assistant" as const,
            content: `📋 Command \`/${commandId}\` queued as a job.${Object.keys(args).length > 0 ? `\n\nArgs: \`${JSON.stringify(args, null, 2)}\`` : ""}`,
            jobIds: [newJob.id],
        }];
        updateConversation(convoId, successMsg);
    }, [jobs, addLog, updateConversation]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput("");
        setMentionQuery(null);

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
                // @mention routing — direct agent or group chat
                const mentionRe = /@([A-Za-z0-9_]+)/g;
                let mMatch;
                const targetAgents: any[] = [];
                const mentionLabels: string[] = [];
                while ((mMatch = mentionRe.exec(text)) !== null) {
                    const mName = mMatch[1].replace(/_/g, " ");
                    const agent = (workspaceCtx.agents || []).find((a: any) =>
                        a.name.toLowerCase() === mName.toLowerCase() || a.id.toLowerCase() === mName.toLowerCase()
                    );
                    if (agent && !targetAgents.find((a: any) => a.id === agent.id)) {
                        targetAgents.push(agent);
                        mentionLabels.push(agent.name);
                        continue;
                    }
                    const group = (workspaceCtx.groups || []).find((g: any) =>
                        g.name.toLowerCase() === mName.toLowerCase() || g.id.toLowerCase() === mName.toLowerCase()
                    );
                    if (group) {
                        const members = (workspaceCtx.agents || []).filter((a: any) => group.members.includes(a.id));
                        for (const mem of members) {
                            if (!targetAgents.find((a: any) => a.id === mem.id)) targetAgents.push(mem);
                        }
                        mentionLabels.push(`${group.name} (group)`);
                    }
                }
                if (targetAgents.length > 0) {
                    const cleanText = text.replace(/@[A-Za-z0-9_]+/g, "").trim();
                    const replies = await Promise.all(
                        targetAgents.map((a: any) => chatWithAgent(a, cleanText, currentMessages.slice(-10)))
                    );
                    const combined = targetAgents.length === 1
                        ? `**${targetAgents[0].name}** says:\n\n${replies[0].text}`
                        : targetAgents.map((a: any, i: number) =>
                            `**${a.name}** (${a.title || a.role}):\n${replies[i].text}`
                        ).join("\n\n---\n\n");
                    const finalMsgs = [...updatedMsgs, { role: "assistant" as const, content: combined }];
                    updateConversation(currentId!, finalMsgs);
                    addLog?.(`Chat: @${mentionLabels.join(", @")} — "${cleanText.slice(0, 30)}…"`);
                    return;
                }

                // Streaming chat
                setStreamingText("");
                setStreamingToolCalls([]);

                const controller = new AbortController();
                abortRef.current = controller;

                const streamCallbacks: StreamCallbacks = {
                    onToken: (token) => {
                        setStreamingText(prev => (prev ?? "") + token);
                    },
                    signal: controller.signal,
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

                abortRef.current = null;
                setStreamingText(null);
                setStreamingToolCalls([]);

                // Collect jobIds from tool calls for inline progress tracking
                const collectedJobIds = toolCalls
                    .filter(tc => tc.jobId)
                    .map(tc => tc.jobId!);

                const finalMsgs = [...updatedMsgs, {
                    role: "assistant" as const,
                    content: response,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    jobIds: collectedJobIds.length > 0 ? collectedJobIds : undefined,
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
    }, [input, loading, activeId, conversations, context, addLog, updateConversation, commandContext, queueCommandAsJob, workspaceCtx]);

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

    const { isResizing, isSide, startResizing } = useChatResize(position, height, setHeight);

    const modelId = getChatModel();
    const llm = useLLM();

    const studioAvailable = !!studioApi && view === "jobs";
    const studioActive = studioAvailable && studioMode;

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
                    {!isSide && (
                        <button
                            onClick={onToggleExpand}
                            className="chat-panel__expand-btn"
                            title={isExpanded ? "Collapse panel" : "Expand panel"}
                        >{isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}</button>
                    )}
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
                                jobIds: streamingToolCalls.filter(tc => tc.jobId).map(tc => tc.jobId!),
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
                    {/* @mention autocomplete picker */}
                    {mentionQuery !== null && mentionCandidates.length > 0 && (
                        <div className="chat-panel__mention-picker">
                            {mentionCandidates.map((c, i) => (
                                <div
                                    key={`${c.type}-${c.id}`}
                                    className={`chat-panel__mention-item${i === mentionIndex ? " chat-panel__mention-item--active" : ""}`}
                                    onMouseDown={e => { e.preventDefault(); insertMention(c); }}
                                    onMouseEnter={() => setMentionIndex(i)}
                                >
                                    <span className={`chat-panel__mention-badge chat-panel__mention-badge--${c.type}`}>
                                        {c.type === "agent" ? "A" : "G"}
                                    </span>
                                    <span className="chat-panel__mention-name">{c.name}</span>
                                    <span className="chat-panel__mention-detail">{c.detail}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {studioAvailable && (
                        <button
                            className={`chat-panel__studio-input-badge${!studioMode ? " chat-panel__studio-input-badge--off" : ""}`}
                            onClick={() => setStudioMode(prev => !prev)}
                            title={studioMode ? "Studio mode active — click to disable (⌘J)" : "Studio mode disabled — click to enable (⌘J)"}
                        >
                            <Clapperboard size={13} />
                        </button>
                    )}
                    {editorAvailable && !studioAvailable && (
                        <button
                            className={`chat-panel__editor-input-badge${!editorMode ? " chat-panel__editor-input-badge--off" : ""}`}
                            onClick={() => setEditorMode(prev => !prev)}
                            title={editorMode ? "Editor mode active — click to disable" : "Editor mode disabled — click to enable"}
                        >
                            <Edit3 size={13} />
                        </button>
                    )}
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => {
                            const val = e.target.value;
                            setInput(val);
                            const cur = e.target.selectionStart ?? val.length;
                            const before = val.slice(0, cur);
                            const mt = before.match(/(^|\s)@(\w*)$/);
                            if (mt) { setMentionQuery(mt[2]); setMentionIndex(0); }
                            else { setMentionQuery(null); }
                        }}
                        onKeyDown={e => {
                            if (mentionQuery !== null && mentionCandidates.length > 0) {
                                if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(j => (j + 1) % mentionCandidates.length); return; }
                                if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(j => (j - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
                                if (e.key === "Enter" || e.key === "Tab" || e.key === " ") { e.preventDefault(); insertMention(mentionCandidates[mentionIndex]); return; }
                                if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
                            }
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                        }}
                        placeholder={studioActive ? "Ask the AI to build on the Studio canvas..." : editorActive ? "Ask the AI to help edit your file..." : "Ask about your workspace — type @ to mention agents..."}
                        disabled={loading && !streamingText}
                        className={`chat-panel__input${studioActive ? " chat-panel__input--studio" : editorActive ? " chat-panel__input--editor" : ""}`}
                    />
                    {loading ? (
                        <button
                            onClick={stopStreaming}
                            className="chat-panel__send-btn chat-panel__send-btn--stop"
                            title="Stop generating"
                        ><Square size={14} /></button>
                    ) : (
                        <button
                            onClick={send}
                            disabled={!input.trim()}
                            className={`chat-panel__send-btn${isReady ? " chat-panel__send-btn--ready" : ""}`}
                        ><Send size={14} /></button>
                    )}
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
                        networks: (ecosystem?.networks || []).map((n: any) => ({ id: n.id, name: n.name, color: n.color })),
                    }}
                    currentUser={user}
                    onSubmit={handlePromptSubmit}
                    dryRunContext={commandContext}
                    onCancel={handlePromptCancel}
                />
            )}
        </div>
    );
}

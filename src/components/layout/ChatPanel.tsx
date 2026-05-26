import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, LayoutTemplate, MessageCircle, ChevronDown, ChevronRight, Clapperboard, Edit3, Eye, Send, Square, Check, Bot } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { chatWithWorkspace, streamChatWithWorkspace, getChatModel, chatWithAgent } from "@/services/ai";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext, StreamCallbacks } from "@/services/ai";
import { useLLM } from "@/context/LLMContext";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { useStreamingChatState } from "@/components/chat/useStreamingChatState";
import { makeId } from "@/components/chat/utils";
import { extractEditorPreviewContent, EDITOR_DOC_BEGIN, EDITOR_DOC_END } from "@/components/chat/editorPreview";
import { MemoriesPanel } from "@/components/chat/MemoriesPanel";
import { ChatMentionPicker } from "@/components/chat/ChatMentionPicker";
import { ChatPanelHeader } from "@/components/chat/ChatPanelHeader";
import { ConversationsList } from "@/components/chat/ConversationsList";
import { useChatMentions } from "@/hooks/chat/useChatMentions";
import { useChatScroll } from "@/hooks/chat/useChatScroll";
import type { Conversation } from "@/components/chat/types";
import { useCommandContext } from "@/hooks/useCommandContext";
import type { EcosystemInput } from "@/hooks/useCommandContext";
import { useJobsContext } from "@/context/JobsContext";
import { useArchitectContext } from "@/toolkits/architect";
import { useEcosystem } from "@/hooks/useEcosystem"; // Bridge UI — needed for command context ecosystem prop
import { useAuth } from "@/context/AuthContext";
import { registry as commandRegistry } from "@/services/commands/registry";
import type { CommandDefinition } from "@/services/commands/types";
import { CommandPrompt } from "@/components/actions/CommandPrompt";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useStudioContext } from "@/toolkits/studio";
import { useEditorContext } from "@/toolkits/editor";
import { useP2PChatNotifications } from "@/hooks/chat/useP2PChatNotifications";
import type { ChatPosition } from "@/context/ThemeContext";
import type { ViewId, JobStep, Agent, Channel, Group } from "@/types";
import { useConversations } from "@/hooks/useConversations";
import { useChatResize } from "@/hooks/useChatResize";
import { useWorkspaceManager } from "@/hooks/useWorkspaceManager";
import { useActiveChatAgent, useChatAgentsStore } from "@/services/chat/agents";
import { ChatAgentBanner } from "@/components/chat/ChatAgentBanner";
import "../../styles/components/chat-panel.css";

interface ChatPanelProps {
    context: WorkspaceContext;
    /** Refresh and return a fresh workspace snapshot. Called at user-
     *  message-send time so the LLM receives the latest agents/channels/
     *  messages/jobs without forcing ChatPanel to re-render whenever
     *  workspace state changes between sends. Optional for backwards
     *  compatibility with tests / callers that pass a static context. */
    refreshContext?: () => WorkspaceContext;
    /** Live ecosystem snapshot. Accepts the full `useEcosystem()` return
     * (UseEcosystemReturn) or a partial fallback. Typed as the same narrow
     * input shape that `useCommandContext` consumes so callers don't have
     * to widen `as any` to pass either form. */
    ecosystem?: EcosystemInput;
    onClose: () => void;
    addLog?: (msg: string) => void;
    height: number;
    setHeight: (h: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
    position?: ChatPosition;
    view?: ViewId;
    setView?: (v: ViewId) => void;
}

// Editor "Preview in Editor" extraction helpers live in chat/editorPreview.ts
// so they can be unit-tested in isolation.

export function ChatPanel({ context, refreshContext, ecosystem, onClose, addLog, height, setHeight, isExpanded, onToggleExpand, position = "bottom", view, setView }: ChatPanelProps) {
    const { activeWorkspaceId } = useWorkspaceManager();
    const {
        conversations, setConversations,
        activeId, setActiveId,
        showConvos, setShowConvos,
        active, messages,
        endRef, inputRef, initialScrollDone,
        updateConversation, createNewChat, switchTo, deleteConvo,
    } = useConversations(activeWorkspaceId);

    const [showMemories, setShowMemories] = useState(false);

    const activeAgent = useActiveChatAgent();
    const availableAgents = useChatAgentsStore(s => s.agents);
    const focusTick = useChatAgentsStore((s) => s.focusTick);

    const [layoutOverrides, setLayoutOverrides] = useState<Record<string, number>>(() => {
        try {
            return JSON.parse(localStorage.getItem("chat-agent-layouts") || "{}");
        } catch {
            return {};
        }
    });

    const saveLayoutOverride = useCallback((agentId: string, size: number) => {
        setLayoutOverrides(prev => {
            const next = { ...prev, [agentId]: size };
            localStorage.setItem("chat-agent-layouts", JSON.stringify(next));
            return next;
        });
    }, []);

    const resetLayoutOverride = useCallback((agentId: string) => {
        setLayoutOverrides(prev => {
            const next = { ...prev };
            delete next[agentId];
            localStorage.setItem("chat-agent-layouts", JSON.stringify(next));
            return next;
        });
    }, []);

    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const streamState = useStreamingChatState();
    const [botMenuOpen, setBotMenuOpen] = useState(false);
    const [lohkExpanded, setLohkExpanded] = useState<boolean>(() => {
        try { return localStorage.getItem("decops:bot-menu-lohk-collapsed") !== "1"; }
        catch { return true; }
    });
    useEffect(() => {
        try { localStorage.setItem("decops:bot-menu-lohk-collapsed", lohkExpanded ? "0" : "1"); }
        catch { /* ignore */ }
    }, [lohkExpanded]);
    const [pendingCommand, setPendingCommand] = useState<{ command: CommandDefinition; initialArgs: Record<string, any>; convoId: string; msgs: ChatMessage[] } | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const runCounterRef = useRef(0);
    const activeRunIdRef = useRef<number | null>(null);
    const cancelledRunIdRef = useRef<number | null>(null);
    const { user } = useAuth();
    const jobs = useJobsContext();
    const architectMessageRef = useRef<{ conversationId: string | null; messageId: string | null }>({
        conversationId: null,
        messageId: null,
    });

    /** Cancel an in-progress streaming chat */
    const stopStreaming = useCallback(() => {
        const activeRunId = activeRunIdRef.current;
        if (activeRunId != null) cancelledRunIdRef.current = activeRunId;
        const partialResponse = (streamState.streamingText || "").trim();
        const partialToolCalls = streamState.streamingToolCalls;

        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
        streamState.clearStreaming();

        activeAgent?.onStop?.({ conversationId: activeId ?? undefined });

        if (!activeId) return;

        const activeJobs = jobs.jobs.filter(
            j => j.status === "running" || j.status === "queued" || j.status === "awaiting-input",
        );
        const convoMessages = conversations.find(c => c.id === activeId)?.messages || [];
        const latestMessage = convoMessages[convoMessages.length - 1];
        const preferredJobId = latestMessage?.jobIds?.find((jid: string) => activeJobs.some(j => j.id === jid));
        const selectedJob = activeJobs.find(j => j.id === preferredJobId) ?? activeJobs[0];
        const cancelledContent = partialResponse
            ? `${partialResponse}\n\n_Query cancelled by user._`
            : "Query cancelled by user.";

        updateConversation(activeId, [
            ...convoMessages,
            {
                id: `stop-prompt-${makeId()}`,
                role: "assistant",
                content: cancelledContent,
                toolCalls: partialToolCalls.length > 0 ? partialToolCalls : undefined,
                jobIds: partialToolCalls.filter(tc => tc.jobId).map(tc => tc.jobId!),
                stopPrompt: selectedJob ? {
                    jobId: selectedJob.id,
                    jobName: selectedJob.type,
                    jobDescription: selectedJob.request?.description,
                } : undefined,
            },
        ]);
    }, [activeAgent, activeId, conversations, jobs.jobs, streamState, updateConversation]);

    const handleStopPromptAction = useCallback((choice: "finish" | "stop" | "stop-and-job", prompt: NonNullable<ChatMessage["stopPrompt"]>) => {
        if (!activeId) return;
        const convoMessages = conversations.find(c => c.id === activeId)?.messages || [];

        if (choice === "finish") {
            updateConversation(activeId, [
                ...convoMessages,
                {
                    id: `stop-choice-${makeId()}`,
                    role: "assistant",
                    content: `Okay, I will let \`${prompt.jobName || prompt.jobId || "this job"}\` finish and you can continue with another request now.`,
                    jobIds: prompt.jobId ? [prompt.jobId] : undefined,
                },
            ]);
            return;
        }

        if (choice === "stop-and-job") {
            if (prompt.jobId) jobs.stopJob(prompt.jobId);
            updateConversation(activeId, [
                ...convoMessages,
                {
                    id: `stop-choice-${makeId()}`,
                    role: "assistant",
                    content: `Stopped this query${prompt.jobName ? ` and requested stop for \`${prompt.jobName}\`` : ""}. You can send another message now.`,
                },
            ]);
            return;
        }

        updateConversation(activeId, [
            ...convoMessages,
            {
                id: `stop-choice-${makeId()}`,
                role: "assistant",
                content: `Stopped this query. You can send another message now.`,
            },
        ]);
    }, [activeId, conversations, updateConversation]);

    // Smooth scroll + input focus side effects (§2.2 extraction)
    useChatScroll({
        endRef,
        inputRef,
        initialScrollDone,
        messagesLength: messages.length,
        loading,
        streamingText: streamState.streamingText,
        showConvos,
        activeId,
        focusTick,
    });

    // Fresh-conversation agents (Architect, …) start a brand-new conversation
    // on activation so their welcome panel speaks first on an empty stage.
    // Inline agents (Editor, Studio, libp2p) leave the active conversation
    // alone. Tracked via a ref so we only react on the activeAgent transition
    // and only when the current convo has visible history.
    const prevAgentIdRef = useRef<string | null>(null);
    useEffect(() => {
        const prev = prevAgentIdRef.current;
        const curr = activeAgent?.id ?? null;
        prevAgentIdRef.current = curr;
        if (curr && curr !== prev && activeAgent?.freshConversation) {
            // Only spin up a new conversation if the active one has content
            // (avoid stacking empty placeholders if the user toggles agents).
            if (!active || (active.messages?.length ?? 0) > 0) {
                createNewChat();
            }
        }
    }, [activeAgent?.id, activeAgent?.freshConversation, active, createNewChat]);

    // Build Commmand Context for CLI
    const sharedArchitect = useArchitectContext();
    const architect = sharedArchitect ?? {
        archPrompt: "",
        setArchPrompt: () => { },
        archGenerating: false,
        archPreview: null,
        archError: null,
        archPhase: "input" as const,
        deployProgress: { step: "", count: 0, total: 0 },
        generateNetwork: () => { },
        deployNetwork: () => { },
        resetArchitect: () => { },
    };

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

    // @mention autocomplete + pinned-chip state (§2.2 extraction)
    const {
        mentionQuery, setMentionQuery,
        mentionIndex, setMentionIndex,
        mentionCandidates,
        pinnedMentions, setPinnedMentions,
        insertMention, removePinnedMention,
    } = useChatMentions({
        input,
        setInput,
        inputRef,
        agents: workspaceCtx.agents as Agent[],
        groups: workspaceCtx.groups as Group[],
    });

    // Determine which ecosystem object to use. 
    // If passed via props, use it. usage of useEcosystem inside ChatPanel would be wrong.
    // If not passed, we can't run ecosystem commands safely.

    const commandContext = useCommandContext({
        workspace: workspaceCtx,
        user,
        jobs,
        ecosystem: ecosystem ?? { networks: [], bridges: [] }, // Fallback if missing, some cmds might fail
        architect,
        addLog: addLog || (() => { }) as (msg: string) => void,
        extensions: { studio: studioApi ?? undefined, editor: editorApi ?? undefined },
    });

    // ── P2P runtime: live refs + change notifications ───────────────────
    // Extracted into useP2PChatNotifications so ChatPanel doesn't carry
    // the pubsub/debounce machinery inline. See §2.2 of the MVP audit.
    const { readP2PContext } = useP2PChatNotifications({
        activeId,
        loading,
        setConversations,
    });

    useEffect(() => {
        const trackedConversationId = architectMessageRef.current.conversationId;
        const trackedMessageId = architectMessageRef.current.messageId;
        const phase = sharedArchitect?.archPhase ?? "input";
        const architectActive = activeAgent?.id === "architect";

        // Finalize the tracked live card whenever Architect goes idle OR the
        // user has switched to another agent. In both cases we leave any
        // existing card in place as static history but stop mutating it,
        // and stop inserting new cards into whatever conversation is now
        // active. This keeps Architect's behavior fully scoped to its own
        // mode rather than leaking into libp2p / Studio / Editor chats.
        if (phase === "input" || !architectActive) {
            if (trackedConversationId && trackedMessageId) {
                setConversations(prev => prev.map(c => {
                    if (c.id !== trackedConversationId) return c;
                    return {
                        ...c,
                        messages: c.messages.map(m =>
                            m.id === trackedMessageId && m.architectCard
                                ? { ...m, architectCard: { ...m.architectCard, live: false } }
                                : m,
                        ),
                        updatedAt: Date.now(),
                    };
                }));
                architectMessageRef.current = { conversationId: null, messageId: null };
            }
            return;
        }

        if (!sharedArchitect) return;

        const conversationId = trackedConversationId ?? activeId;
        if (!conversationId) return;

        const messageId = trackedMessageId ?? `architect-${makeId()}`;
        const architectCard = {
            prompt: sharedArchitect.archPrompt,
            phase: sharedArchitect.archPhase,
            preview: sharedArchitect.archPreview,
            deployProgress: sharedArchitect.deployProgress,
            live: true,
        };

        setConversations(prev => prev.map(c => {
            if (c.id !== conversationId) return c;

            const existingIndex = c.messages.findIndex(m => m.id === messageId);
            const nextMessages = existingIndex >= 0
                ? c.messages.map(m =>
                    m.id === messageId
                        ? { ...m, role: "assistant" as const, content: "", architectCard }
                        : m,
                )
                : [
                    ...c.messages.map(m =>
                        m.architectCard?.live
                            ? { ...m, architectCard: { ...m.architectCard, live: false } }
                            : m,
                    ),
                    { id: messageId, role: "assistant" as const, content: "", architectCard },
                ];

            return {
                ...c,
                messages: nextMessages,
                updatedAt: Date.now(),
            };
        }));

        architectMessageRef.current = { conversationId, messageId };
    }, [
        activeId,
        activeAgent?.id,
        sharedArchitect?.archPhase,
        sharedArchitect?.archPrompt,
        sharedArchitect?.archPreview,
        sharedArchitect?.deployProgress,
        setConversations,
    ]);

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
        const argKeys = Object.keys(args);
        const argsSummary = argKeys.length > 0
            ? `\n\nArgs provided: ${argKeys.join(", ")}`
            : "";
        const successMsg = [...msgs, {
            role: "assistant" as const,
            content: `📋 Command \`/${commandId}\` queued as a job.${argsSummary}`,
            jobIds: [newJob.id],
        }];
        updateConversation(convoId, successMsg);
    }, [jobs, addLog, updateConversation]);

    const send = useCallback(async () => {
        const rawText = input.trim();
        if (!rawText && pinnedMentions.length === 0) return;
        if (loading) return;
        // Combine pinned-mention chips with the typed text so the existing
        // `@name` resolution logic downstream picks them up. Chips are NOT
        // cleared on send — they persist into the next prompt unless the
        // user removes them via the chip's `×` button.
        const mentionPrefix = pinnedMentions
            .map(m => `@${m.name.replace(/\s+/g, "_")}`)
            .join(" ");
        const startsWithSlash = rawText.startsWith("/");
        const text = startsWithSlash || !mentionPrefix
            ? rawText
            : mentionPrefix + (rawText ? ` ${rawText}` : "");
        if (!text.trim()) return;
        const runId = ++runCounterRef.current;
        activeRunIdRef.current = runId;
        cancelledRunIdRef.current = null;
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

        // Active chat agent routing (Architect, libp2p, …) — first chance to handle the input.
        // Non-slash, non-@mention messages are offered to the active agent's onSubmit.
        if (activeAgent?.onSubmit && !text.startsWith("/") && !/^@\w/.test(text)) {
            try {
                const controller = new AbortController();
                abortRef.current = controller;
                const handled = await activeAgent.onSubmit(text, {
                    conversationId: currentId,
                    stopSignal: controller.signal,
                    appendAssistantMessage: (content: string) => {
                        // Use the functional setter so we always read the latest
                        // conversation messages (including the user message we
                        // just inserted) — the captured `conversations` closure
                        // is stale and would otherwise overwrite & drop messages.
                        setConversations(prev => prev.map(c =>
                            c.id === currentId
                                ? { ...c, messages: [...c.messages, { role: "assistant" as const, content }], updatedAt: Date.now() }
                                : c
                        ));
                    },
                    streamAssistantMessage: () => {
                        // Bridge an agent's incremental output into the same
                        // streaming UI the workspace chat uses (live tokens
                        // render via `streamingText` / `streamingToolCalls`).
                        let buffer = "";
                        let closed = false;
                        streamState.startStreaming();
                        const commit = (final: string) => {
                            if (closed) return;
                            closed = true;
                            streamState.clearStreaming();
                            setConversations(prev => prev.map(c =>
                                c.id === currentId
                                    ? { ...c, messages: [...c.messages, { role: "assistant" as const, content: final }], updatedAt: Date.now() }
                                    : c
                            ));
                        };
                        return {
                            append: (token: string) => {
                                if (closed) return;
                                buffer += token;
                                streamState.setStreamingText(prev => (prev ?? "") + token);
                            },
                            set: (next: string) => {
                                if (closed) return;
                                buffer = next;
                                streamState.setStreamingText(next);
                            },
                            done: (final?: string) => commit(final ?? buffer),
                            error: (msg: string) => commit(`${activeAgent.name} error: ${msg}`),
                        };
                    },
                });
                if (cancelledRunIdRef.current === runId) return;
                if (handled) {
                    addLog?.(`Chat[${activeAgent.id}]: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`);
                    setLoading(false);
                    abortRef.current = null;
                    return;
                }
            } catch (err) {
                if (cancelledRunIdRef.current === runId) return;
                const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `${activeAgent.name} error: ${err instanceof Error ? err.message : String(err)}` }];
                updateConversation(currentId, errMsg);
                setLoading(false);
                abortRef.current = null;
                return;
            }
        }

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
                const targetAgents: Agent[] = [];
                const mentionLabels: string[] = [];
                while ((mMatch = mentionRe.exec(text)) !== null) {
                    const mName = mMatch[1].replace(/_/g, " ");
                    const agent = (workspaceCtx.agents || []).find((a: Agent) =>
                        a.name.toLowerCase() === mName.toLowerCase() || a.id.toLowerCase() === mName.toLowerCase()
                    );
                    if (agent && !targetAgents.find((a: Agent) => a.id === agent.id)) {
                        targetAgents.push(agent);
                        mentionLabels.push(agent.name);
                        continue;
                    }
                    const group = (workspaceCtx.groups || []).find((g: Group) =>
                        g.name.toLowerCase() === mName.toLowerCase() || g.id.toLowerCase() === mName.toLowerCase()
                    );
                    if (group) {
                        const members = (workspaceCtx.agents || []).filter((a: Agent) => group.members.includes(a.id));
                        for (const mem of members) {
                            if (!targetAgents.find((a: Agent) => a.id === mem.id)) targetAgents.push(mem);
                        }
                        mentionLabels.push(`${group.name} (group)`);
                    }
                }
                if (targetAgents.length > 0) {
                    const cleanText = text.replace(/@[A-Za-z0-9_]+/g, "").trim();
                    const replies = await Promise.all(
                        targetAgents.map((a: Agent) => chatWithAgent(a, cleanText, currentMessages.slice(-10)))
                    );
                    const combined = targetAgents.length === 1
                        ? `**${targetAgents[0].name}** says:\n\n${replies[0].text}`
                        : targetAgents.map((a: Agent, i: number) =>
                            `**${a.name}** (${a.title || a.role}):\n${replies[i].text}`
                        ).join("\n\n---\n\n");
                    const finalMsgs = [...updatedMsgs, { role: "assistant" as const, content: combined }];
                    updateConversation(currentId!, finalMsgs);
                    addLog?.(`Chat: @${mentionLabels.join(", @")} — "${cleanText.slice(0, 30)}…"`);
                    return;
                }

                // Streaming chat
                streamState.startStreaming();

                const controller = new AbortController();
                abortRef.current = controller;
                const streamCallbacks: StreamCallbacks = streamState.buildCallbacks(controller.signal);

                // Build editor context suffix if editor mode is active
                let messageToSend = text;
                if (editorActive && editorApi) {
                    const editorState = editorApi.getState();
                    const editorSuffix = `\n\nEDITOR MODE ACTIVE:\nYou are assisting with a file open in the Editor view. The user wants help editing it.\n\nCurrent file: "${editorState.docName}" (${editorState.fileType})\nFile content (${editorState.stats.lines} lines, ${editorState.stats.words} words):\n\`\`\`${editorState.fileType === "markdown" ? "md" : editorState.fileType}\n${editorState.content.length > 4000 ? editorState.content.substring(0, 4000) + "\n... (truncated)" : editorState.content}\n\`\`\`${!editorState.validation.valid ? `\nValidation Error: ${editorState.validation.error}` : ""}\n\nWhen helping with this file:\n- Provide the COMPLETE updated file content — never a partial diff or snippet.\n- Wrap the full intended document between these invisible markers on their own lines so the editor can apply it as one unit:\n  ${EDITOR_DOC_BEGIN}\n  \`\`\`${editorState.fileType === "markdown" ? "md" : editorState.fileType}\n  ...entire updated file content here...\n  \`\`\`\n  ${EDITOR_DOC_END}\n- The markers MUST appear exactly once each, on their own lines, with nothing else on those lines.\n- Put ONLY the file content inside the fenced code block (no explanatory prose, no diff hunks, no ellipses).\n- Be precise with the format (${editorState.fileType}).\n- You may include short prose before the begin marker or after the end marker for the user, but never between them.`;
                    messageToSend = text + editorSuffix;
                }

                // Refresh the workspace snapshot ONCE per user-send so the
                // LLM sees the latest agents/channels/messages/jobs. Between
                // sends the context prop is stable, which prevents React
                // re-render cascades during long-running commands. Falls
                // back to the static `context` prop when no refresh
                // callback was supplied (tests, legacy callers).
                const freshContext = refreshContext ? refreshContext() : context;
                const { text: response, toolCalls } = await streamChatWithWorkspace(
                    messageToSend, currentMessages, { ...freshContext, p2p: readP2PContext() }, streamCallbacks, commandContext,
                    activeAgent?.toolkitIds,
                );

                if (cancelledRunIdRef.current === runId) return;

                abortRef.current = null;
                streamState.clearStreaming();

                // Collect jobIds from tool calls for inline progress tracking
                const collectedJobIds = toolCalls
                    .filter(tc => tc.jobId)
                    .map(tc => tc.jobId!);

                // Build the final conversation. If the model returned no
                // visible text, skip the assistant bubble but still persist
                // the conversation so prior context is not lost.
                const trimmed = response.trim();
                // Persist the assistant turn if there's text OR tool calls
                const hasToolCalls = toolCalls.length > 0;
                const finalMsgs = trimmed || hasToolCalls
                    ? [...updatedMsgs, {
                        role: "assistant" as const,
                        content: trimmed,
                        toolCalls: hasToolCalls ? toolCalls : undefined,
                        jobIds: collectedJobIds.length > 0 ? collectedJobIds : undefined,
                    }]
                    : updatedMsgs;
                updateConversation(currentId, finalMsgs);
                addLog?.(`Chat: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`);
            }
        } catch (err) {
            if (cancelledRunIdRef.current === runId) return;
            const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `Error: ${err instanceof Error ? err.message : String(err)}` }];
            updateConversation(currentId, errMsg);
        } finally {
            streamState.flushPending();
            if (activeRunIdRef.current === runId) activeRunIdRef.current = null;
            setLoading(false);
        }
    }, [input, pinnedMentions, loading, activeId, conversations, context, refreshContext, addLog, updateConversation, commandContext, queueCommandAsJob, workspaceCtx, activeAgent, readP2PContext, streamState]);

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

    const isSidePanel = position === "left" || position === "right";
    const applyHeight = useCallback((h: number) => { if (activeAgent?.id && isSidePanel) { saveLayoutOverride(activeAgent.id, h); } setHeight(h); }, [activeAgent?.id, isSidePanel, saveLayoutOverride, setHeight]);

    const { isResizing, isSide, startResizing } = useChatResize(position, height, applyHeight);

    // When the active agent prefers a wider side panel (Architect blueprint
    // cards, etc.) we override the user's saved size while it's active.
    // Clamped to 50vw min, agent.preferredSideWidth max, viewport ceiling.
    const effectivePanelSize = useMemo(() => {
        if (isSide && activeAgent?.preferredSideWidth) {
            if (layoutOverrides[activeAgent.id]) {
                return layoutOverrides[activeAgent.id];
            }
            return window.innerWidth / 3;
        }
        return height;
    }, [isSide, activeAgent?.preferredSideWidth, activeAgent?.id, height, layoutOverrides]);

    const modelId = getChatModel();
    const llm = useLLM();

    const studioAvailable = !!studioApi && view === "jobs";
    const studioActive = activeAgent?.id === "studio";

    const editorAvailable = !!editorApi && view === "editor";
    const editorActive = activeAgent?.id === "editor";

    
    
    // Cmd+J / Ctrl+J to toggle studio mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "j") {
                e.preventDefault();
                if (studioAvailable) {
                    if (useChatAgentsStore.getState().activeAgentId === "studio") useChatAgentsStore.getState().setActive(null);
                    else useChatAgentsStore.getState().setActive("studio");
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [studioAvailable]);

    const isReady = !!input.trim() && !loading;

    return (
        <div
            className={`chat-panel${isResizing ? " chat-panel--resizing" : ""}${isSide ? ` chat-panel--${position}` : ""}${activeAgent ? ` chat-panel--agent chat-panel--agent-${activeAgent.id}` : ""}`}
            style={isSide ? { width: effectivePanelSize, flexShrink: 0 } : { height: effectivePanelSize }}
        >
            {/* Resize Handle */}
            <div onMouseDown={startResizing} className={`chat-panel__resize-handle${isSide ? " chat-panel__resize-handle--side" : ""}`}>
                <div className="chat-panel__resize-indicator" />
            </div>

            {/* Header */}
            <ChatPanelHeader
                conversationsCount={conversations.length}
                showConvos={showConvos}
                showMemories={showMemories}
                isSide={isSide}
                isExpanded={isExpanded}
                onToggleConvos={() => { setShowConvos(!showConvos); if (!showConvos) setShowMemories(false); }}
                onToggleMemories={() => { setShowMemories(!showMemories); if (!showMemories) setShowConvos(false); }}
                onNew={createNewChat}
                onToggleExpand={onToggleExpand}
                onClose={onClose}
            />

            {/* Body: conversations list, memories panel, or chat */}
            {showConvos ? (
                <ConversationsList
                    conversations={conversations}
                    activeId={activeId}
                    onSwitch={switchTo}
                    onDelete={deleteConvo}
                    onNew={createNewChat}
                />
            ) : showMemories ? (
                /* Memories panel */
                <MemoriesPanel workspaceId={activeWorkspaceId} />
            ) : (
                /* Chat messages */
                <div className="chat-panel__messages" data-testid="chat-panel-messages">
                    <ChatAgentBanner />
                    {activeAgent?.welcome && !loading && (
                        (() => {
                            const Welcome = activeAgent.welcome!;
                            return (
                                <div className="chat-panel__agent-welcome chat-panel__agent-welcome--inline">
                                    <Welcome
                                        onPrompt={(t: string) => {
                                            setInput(t);
                                            setTimeout(() => inputRef.current?.focus(), 0);
                                        }}
                                    />
                                </div>
                            );
                        })()
                    )}
                    {messages.length === 0 && !loading && !activeAgent?.welcome && (
                        <div className="chat-panel__chat-empty">
                            <GradientIcon icon={MessageCircle} size={24} gradient={["#00e5a0", "#38bdf8"]} />
                            <div className="chat-panel__chat-empty-title">
                                {activeAgent ? activeAgent.name : "Workspace AI Assistant"}
                            </div>
                            <div className="chat-panel__chat-empty-desc">
                                {activeAgent?.description ?? "Ask about your agents, channels, groups, topology — or request workspace actions."}
                            </div>
                            {activeAgent?.quickActions && activeAgent.quickActions.length > 0 && (
                                <div className="chat-agent-quickactions">
                                    {activeAgent.quickActions.map((qa, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            className="chat-agent-quickactions__chip"
                                            onClick={() => {
                                                if (qa.run) qa.run();
                                                else if (qa.prompt) {
                                                    setInput(qa.prompt);
                                                    setTimeout(() => inputRef.current?.focus(), 0);
                                                }
                                            }}
                                        >
                                            {qa.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i}>
                            {m.systemNotice ? (
                                <div className="chat-panel__system-notice" role="status" aria-live="polite">
                                    <span className="chat-panel__system-notice-dot" aria-hidden />
                                    <span className="chat-panel__system-notice-text">{m.content.replace(/^\[workspace update\]\s*/, "")}</span>
                                </div>
                            ) : (
                                <MessageBubble msg={m} context={context} setView={setView} onStopPromptAction={handleStopPromptAction} />
                            )}
                            {editorActive && editorApi && m.role === "assistant" && !!extractEditorPreviewContent(m.content) && (
                                <button
                                    className="chat-panel__apply-editor-btn"
                                    onClick={() => {
                                        const previewContent = extractEditorPreviewContent(m.content);
                                        if (previewContent) proposeEdit(previewContent);
                                    }}
                                    title="Preview AI changes as inline diff in the editor"
                                >
                                    <Eye size={11} /> Preview in Editor
                                </button>
                            )}
                        </div>
                    ))}
                    {streamState.streamingText !== null && (
                        <MessageBubble
                            msg={{
                                role: "assistant",
                                content: streamState.streamingText || "",
                                toolCalls: streamState.streamingToolCalls.length > 0 ? streamState.streamingToolCalls : undefined,
                                jobIds: streamState.streamingToolCalls.filter(tc => tc.jobId).map(tc => tc.jobId!),
                            }}
                            context={context}
                            setView={setView}
                            onStopPromptAction={handleStopPromptAction}
                            isStreaming
                        />
                    )}
                    {streamState.streamingText !== null && streamState.roundPhase === "drafting" && !streamState.streamingText && (
                        <div className="chat-panel__loading">
                            <ThinkingIndicator phase="working" toolName="processing tool results" />
                        </div>
                    )}
                    {loading && streamState.streamingText === null && (
                        <div className="chat-panel__loading">
                            <ThinkingIndicator phase="thinking" />
                        </div>
                    )}
                    <div ref={endRef} />
                </div>
            )}

            {/* Input (always visible) */}
            {!showConvos && !showMemories && (
                <div className="chat-panel__input-area">
                    {/* @mention autocomplete picker */}
                    {mentionQuery !== null && (
                        <ChatMentionPicker
                            candidates={mentionCandidates}
                            activeIndex={mentionIndex}
                            onHoverIndex={setMentionIndex}
                            onPick={insertMention}
                        />
                    )}
                    <div
                        className={`chat-panel__input-bar${activeAgent ? " chat-panel__input-bar--agent" : studioActive ? " chat-panel__input-bar--studio" : editorActive ? " chat-panel__input-bar--editor" : ""}`}
                        style={activeAgent ? {
                            ["--agent-gradient-start" as any]: activeAgent.gradient?.[0] ?? "#38bdf8",
                            ["--agent-gradient-end" as any]: activeAgent.gradient?.[1] ?? "#a78bfa",
                        } : undefined}
                    >
                    <div className="chat-panel__bot-menu-wrapper" style={{ position: 'relative', display: 'flex', alignSelf: 'stretch' }}>
                        <button
                            type="button"
                            className={activeAgent ? "chat-panel__agent-input-badge" : studioActive ? "chat-panel__studio-input-badge" : editorActive ? "chat-panel__editor-input-badge" : "chat-panel__default-input-badge"}
                            onClick={() => setBotMenuOpen(prev => !prev)}
                            onBlur={(e) => {
                                if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
                                    setBotMenuOpen(false);
                                }
                            }}
                            title="Switch Bot Theme"
                        >
                            {activeAgent?.icon ? (
                                <GradientIcon
                                    icon={activeAgent.icon as any}
                                    size={13}
                                    gradient={activeAgent.gradient ?? ["#38bdf8", "#a78bfa"]}
                                />
                            ) : studioActive ? (
                                <Clapperboard size={13} />
                            ) : editorActive ? (
                                <Edit3 size={13} />
                            ) : (
                                <Bot size={13} style={{ color: 'var(--text-muted)' }} />
                            )}
                        </button>
                        
                        {botMenuOpen && (
                            <div className="chat-panel__bot-menu-dropdown">
                                <div className="chat-panel__bot-menu-title">BOT THEMES</div>
                                
                                {(() => {
                                    const LOHK_IDS = ["libp2p", "helia", "kubo-bot", "orbitdb", "orbitdb-server"];
                                    const ORCHESTRATOR_ID = "orchestrator-bot";
                                    const all = Object.values(availableAgents);
                                    const orchestrator = all.find(a => a.id === ORCHESTRATOR_ID);
                                    const lohkChildren = LOHK_IDS
                                        .map(id => all.find(a => a.id === id))
                                        .filter((a): a is NonNullable<typeof a> => Boolean(a));
                                    const others = all.filter(a => a.id !== ORCHESTRATOR_ID && !LOHK_IDS.includes(a.id));
                                    const renderAgentButton = (agent: typeof all[number], nested = false) => (
                                        <button
                                            key={agent.id}
                                            type="button"
                                            className={`chat-panel__bot-menu-item${nested ? " chat-panel__bot-menu-item--nested" : ""}${activeAgent?.id === agent.id ? " chat-panel__bot-menu-item--active" : ""}`}
                                            onClick={() => {
                                                useChatAgentsStore.getState().setActive(agent.id);
                                                setBotMenuOpen(false);
                                            }}
                                        >
                                            <GradientIcon icon={agent.icon as any} size={14} gradient={agent.gradient ?? ["#38bdf8", "#a78bfa"]} />
                                            <span style={{flex: 1}}>{agent.name}</span>
                                            {activeAgent?.id === agent.id && <Check size={12} />}
                                        </button>
                                    );
                                    return (
                                        <>
                                            {orchestrator && (
                                                <div className="chat-panel__bot-menu-group">
                                                    <div className={`chat-panel__bot-menu-item chat-panel__bot-menu-item--parent${activeAgent?.id === orchestrator.id ? " chat-panel__bot-menu-item--active" : ""}`}>
                                                        <button
                                                            type="button"
                                                            className="chat-panel__bot-menu-chevron"
                                                            onClick={(e) => { e.stopPropagation(); setLohkExpanded(v => !v); }}
                                                            title={lohkExpanded ? "Collapse L.O.H.K bots" : "Expand L.O.H.K bots"}
                                                            aria-expanded={lohkExpanded}
                                                        >
                                                            {lohkExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="chat-panel__bot-menu-item-main"
                                                            onClick={() => {
                                                                useChatAgentsStore.getState().setActive(orchestrator.id);
                                                                setBotMenuOpen(false);
                                                            }}
                                                        >
                                                            <GradientIcon icon={orchestrator.icon as any} size={14} gradient={orchestrator.gradient ?? ["#38bdf8", "#a78bfa"]} />
                                                            <span style={{flex: 1}}>{orchestrator.name}</span>
                                                            {activeAgent?.id === orchestrator.id && <Check size={12} />}
                                                        </button>
                                                    </div>
                                                    {lohkExpanded && lohkChildren.map(a => renderAgentButton(a, true))}
                                                </div>
                                            )}
                                            {others.map(a => renderAgentButton(a, false))}
                                        </>
                                    );
                                })()}
                                
                                <div className="chat-panel__bot-menu-divider" />
                                
                                <button
                                    type="button"
                                    className={`chat-panel__bot-menu-item${(!activeAgent) ? " chat-panel__bot-menu-item--active" : ""}`}
                                    onClick={() => {
                                        useChatAgentsStore.getState().setActive(null);
                                        setBotMenuOpen(false);
                                    }}
                                >
                                    <Square size={14} className={(!activeAgent) ? "" : "chat-panel__bot-menu-item--disabled"} />
                                    <span style={{flex: 1}} className={(!activeAgent) ? "" : "chat-panel__bot-menu-item--disabled"}>Deactivate</span>
                                    {(!activeAgent) && <Check size={12} />}
                                </button>

                                {activeAgent && layoutOverrides[activeAgent.id] && (
                                    <button
                                        type="button"
                                        className="chat-panel__bot-menu-item"
                                        onClick={() => {
                                            resetLayoutOverride(activeAgent.id);
                                            setBotMenuOpen(false);
                                        }}
                                    >
                                        <LayoutTemplate size={14} style={{ color: 'var(--text-muted)' }} />
                                        <span style={{flex: 1}}>Default layout</span>
                                    </button>
                                )}

                            </div>
                        )}
                    </div>
                    {pinnedMentions.length > 0 && (
                        <div className="chat-panel__pinned-mentions" aria-label="Mentioned agents">
                            {pinnedMentions.map(m => {
                                const key = `${m.type}:${m.id}`;
                                return (
                                    <span
                                        key={key}
                                        className={`chat-panel__pinned-mention chat-panel__pinned-mention--${m.type}`}
                                        title={`${m.type === "agent" ? "Agent" : "Group"}: ${m.name}`}
                                    >
                                        <span className="chat-panel__pinned-mention-label">@{m.name}</span>
                                        <button
                                            type="button"
                                            className="chat-panel__pinned-mention-remove"
                                            onMouseDown={e => { e.preventDefault(); removePinnedMention(key); }}
                                            aria-label={`Remove ${m.name} mention`}
                                            tabIndex={-1}
                                        >
                                            <X size={10} strokeWidth={2.5} />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
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
                            // Backspace on an empty input pops the last pinned mention chip.
                            if (e.key === "Backspace" && input.length === 0 && pinnedMentions.length > 0) {
                                e.preventDefault();
                                setPinnedMentions(prev => prev.slice(0, -1));
                                return;
                            }
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                        }}
                        placeholder={activeAgent?.placeholder ?? (studioActive ? "Ask the AI to build on the Studio canvas..." : editorActive ? "Ask the AI to help edit your file..." : "Ask about your workspace — type @ to mention agents...")}
                        disabled={loading && !streamState.streamingText}
                        className={`chat-panel__input${studioActive ? " chat-panel__input--studio" : editorActive ? " chat-panel__input--editor" : ""}`}
                        data-testid="chat-panel-input"
                    />
                    {loading ? (
                        <button
                            onClick={stopStreaming}
                            className="chat-panel__send-btn chat-panel__send-btn--stop"
                            title="Stop generating"
                            data-testid="chat-panel-stop"
                        ><Square size={14} /></button>
                    ) : (
                        <button
                            onClick={send}
                            disabled={!input.trim() && pinnedMentions.length === 0}
                            className={`chat-panel__send-btn${isReady ? " chat-panel__send-btn--ready" : ""}`}
                            data-testid="chat-panel-send"
                        ><Send size={14} /></button>
                    )}
                    </div>
                </div>
            )}

            {/* Command Prompt Modal */}
            {pendingCommand && (
                <CommandPrompt
                    command={pendingCommand.command}
                    initialArgs={pendingCommand.initialArgs}
                    entities={{
                        agents: workspaceCtx.agents.map((a: Agent) => ({ id: a.id, name: a.name })),
                        channels: workspaceCtx.channels.map((c: Channel) => ({ id: c.id, from: c.from, to: c.to, type: c.type })),
                        groups: workspaceCtx.groups.map((g: Group) => ({ id: g.id, name: g.name })),
                        networks: (ecosystem?.networks || []).map((n: { id: string; name: string; color?: string }) => ({ id: n.id, name: n.name, color: n.color })),
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

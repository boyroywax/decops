import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, LayoutTemplate, AlignJustify, MessageCircle, ChevronsUp, ChevronsDown, ChevronDown, ChevronRight, Clapperboard, Edit3, Eye, Send, Square, Check, Bot } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { chatWithWorkspace, streamChatWithWorkspace, getChatModel, chatWithAgent } from "@/services/ai";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext, StreamCallbacks } from "@/services/ai";
import { useLLM } from "@/context/LLMContext";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { makeId } from "@/components/chat/utils";
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

export function ChatPanel({ context, ecosystem, onClose, addLog, height, setHeight, isExpanded, onToggleExpand, position = "bottom", view, setView }: ChatPanelProps) {
    const { activeWorkspaceId } = useWorkspaceManager();
    const {
        conversations, setConversations,
        activeId, setActiveId,
        showConvos, setShowConvos,
        active, messages,
        endRef, inputRef, initialScrollDone,
        updateConversation, createNewChat, switchTo, deleteConvo,
    } = useConversations(activeWorkspaceId);

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
    const [streamingText, setStreamingText] = useState<string | null>(null);
    const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallDisplay[]>([]);
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
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    const architectMessageRef = useRef<{ conversationId: string | null; messageId: string | null }>({
        conversationId: null,
        messageId: null,
    });

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

    // External focus requests (Cmd+K, libp2p Bot button, …) bump focusTick.
    useEffect(() => {
        if (focusTick > 0) {
            // Defer to next paint so the chat panel has a chance to mount.
            const t = setTimeout(() => inputRef.current?.focus(), 30);
            return () => clearTimeout(t);
        }
    }, [focusTick]);

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

    // Re-focus input after the assistant finishes responding so the
    // operator can keep typing without re-clicking the textbox.
    useEffect(() => {
        if (!loading && !showConvos && inputRef.current?.offsetParent !== null) {
            inputRef.current?.focus();
        }
    }, [loading, showConvos]);

    // Build Commmand Context for CLI
    const { user } = useAuth();
    const jobs = useJobsContext();
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

    // @mention autocomplete candidates
    const mentionCandidates = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        const agents = (workspaceCtx.agents || []).map((a: Agent) => ({
            type: "agent" as const, id: a.id as string, name: a.name as string,
            detail: (a.title || a.role || "") as string,
        }));
        const groups = (workspaceCtx.groups || []).map((g: Group) => ({
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
        ecosystem: ecosystem ?? { networks: [], bridges: [] }, // Fallback if missing, some cmds might fail
        architect,
        addLog: addLog || (() => { }) as (msg: string) => void,
        extensions: { studio: studioApi ?? undefined, editor: editorApi ?? undefined },
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

        // Active chat agent routing (Architect, libp2p, …) — first chance to handle the input.
        // Non-slash, non-@mention messages are offered to the active agent's onSubmit.
        if (activeAgent?.onSubmit && !text.startsWith("/") && !/^@\w/.test(text)) {
            try {
                const handled = await activeAgent.onSubmit(text, {
                    conversationId: currentId,
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
                        setStreamingText("");
                        setStreamingToolCalls([]);
                        const commit = (final: string) => {
                            if (closed) return;
                            closed = true;
                            setStreamingText(null);
                            setStreamingToolCalls([]);
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
                                setStreamingText(prev => (prev ?? "") + token);
                            },
                            set: (next: string) => {
                                if (closed) return;
                                buffer = next;
                                setStreamingText(next);
                            },
                            done: (final?: string) => commit(final ?? buffer),
                            error: (msg: string) => commit(`${activeAgent.name} error: ${msg}`),
                        };
                    },
                });
                if (handled) {
                    addLog?.(`Chat[${activeAgent.id}]: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                const errMsg = [...updatedMsgs, { role: "assistant" as const, content: `${activeAgent.name} error: ${err instanceof Error ? err.message : String(err)}` }];
                updateConversation(currentId, errMsg);
                setLoading(false);
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
                    activeAgent?.toolkitIds,
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
    }, [input, loading, activeId, conversations, context, addLog, updateConversation, commandContext, queueCommandAsJob, workspaceCtx, activeAgent]);

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
                            <MessageBubble msg={m} context={context} setView={setView} />
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
                            setView={setView}
                            isStreaming
                        />
                    )}
                    {loading && streamingText === null && (
                        <div className="chat-panel__loading">
                            <ThinkingIndicator phase="thinking" />
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
                        placeholder={activeAgent?.placeholder ?? (studioActive ? "Ask the AI to build on the Studio canvas..." : editorActive ? "Ask the AI to help edit your file..." : "Ask about your workspace — type @ to mention agents...")}
                        disabled={loading && !streamingText}
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
                            disabled={!input.trim()}
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

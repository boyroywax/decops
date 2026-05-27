import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { streamChatWithWorkspace, chatWithAgent } from "@/services/ai";
import type { ChatMessage, WorkspaceContext, WorkspaceP2PContext, StreamCallbacks } from "@/services/ai";
import { makeId } from "@/components/chat/utils";
import { EDITOR_DOC_BEGIN, EDITOR_DOC_END } from "@/components/chat/editorPreview";
import { registry as commandRegistry } from "@/services/commands/registry";
import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import type { Conversation } from "@/components/chat/types";
import type { PinnedMention } from "@/hooks/chat/useChatMentions";
import type { JobStep, Agent, Group } from "@/types";
import type { ChatAgent } from "@/services/chat/agents";

type StreamingState = {
    streamingText: string | null;
    streamingToolCalls: ChatMessage["toolCalls"] extends infer T | undefined ? NonNullable<T> : never;
    startStreaming: () => void;
    clearStreaming: () => void;
    flushPending: () => void;
    setStreamingText: Dispatch<SetStateAction<string | null>>;
    buildCallbacks: (signal: AbortSignal) => StreamCallbacks;
};

type JobsApi = {
    jobs: Array<{
        id: string;
        status: string;
        type: string;
        request?: { description?: string };
    }>;
    addJob: (job: {
        type: string;
        request: { description: string };
        steps: JobStep[];
        mode: "serial" | "parallel";
    }) => { id: string };
    stopJob: (id: string) => void;
};

type WorkspaceCtxLike = {
    agents?: Agent[];
    groups?: Group[];
};

type EditorApiLike = {
    getState: () => {
        docName: string;
        fileType: string;
        content: string;
        stats: { lines: number; words: number };
        validation: { valid: boolean; error?: string };
    };
};

interface PendingCommand {
    command: CommandDefinition;
    initialArgs: Record<string, any>;
    convoId: string;
    msgs: ChatMessage[];
}

export interface UseChatSendOptions {
    // Input + UI state
    input: string;
    setInput: Dispatch<SetStateAction<string>>;
    loading: boolean;
    setLoading: Dispatch<SetStateAction<boolean>>;
    pinnedMentions: PinnedMention[];
    setMentionQuery: Dispatch<SetStateAction<string | null>>;

    // Conversations
    activeId: string | null;
    setActiveId: Dispatch<SetStateAction<string | null>>;
    conversations: Conversation[];
    setConversations: Dispatch<SetStateAction<Conversation[]>>;
    updateConversation: (id: string, messages: ChatMessage[]) => void;

    // Active agent
    activeAgent: ChatAgent | null;

    // Editor mode
    editorActive: boolean;
    editorApi: EditorApiLike | null;

    // Contexts
    workspaceCtx: WorkspaceCtxLike;
    commandContext: CommandContext;
    context: WorkspaceContext;
    refreshContext?: () => WorkspaceContext;
    readP2PContext: () => WorkspaceP2PContext;

    // Side services
    addLog?: (msg: string) => void;
    jobs: JobsApi;
    streamState: StreamingState;
}

export interface UseChatSendResult {
    send: () => Promise<void>;
    stopStreaming: () => void;
    handleStopPromptAction: (
        choice: "finish" | "stop" | "stop-and-job",
        prompt: NonNullable<ChatMessage["stopPrompt"]>,
    ) => void;
    pendingCommand: PendingCommand | null;
    handlePromptSubmit: (commandId: string, args: Record<string, any>) => void;
    handlePromptCancel: () => void;
}

/**
 * §2.2 — Owns the chat send pipeline extracted from ChatPanel:
 *   - send()             user-message dispatcher (agent routing → /cmd → @mentions → streaming LLM)
 *   - stopStreaming()    cancel + write a stop-prompt assistant message
 *   - handleStopPromptAction()  handle the user's choice from the stop-prompt UI
 *   - queueCommandAsJob() / pendingCommand state + prompt modal handlers
 */
export function useChatSend(opts: UseChatSendOptions): UseChatSendResult {
    const {
        input, setInput,
        loading, setLoading,
        pinnedMentions,
        setMentionQuery,
        activeId, setActiveId,
        conversations, setConversations, updateConversation,
        activeAgent,
        editorActive, editorApi,
        workspaceCtx, commandContext,
        context, refreshContext, readP2PContext,
        addLog, jobs, streamState,
    } = opts;

    const abortRef = useRef<AbortController | null>(null);
    const runCounterRef = useRef(0);
    const activeRunIdRef = useRef<number | null>(null);
    const cancelledRunIdRef = useRef<number | null>(null);
    const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);

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
    }, [activeAgent, activeId, conversations, jobs.jobs, streamState, updateConversation, setLoading]);

    const handleStopPromptAction = useCallback((
        choice: "finish" | "stop" | "stop-and-job",
        prompt: NonNullable<ChatMessage["stopPrompt"]>,
    ) => {
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
    }, [activeId, conversations, updateConversation, jobs]);

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
    }, [
        input, pinnedMentions, loading, activeId, conversations, context, refreshContext,
        addLog, updateConversation, commandContext, queueCommandAsJob, workspaceCtx,
        activeAgent, readP2PContext, streamState, editorActive, editorApi,
        setActiveId, setConversations, setInput, setLoading, setMentionQuery,
    ]);

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

    return {
        send,
        stopStreaming,
        handleStopPromptAction,
        pendingCommand,
        handlePromptSubmit,
        handlePromptCancel,
    };
}

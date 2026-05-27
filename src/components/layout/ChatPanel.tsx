import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getChatModel } from "@/services/ai";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext } from "@/services/ai";
import { useLLM } from "@/context/LLMContext";
import { useStreamingChatState } from "@/components/chat/useStreamingChatState";
import { makeId } from "@/components/chat/utils";
import { MemoriesPanel } from "@/components/chat/MemoriesPanel";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ChatPanelHeader } from "@/components/chat/ChatPanelHeader";
import { ConversationsList } from "@/components/chat/ConversationsList";
import { useChatMentions } from "@/hooks/chat/useChatMentions";
import { useChatScroll } from "@/hooks/chat/useChatScroll";
import { useChatSend } from "@/hooks/chat/useChatSend";
import type { Conversation } from "@/components/chat/types";
import { useCommandContext } from "@/hooks/useCommandContext";
import type { EcosystemInput } from "@/hooks/useCommandContext";
import { useJobsContext } from "@/context/JobsContext";
import { useArchitectContext } from "@/toolkits/architect";
import { useEcosystem } from "@/hooks/useEcosystem"; // Bridge UI — needed for command context ecosystem prop
import { useAuth } from "@/context/AuthContext";
import { CommandPrompt } from "@/components/actions/CommandPrompt";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useStudioContext } from "@/toolkits/studio";
import { useEditorContext } from "@/toolkits/editor";
import { useP2PChatNotifications } from "@/hooks/chat/useP2PChatNotifications";
import type { ChatPosition } from "@/context/ThemeContext";
import type { ViewId, Agent, Channel, Group } from "@/types";
import { useConversations } from "@/hooks/useConversations";
import { useChatResize } from "@/hooks/useChatResize";
import { useWorkspaceManager } from "@/hooks/useWorkspaceManager";
import { useActiveChatAgent, useChatAgentsStore } from "@/services/chat/agents";
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
    const { user } = useAuth();
    const jobs = useJobsContext();
    const architectMessageRef = useRef<{ conversationId: string | null; messageId: string | null }>({
        conversationId: null,
        messageId: null,
    });

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

    // §2.2 — send pipeline, stop controls, /cmd queue, prompt modal
    const {
        send, stopStreaming, handleStopPromptAction,
        pendingCommand, handlePromptSubmit, handlePromptCancel,
    } = useChatSend({
        input, setInput, loading, setLoading,
        pinnedMentions, setMentionQuery,
        activeId, setActiveId,
        conversations, setConversations, updateConversation,
        activeAgent,
        editorActive, editorApi,
        workspaceCtx, commandContext,
        context, refreshContext, readP2PContext,
        addLog, jobs, streamState,
    });

    
    
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
                <ChatMessageList
                    messages={messages}
                    loading={loading}
                    context={context}
                    setView={setView}
                    handleStopPromptAction={handleStopPromptAction}
                    activeAgent={activeAgent}
                    setInput={setInput}
                    inputRef={inputRef}
                    editorActive={editorActive}
                    editorApi={editorApi}
                    proposeEdit={proposeEdit}
                    streamState={streamState}
                    endRef={endRef}
                />
            )}

            {/* Input (always visible) */}
            {!showConvos && !showMemories && (
                <ChatInputBar
                    activeAgent={activeAgent}
                    availableAgents={availableAgents}
                    studioActive={studioActive}
                    editorActive={editorActive}
                    input={input}
                    setInput={setInput}
                    inputRef={inputRef}
                    loading={loading}
                    isReady={isReady}
                    streamState={streamState}
                    send={send}
                    stopStreaming={stopStreaming}
                    mentionQuery={mentionQuery}
                    setMentionQuery={setMentionQuery}
                    mentionIndex={mentionIndex}
                    setMentionIndex={setMentionIndex}
                    mentionCandidates={mentionCandidates}
                    insertMention={insertMention}
                    pinnedMentions={pinnedMentions}
                    setPinnedMentions={setPinnedMentions}
                    removePinnedMention={removePinnedMention}
                    botMenuOpen={botMenuOpen}
                    setBotMenuOpen={setBotMenuOpen}
                    lohkExpanded={lohkExpanded}
                    setLohkExpanded={setLohkExpanded}
                    hasLayoutOverride={!!(activeAgent && layoutOverrides[activeAgent.id])}
                    onResetLayout={() => activeAgent && resetLayoutOverride(activeAgent.id)}
                />
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

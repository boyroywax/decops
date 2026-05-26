import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Agent, Message } from "@/types";
import { streamChatWithAgent } from "@/services/ai";
import type { ChatMessage, ToolCallDisplay, StreamCallbacks, WorkspaceContext } from "@/services/ai";
import { ROLES } from "@/constants";
import { MessageSquare, Send, ChevronDown, ChevronUp, Square } from "lucide-react";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { useStreamingChatState } from "@/components/chat/useStreamingChatState";
import { useWorkspaceStore } from "@/stores";
import { useAuth } from "@/context/AuthContext";
import { useCommandCtx } from "@/context/CommandContextProvider";
import { useJobsContext } from "@/context/JobsContext";
import "../../styles/components/agent-chat.css";

interface AgentChatProps {
  agent: Agent;
}

/**
 * Synthetic channel id used for direct user↔agent chats. These messages live
 * in the workspace `messages` array (so they survive workspace persistence
 * and appear in the Messages section's "All Messages" feed) but don't
 * belong to any real Channel entity.
 */
const directChannelId = (agentId: string) => `direct:${agentId}`;

export function AgentChat({ agent }: AgentChatProps) {
  const { user } = useAuth();
  const messagesAll = useWorkspaceStore((s) => s.messages);
  const addMessage = useWorkspaceStore((s) => s.addMessage);
  const setMessages = useWorkspaceStore((s) => s.setMessages);
  const commandContext = useCommandCtx();
  const { jobs, addJob } = useJobsContext();

  const channelId = directChannelId(agent.id);
  const userId = user?.did || "user";

  // Hydrate chat history from persisted workspace messages. Persistence
  // only carries plain text — toolCalls / jobIds from previous turns
  // are session-only and live in `liveTurns` below.
  const persistedHistory = useMemo<ChatMessage[]>(() => {
    const out: ChatMessage[] = [];
    for (const m of messagesAll) {
      if (m.channelId !== channelId) continue;
      out.push({ role: "user", content: m.content });
      if (m.response) out.push({ role: "assistant", content: m.response });
    }
    return out;
  }, [messagesAll, channelId]);

  // Rich session-only enrichments for assistant turns produced in THIS
  // mount: tool calls and spawned job ids. Keyed by the workspace message
  // id so we can match them onto the persisted history.
  const [liveTurns, setLiveTurns] = useState<Record<string, {
    toolCalls?: ToolCallDisplay[];
    jobIds?: string[];
  }>>({});

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const streamState = useStreamingChatState();
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = ROLES.find(r => r.id === agent.role);

  // Build a minimal WorkspaceContext for MessageBubble — only `jobs` and
  // `addJob` are actually dereferenced by ActionCard, and direct
  // user↔agent chats rarely (if ever) emit ```action blocks.
  const bubbleContext = useMemo<WorkspaceContext>(() => ({
    agents: [],
    channels: [],
    groups: [],
    messages: [],
    networks: [],
    bridges: [],
    jobs,
    addJob,
  }), [jobs, addJob]);

  // Render-ready history: persisted text + any session-only enrichments.
  // We rebuild on every render so newly-completed turns immediately show
  // their tool calls / job progress cards.
  const history = useMemo<ChatMessage[]>(() => {
    const out: ChatMessage[] = [];
    let userMessageIdx = -1;
    let lastMessageId: string | null = null;
    for (const m of messagesAll) {
      if (m.channelId !== channelId) continue;
      out.push({ role: "user", content: m.content });
      userMessageIdx = out.length - 1;
      lastMessageId = m.id;
      // Show the assistant bubble if there's text OR tool calls
      const enrich = liveTurns[m.id];
      const hasText = !!m.response;
      const hasToolCalls = enrich?.toolCalls && enrich.toolCalls.length > 0;
      if (hasText || hasToolCalls) {
        out.push({
          role: "assistant",
          content: m.response || "",
          toolCalls: enrich?.toolCalls,
          jobIds: enrich?.jobIds,
        });
      }
    }
    void userMessageIdx;
    void lastMessageId;
    return out;
  }, [messagesAll, channelId, liveTurns]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, loading, streamState.streamingText, streamState.streamingToolCalls.length]);

  useEffect(() => {
    if (!collapsed) inputRef.current?.focus();
  }, [collapsed]);

  useEffect(() => {
    if (!loading && !collapsed) inputRef.current?.focus();
  }, [loading, collapsed]);

  useEffect(() => {
    setInput("");
    setLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
    streamState.clearStreaming();
  }, [agent.id]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const msgId = crypto.randomUUID();
    const ts = Date.now();

    const pending: Message = {
      id: msgId,
      channelId,
      fromId: userId,
      toId: agent.id,
      content: text,
      response: null,
      status: "sending",
      ts,
    };
    addMessage(pending);
    setInput("");
    setLoading(true);
    streamState.startStreaming();

    const controller = new AbortController();
    abortRef.current = controller;

    // Snapshot the history the model should see (excludes this in-flight turn)
    const historyForModel = persistedHistory;

    const callbacks: StreamCallbacks = streamState.buildCallbacks(controller.signal);

    try {
      const { text: response, toolCalls } = await streamChatWithAgent(
        agent,
        text,
        historyForModel,
        callbacks,
        commandContext ?? undefined,
      );
      const collectedJobIds = toolCalls.filter(tc => tc.jobId).map(tc => tc.jobId!);
      setLiveTurns(prev => ({
        ...prev,
        [msgId]: {
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          jobIds: collectedJobIds.length > 0 ? collectedJobIds : undefined,
        },
      }));
      // Persist the response. Store the text (even empty) so the
      // history builder can still render tool-call cards attached to
      // this assistant turn. Only skip if truly nothing to show.
      const trimmed = response.trim();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, response: trimmed, status: "delivered" }
            : m
        )
      );
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                response: aborted ? "[Stopped]" : "[Error: Failed to get response]",
                status: "delivered",
              }
            : m
        )
      );
    } finally {
      streamState.flushPending();
      abortRef.current = null;
      streamState.clearStreaming();
      setLoading(false);
    }
  }, [
    input,
    loading,
    persistedHistory,
    agent,
    channelId,
    userId,
    addMessage,
    setMessages,
    commandContext,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="agent-chat">
      <div className="agent-chat__header">
        <div className="agent-chat__header-left">
          <span
            className="agent-chat__header-dot"
            style={{ background: role?.color || "#555" }}
          />
          Chat with {agent.name}
        </div>
        <button
          className="agent-chat__toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="agent-chat__messages">
            {history.length === 0 && !loading && (
              <div className="agent-chat__empty">
                <MessageSquare size={20} />
                <div>Send a message to start chatting with {agent.name}</div>
                <div style={{ fontSize: 9, color: "var(--text-invisible)" }}>
                  The agent will respond in-character based on their role and prompt
                </div>
              </div>
            )}
            {history.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                context={bubbleContext}
              />
            ))}
            {streamState.streamingText !== null && (
              <MessageBubble
                msg={{
                  role: "assistant",
                  content: streamState.streamingText || "",
                  toolCalls: streamState.streamingToolCalls.length > 0 ? streamState.streamingToolCalls : undefined,
                  jobIds: streamState.streamingToolCalls.filter(tc => tc.jobId).map(tc => tc.jobId!),
                }}
                context={bubbleContext}
                isStreaming
              />
            )}
            {loading && streamState.streamingText !== null && streamState.roundPhase === "drafting" && !streamState.streamingText && (
              <ThinkingIndicator name={agent.name} phase="working" toolName="processing tool results" />
            )}
            {loading && streamState.streamingText === null && (
              <ThinkingIndicator name={agent.name} phase="thinking" />
            )}
            <div ref={endRef} />
          </div>

          <div className="agent-chat__input-area">
            <input
              ref={inputRef}
              className="agent-chat__input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agent.name}...`}
              disabled={loading}
            />
            {loading ? (
              <button
                className="agent-chat__send-btn"
                onClick={stop}
                title="Stop the in-flight response"
              >
                <Square size={12} /> Stop
              </button>
            ) : (
              <button
                className="agent-chat__send-btn"
                onClick={sendMessage}
                disabled={!input.trim()}
              >
                <Send size={12} /> Send
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}


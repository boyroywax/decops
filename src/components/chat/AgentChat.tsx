import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Agent, Message } from "@/types";
import { chatWithAgent } from "@/services/ai";
import type { ChatMessage } from "@/services/ai";
import { ROLES } from "@/constants";
import { MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { useWorkspaceStore } from "@/stores";
import { useAuth } from "@/context/AuthContext";
import { useCommandCtx } from "@/context/CommandContextProvider";
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

  const channelId = directChannelId(agent.id);
  const userId = user?.did || "user";

  // Hydrate chat history from persisted workspace messages
  const history = useMemo<ChatMessage[]>(() => {
    const out: ChatMessage[] = [];
    for (const m of messagesAll) {
      if (m.channelId !== channelId) continue;
      out.push({ role: "user", content: m.content });
      if (m.response) out.push({ role: "assistant", content: m.response });
    }
    return out;
  }, [messagesAll, channelId]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = ROLES.find(r => r.id === agent.role);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, loading]);

  useEffect(() => {
    if (!collapsed) inputRef.current?.focus();
  }, [collapsed]);

  // Re-focus the input once the agent finishes responding so the
  // operator can keep typing without re-clicking the textbox.
  useEffect(() => {
    if (!loading && !collapsed) inputRef.current?.focus();
  }, [loading, collapsed]);

  // Reset input when agent changes
  useEffect(() => {
    setInput("");
    setLoading(false);
  }, [agent.id]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const msgId = crypto.randomUUID();
    const ts = Date.now();

    // Optimistically persist the user's message with no response yet
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

    // Snapshot the history that the model should see (excludes this in-flight turn)
    const historyForModel = history;

    try {
      const { text: response } = await chatWithAgent(
        agent,
        text,
        historyForModel,
        commandContext ?? undefined,
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, response, status: "delivered" } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, response: "[Error: Failed to get response]", status: "delivered" }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, history, agent, channelId, userId, addMessage, setMessages, commandContext]);

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
              <div
                key={i}
                className={`agent-chat__message agent-chat__message--${msg.role === "user" ? "user" : "agent"}`}
              >
                <div className="agent-chat__sender">
                  {msg.role === "user" ? "You" : agent.name}
                </div>
                <div className="agent-chat__bubble">
                  {msg.role === "user"
                    ? <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                    : <MarkdownContent content={msg.content} />
                  }
                </div>
              </div>
            ))}
            {loading && (
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
            <button
              className="agent-chat__send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
            >
              <Send size={12} /> Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

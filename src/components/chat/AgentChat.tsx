import { useState, useRef, useEffect, useCallback } from "react";
import type { Agent } from "../../types";
import { chatWithAgent } from "../../services/ai";
import type { ChatMessage } from "../../services/ai";
import { ROLES } from "../../constants";
import { MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { MarkdownContent } from "../shared/MarkdownContent";
import "../../styles/components/agent-chat.css";

interface AgentChatProps {
  agent: Agent;
}

export function AgentChat({ agent }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = ROLES.find(r => r.id === agent.role);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    if (!collapsed) inputRef.current?.focus();
  }, [collapsed]);

  // Reset chat when agent changes
  useEffect(() => {
    setMessages([]);
    setInput("");
    setLoading(false);
  }, [agent.id]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setLoading(true);

    try {
      const response = await chatWithAgent(agent, text, messages);
      const assistantMsg: ChatMessage = { role: "assistant", content: response };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "[Error: Failed to get response]" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, agent]);

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
            {messages.length === 0 && !loading && (
              <div className="agent-chat__empty">
                <MessageSquare size={20} />
                <div>Send a message to start chatting with {agent.name}</div>
                <div style={{ fontSize: 9, color: "var(--text-invisible)" }}>
                  The agent will respond in-character based on their role and prompt
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
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
              <div className="agent-chat__typing">
                <div className="agent-chat__typing-dots">
                  <div className="agent-chat__typing-dot" />
                  <div className="agent-chat__typing-dot" />
                  <div className="agent-chat__typing-dot" />
                </div>
                {agent.name} is thinking...
              </div>
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

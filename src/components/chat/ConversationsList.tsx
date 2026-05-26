import { X } from "lucide-react";
import type { Conversation } from "@/components/chat/types";

interface ConversationsListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

/**
 * Conversations sidebar list shown when the user toggles the
 * "Conversations" header button.
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function ConversationsList({ conversations, activeId, onSwitch, onDelete, onNew }: ConversationsListProps) {
  return (
    <div className="chat-panel__convos-list">
      {conversations.length === 0 && (
        <div className="chat-panel__empty-state">
          <div className="chat-panel__empty-text">No conversations yet</div>
          <button onClick={onNew} className="chat-panel__start-btn">+ Start a conversation</button>
        </div>
      )}
      {conversations.map(c => (
        <div
          key={c.id}
          onClick={() => onSwitch(c.id)}
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
            onClick={e => { e.stopPropagation(); onDelete(c.id); }}
            className="chat-panel__convo-delete"
            title="Delete conversation"
          ><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

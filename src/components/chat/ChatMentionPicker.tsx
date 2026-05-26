import type { MouseEvent } from "react";

export interface MentionCandidate {
  type: "agent" | "group";
  id: string;
  name: string;
  detail: string;
}

interface ChatMentionPickerProps {
  candidates: MentionCandidate[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onPick: (candidate: MentionCandidate) => void;
}

/**
 * Floating @mention autocomplete popup displayed above the chat input.
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function ChatMentionPicker({ candidates, activeIndex, onHoverIndex, onPick }: ChatMentionPickerProps) {
  if (candidates.length === 0) return null;
  return (
    <div className="chat-panel__mention-picker">
      {candidates.map((c, i) => (
        <div
          key={`${c.type}-${c.id}`}
          className={`chat-panel__mention-item${i === activeIndex ? " chat-panel__mention-item--active" : ""}`}
          onMouseDown={(e: MouseEvent) => { e.preventDefault(); onPick(c); }}
          onMouseEnter={() => onHoverIndex(i)}
        >
          <span className={`chat-panel__mention-badge chat-panel__mention-badge--${c.type}`}>
            {c.type === "agent" ? "A" : "G"}
          </span>
          <span className="chat-panel__mention-name">{c.name}</span>
          <span className="chat-panel__mention-detail">{c.detail}</span>
        </div>
      ))}
    </div>
  );
}

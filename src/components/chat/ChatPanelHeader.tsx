import { AlignJustify, Brain, ChevronsDown, ChevronsUp, Globe, X } from "lucide-react";

interface ChatPanelHeaderProps {
  conversationsCount: number;
  showConvos: boolean;
  showMemories: boolean;
  showEcosystem: boolean;
  ecosystemCount?: number;
  isSide: boolean;
  isExpanded: boolean;
  onToggleConvos: () => void;
  onToggleMemories: () => void;
  onToggleEcosystem: () => void;
  onNew: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
}

/**
 * Top bar of the chat panel: title, Conversations/Memories toggles,
 * New / Expand / Close buttons.
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function ChatPanelHeader({
  conversationsCount,
  showConvos,
  showMemories,
  showEcosystem,
  ecosystemCount,
  isSide,
  isExpanded,
  onToggleConvos,
  onToggleMemories,
  onToggleEcosystem,
  onNew,
  onToggleExpand,
  onClose,
}: ChatPanelHeaderProps) {
  return (
    <div className="chat-panel__header">
      <div className="chat-panel__header-left">
        <span className="chat-panel__title">WORKSPACE CHAT</span>
        <span className="chat-panel__separator">│</span>
        <button
          onClick={onToggleConvos}
          className={`chat-panel__convos-toggle${showConvos ? " chat-panel__convos-toggle--active" : ""}`}
        >
          <AlignJustify size={9} />
          Conversations
          {conversationsCount > 0 && (
            <span className={`chat-panel__convos-count${showConvos ? " chat-panel__convos-count--active" : ""}`}>{conversationsCount}</span>
          )}
        </button>
        <button
          onClick={onToggleMemories}
          className={`chat-panel__convos-toggle${showMemories ? " chat-panel__convos-toggle--active" : ""}`}
          title="Collective memory"
          data-testid="chat-panel-memories-toggle"
        >
          <Brain size={9} />
          Memories
        </button>
        <button
          onClick={onToggleEcosystem}
          className={`chat-panel__convos-toggle${showEcosystem ? " chat-panel__convos-toggle--active" : ""}`}
          title="Ecosystem messaging"
          data-testid="chat-panel-ecosystem-toggle"
        >
          <Globe size={9} />
          Ecosystem
          {ecosystemCount !== undefined && ecosystemCount > 0 && (
            <span className={`chat-panel__convos-count${showEcosystem ? " chat-panel__convos-count--active" : ""}`}>{ecosystemCount}</span>
          )}
        </button>
      </div>
      <div className="chat-panel__header-right">
        <button onClick={onNew} className="chat-panel__new-btn" title="New conversation">+ New</button>
        {!isSide && (
          <button
            onClick={onToggleExpand}
            className="chat-panel__expand-btn"
            title={isExpanded ? "Collapse panel" : "Expand panel"}
          >{isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}</button>
        )}
        <button onClick={onClose} className="chat-panel__close-btn" title="Close chat">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

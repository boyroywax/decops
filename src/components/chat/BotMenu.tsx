import { Bot, Check, ChevronDown, ChevronRight, Clapperboard, Edit3, LayoutTemplate, Square } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useChatAgentsStore, type ChatAgent } from "@/services/chat/agents";

interface BotMenuProps {
  activeAgent: ChatAgent | null;
  availableAgents: Record<string, ChatAgent>;
  studioActive: boolean;
  editorActive: boolean;
  botMenuOpen: boolean;
  setBotMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  lohkExpanded: boolean;
  setLohkExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  /** If the active agent has a custom layout override the dropdown shows a "Default layout" reset entry. */
  hasLayoutOverride: boolean;
  onResetLayout: () => void;
}

const LOHK_IDS = ["libp2p", "helia", "kubo-bot", "orbitdb", "orbitdb-server"];
const ORCHESTRATOR_ID = "orchestrator-bot";

/**
 * Bot-theme picker dropdown anchored to the badge on the left of the input bar.
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function BotMenu({
  activeAgent,
  availableAgents,
  studioActive,
  editorActive,
  botMenuOpen,
  setBotMenuOpen,
  lohkExpanded,
  setLohkExpanded,
  hasLayoutOverride,
  onResetLayout,
}: BotMenuProps) {
  const all = Object.values(availableAgents);
  const orchestrator = all.find(a => a.id === ORCHESTRATOR_ID);
  const lohkChildren = LOHK_IDS
    .map(id => all.find(a => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const others = all.filter(a => a.id !== ORCHESTRATOR_ID && !LOHK_IDS.includes(a.id));

  const renderAgentButton = (agent: ChatAgent, nested = false) => (
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
      <span style={{ flex: 1 }}>{agent.name}</span>
      {activeAgent?.id === agent.id && <Check size={12} />}
    </button>
  );

  return (
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
                  <span style={{ flex: 1 }}>{orchestrator.name}</span>
                  {activeAgent?.id === orchestrator.id && <Check size={12} />}
                </button>
              </div>
              {lohkExpanded && lohkChildren.map(a => renderAgentButton(a, true))}
            </div>
          )}
          {others.map(a => renderAgentButton(a, false))}

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
            <span style={{ flex: 1 }} className={(!activeAgent) ? "" : "chat-panel__bot-menu-item--disabled"}>Deactivate</span>
            {(!activeAgent) && <Check size={12} />}
          </button>

          {activeAgent && hasLayoutOverride && (
            <button
              type="button"
              className="chat-panel__bot-menu-item"
              onClick={() => {
                onResetLayout();
                setBotMenuOpen(false);
              }}
            >
              <LayoutTemplate size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ flex: 1 }}>Default layout</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

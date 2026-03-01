/**
 * CommandCardModal — Rich detail modal for a command definition.
 *
 * Styled in the trading-card family (tc-backdrop / tc-card pattern).
 * Sections: identity · parameters · output schema · errors · AI models · live CLI.
 */

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  Terminal,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Cpu,
  Shield,
  Layers,
  Braces,
  Type,
  Hash,
  ToggleLeft,
  Box,
  List,
  Users,
  Radio,
  Network,
  Globe,
} from "lucide-react";
import type { CommandDefinition, CommandArg, CommandArgType } from "../../services/commands/types";
import { getCommandErrors } from "../../services/commands/commandErrors";
import { useLLM } from "../../context/LLMContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import "../../styles/components/command-card-modal.css";

/* ═══════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

const getCommandColor = (tags: string[]) => {
  if (tags.includes("architect")) return "#fb923c";
  if (tags.includes("data")) return "#3b82f6";
  if (tags.includes("ecosystem")) return "#38bdf8";
  if (tags.includes("agent")) return "#00e5a0";
  if (tags.includes("channel")) return "#a78bfa";
  if (tags.includes("messaging")) return "#f472b6";
  if (tags.includes("topology")) return "#38bdf8";
  if (tags.includes("group")) return "#f472b6";
  if (tags.includes("system")) return "#94a3b8";
  if (tags.includes("artifact")) return "#fbbf24";
  if (tags.includes("modification")) return "#ef4444";
  return "#71717a";
};

function getInitials(id: string): string {
  const parts = id.split(/[_\-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (id.length >= 2) return (id[0] + id[1]).toUpperCase();
  return id[0]?.toUpperCase() ?? "?";
}

/** Icon for an arg type */
const ARG_TYPE_ICON: Record<CommandArgType, typeof Type> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  object: Box,
  array: List,
  group: Users,
  agent: Cpu,
  channel: Radio,
  network: Network,
  workspace: Globe,
};

/** Generate a realistic example value for an arg based on workspace state */
function getExampleValue(
  arg: CommandArg,
  agents: { id: string; name: string }[],
  channels: { id: string }[],
  groups: { id: string; name: string }[],
): string {
  // If there's an enum, pick the first
  if (arg.enum && arg.enum.length > 0) return arg.enum[0];
  // If there's a default, show it
  if (arg.defaultValue !== undefined && arg.defaultValue !== 0 && arg.defaultValue !== "") {
    return String(arg.defaultValue);
  }

  switch (arg.type) {
    case "agent":
      return agents[0]?.name || agents[0]?.id || "agent-alpha";
    case "channel":
      return channels[0]?.id || "ch-001";
    case "group":
      return groups[0]?.name || groups[0]?.id || "task-force-1";
    case "network":
      return "net-main";
    case "workspace":
      return "workspace-1";
    case "number":
      return "10";
    case "boolean":
      return "true";
    case "array":
      return "[...]";
    case "object":
      return "{...}";
    default:
      // context-based string defaults
      if (arg.name.includes("prompt") || arg.name.includes("message")) return '"Build a research network"';
      if (arg.name.includes("name")) return '"Alpha"';
      if (arg.name.includes("description")) return '"A new network"';
      if (arg.name.includes("query")) return '"search term"';
      if (arg.name.includes("key")) return '"sk-..."';
      if (arg.name.includes("color")) return '"#ff6600"';
      if (arg.name.includes("id")) return '"abc-123"';
      return '"value"';
  }
}

/** Render a JSON schema as flat rows */
function renderSchemaRows(schema: Record<string, any>, depth = 0): { key: string; type: string; depth: number }[] {
  const rows: { key: string; type: string; depth: number }[] = [];
  if (!schema) return rows;

  const props = schema.properties || (schema.type === "object" ? {} : null);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      const v = val as any;
      const type = v.type || "any";
      rows.push({ key, type, depth });
      if (v.properties) {
        rows.push(...renderSchemaRows(v, depth + 1));
      }
      if (v.items?.properties) {
        rows.push(...renderSchemaRows(v.items, depth + 1));
      }
    }
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CLI Typewriter Hook
 * ═══════════════════════════════════════════════════════════════════════════ */

function useTypewriter(text: string, speed = 40, startDelay = 600) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const startTimer = setTimeout(() => {
      const tick = () => {
        if (i < text.length) {
          i++;
          setDisplayed(text.slice(0, i));
          timer = setTimeout(tick, speed);
        } else {
          setDone(true);
        }
      };
      tick();
    }, startDelay);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(timer);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Component
 * ═══════════════════════════════════════════════════════════════════════════ */

interface CommandCardModalProps {
  command: CommandDefinition;
  isOpen: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** e.g. "3 / 12" */
  position?: string;
}

export function CommandCardModal({ command, isOpen, onClose, onPrev, onNext, position }: CommandCardModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const llm = useLLM();
  const { agents, channels, groups } = useWorkspaceContext();

  const color = useMemo(() => getCommandColor(command.tags), [command.tags]);
  const initials = useMemo(() => getInitials(command.id), [command.id]);
  const errors = useMemo(() => getCommandErrors(command.id), [command.id]);
  const args = useMemo(() => Object.values(command.args), [command.args]);
  const requiredArgs = useMemo(() => args.filter((a) => a.required !== false && a.name !== "items"), [args]);
  const optionalArgs = useMemo(() => args.filter((a) => a.required === false || a.name === "items"), [args]);

  // Schema rows for output
  const schemaRows = useMemo(
    () => (command.outputSchema ? renderSchemaRows(command.outputSchema) : []),
    [command.outputSchema],
  );

  // AI model info
  const modelId = command.usesAI
    ? command.recommendedModel
      ? llm.getCommandModel(command.id, command.recommendedModel)
      : llm.getCommandModel(command.id)
    : null;
  const modelInfo = modelId ? llm.getModelById(modelId) : null;
  const recommendedInfo = command.recommendedModel ? llm.getModelById(command.recommendedModel) : null;
  const hasOverride = command.usesAI && llm.commandModels[command.id];

  // Build CLI example string
  const buildCliString = useCallback(() => {
    let cli = `/${command.id}`;
    for (const arg of requiredArgs) {
      const ex = getExampleValue(arg, agents, channels, groups);
      cli += ` --${arg.name} ${ex}`;
    }
    return cli;
  }, [command.id, requiredArgs, agents, channels, groups]);

  const cliString = useMemo(() => buildCliString(), [buildCliString]);
  const { displayed: typedCli, done: cliDone } = useTypewriter(cliString);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onClose]);

  // Mouse-reactive header glow: intensity increases with distance from card center
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1.5);
    // Map distance 0→0.05, 1.5→0.4
    const intensity = 0.05 + dist * 0.23;
    card.style.setProperty('--ccm-glow-intensity', String(intensity.toFixed(3)));
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Glow: hold current intensity (don't reset)
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="tc-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === backdropRef.current) onClose();
      }}
    >
      {/* ═══ Nav Arrows ═══ */}
      {onPrev && (
        <button
          className="ccm-nav ccm-nav--prev"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous command"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {onNext && (
        <button
          className="ccm-nav ccm-nav--next"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next command"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div
        ref={cardRef}
        className="tc-card ccm-card"
        style={{ "--tc-accent": color } as React.CSSProperties}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Close */}
        <button className="tc-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* Glow */}
        <div
          className="tc-glow"
          style={{
            background: `linear-gradient(135deg, ${color}40, transparent 60%, ${color}20)`,
          }}
        />

        {/* ═══ Identity Header ═══ */}
        <div className="ccm-identity">
          <div className="ccm-placard" style={{ background: `linear-gradient(145deg, ${color}22 0%, ${color}10 100%)`, color, borderColor: `${color}40` }}>
            {command.icon ? (
              <img src={command.icon} alt="" className="ccm-icon-img" />
            ) : (
              initials
            )}
          </div>
          <h2 className="tc-name ccm-name">
            <span style={{ color: `${color}90` }}>/</span>
            {command.id}
          </h2>
          <p className="ccm-description">{command.description}</p>

          {/* Tags + RBAC */}
          <div className="ccm-chips">
            {command.tags.map((tag) => (
              <span
                key={tag}
                className="ccm-chip"
                style={{ background: `${color}12`, borderColor: `${color}20`, color }}
              >
                #{tag}
              </span>
            ))}
            {command.rbac.map((role) => (
              <span key={role} className="ccm-chip ccm-chip--rbac">
                <Shield size={8} />
                {role}
              </span>
            ))}
          </div>

          {/* AI badge inline */}
          {command.usesAI && modelInfo && (
            <div className="ccm-ai-inline" style={{ borderColor: `${color}25` }}>
              <Sparkles size={12} style={{ color: "#c084fc" }} />
              <span className="ccm-ai-label">{modelInfo.label}</span>
            </div>
          )}
        </div>

        {/* ═══ Parameters Section ═══ */}
        {args.length > 0 && (
          <div className="ccm-section">
            <div className="tc-section-label">
              <Layers size={10} />
              Parameters
            </div>

            {/* Required args */}
            {requiredArgs.length > 0 && (
              <div className="ccm-params">
                {requiredArgs.map((arg) => {
                  const Icon = ARG_TYPE_ICON[arg.type] || Type;
                  const example = getExampleValue(arg, agents, channels, groups);
                  return (
                    <div key={arg.name} className="ccm-param">
                      <div className="ccm-param__header">
                        <Icon size={11} style={{ color, flexShrink: 0 }} />
                        <span className="ccm-param__name">{arg.name}</span>
                        <span className="ccm-param__required">required</span>
                        <code className="ccm-param__type">{arg.type}</code>
                      </div>
                      <div className="ccm-param__desc">{arg.description}</div>
                      {arg.enum && arg.enum.length > 0 && (
                        <div className="ccm-param__enum">
                          {arg.enum.map((v) => (
                            <code key={v} className="ccm-param__enum-val">{v}</code>
                          ))}
                        </div>
                      )}
                      <div className="ccm-param__example">
                        <span className="ccm-param__example-label">example:</span>
                        <code>{example}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Optional args */}
            {optionalArgs.length > 0 && (
              <>
                <div className="ccm-optional-divider">Optional</div>
                <div className="ccm-params ccm-params--optional">
                  {optionalArgs.map((arg) => {
                    const Icon = ARG_TYPE_ICON[arg.type] || Type;
                    return (
                      <div key={arg.name} className="ccm-param ccm-param--optional">
                        <div className="ccm-param__header">
                          <Icon size={11} style={{ color: `${color}80`, flexShrink: 0 }} />
                          <span className="ccm-param__name">{arg.name}</span>
                          <code className="ccm-param__type">{arg.type}</code>
                        </div>
                        <div className="ccm-param__desc">{arg.description}</div>
                        {arg.defaultValue !== undefined && arg.defaultValue !== 0 && (
                          <div className="ccm-param__default">
                            default: <code>{String(arg.defaultValue)}</code>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Output Schema Section ═══ */}
        <div className="ccm-section">
          <div className="tc-section-label">
            <Braces size={10} />
            Output
          </div>
          <div className="ccm-output-desc">{command.output}</div>
          {schemaRows.length > 0 && (
            <div className="ccm-schema">
              {schemaRows.map((row, i) => (
                <div
                  key={`${row.key}-${i}`}
                  className="ccm-schema__row"
                  style={{ paddingLeft: `${12 + row.depth * 14}px` }}
                >
                  {row.depth > 0 && (
                    <ChevronRight size={8} className="ccm-schema__indent" />
                  )}
                  <span className="ccm-schema__key">{row.key}</span>
                  <code className="ccm-schema__type">{row.type}</code>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ Potential Errors Section ═══ */}
        {errors.length > 0 && (
          <div className="ccm-section">
            <div className="tc-section-label ccm-section-label--error">
              <AlertTriangle size={10} />
              Potential Errors
            </div>
            <div className="ccm-errors">
              {errors.map((err, i) => (
                <div key={i} className="ccm-error">
                  <code className="ccm-error__msg">{err.message}</code>
                  <span className="ccm-error__cause">{err.cause}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ AI Models Section ═══ */}
        {command.usesAI && (
          <div className="ccm-section">
            <div className="tc-section-label ccm-section-label--ai">
              <Sparkles size={10} />
              AI Configuration
            </div>
            <div className="ccm-ai-grid">
              {/* Active model */}
              <div className="ccm-ai-row ccm-ai-row--active">
                <span className="ccm-ai-row__label">Active Model</span>
                <span className="ccm-ai-row__value" style={{ color }}>
                  {modelInfo?.label || modelId || "—"}
                </span>
              </div>

              {/* Recommended */}
              {recommendedInfo && (
                <div className="ccm-ai-row">
                  <span className="ccm-ai-row__label">Recommended</span>
                  <span className="ccm-ai-row__value">{recommendedInfo.label}</span>
                </div>
              )}

              {/* Workspace override */}
              {hasOverride && (
                <div className="ccm-ai-row">
                  <span className="ccm-ai-row__label">Override</span>
                  <span className="ccm-ai-row__value">
                    {llm.getModelById(llm.commandModels[command.id])?.label || llm.commandModels[command.id]}
                  </span>
                </div>
              )}

              {/* Global fallback */}
              <div className="ccm-ai-row">
                <span className="ccm-ai-row__label">Global Default</span>
                <span className="ccm-ai-row__value">
                  {llm.getModelById(llm.globalModel)?.label || llm.globalModel}
                </span>
              </div>

              {/* Provider */}
              {modelInfo && (
                <div className="ccm-ai-row">
                  <span className="ccm-ai-row__label">Provider</span>
                  <span className="ccm-ai-row__value" style={{ textTransform: "capitalize" }}>
                    {modelInfo.provider}
                  </span>
                </div>
              )}
            </div>

            {/* Available models list */}
            <div className="ccm-models-list">
              <div className="ccm-models-label">Available Models</div>
              <div className="ccm-models-chips">
                {llm.allModels.map((m) => (
                  <span
                    key={m.id}
                    className={`ccm-model-chip${m.id === modelId ? " ccm-model-chip--active" : ""}`}
                    style={m.id === modelId ? { borderColor: `${color}50`, color } : undefined}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Live CLI Animation ═══ */}
        <div className="ccm-section ccm-cli-section">
          <div className="tc-section-label">
            <Terminal size={10} />
            Console
          </div>
          <div className="ccm-cli">
            <div className="ccm-cli__prompt">
              <span className="ccm-cli__chevron" style={{ color }}>❯</span>
              <span className="ccm-cli__text">
                {typedCli}
                {!cliDone && <span className="ccm-cli__cursor" style={{ borderColor: color }}>|</span>}
              </span>
            </div>
            {cliDone && (
              <div className="ccm-cli__output">
                <span className="ccm-cli__status" style={{ color }}>✓</span>
                <span>Ready to execute</span>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Footer ═══ */}
        <div className="tc-footer">
          <div className="tc-meta">
            <span className="tc-meta-item">{args.length} param{args.length !== 1 ? "s" : ""}</span>
            <span className="tc-meta-item">{command.tags.length} tag{command.tags.length !== 1 ? "s" : ""}</span>
            {errors.length > 0 && (
              <span className="tc-meta-item">{errors.length} error{errors.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          {position && (
            <span className="ccm-position">{position}</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

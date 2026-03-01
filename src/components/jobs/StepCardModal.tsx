/**
 * StepCardModal — Rich detail modal for a studio step (task).
 *
 * Styled in the trading-card family (tc-backdrop / tc-card pattern).
 * Sections: identity · configured args · input bindings · output mappings ·
 *           conditions · model override.
 * Arrow navigation to browse steps sequentially.
 */

import { useRef, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Cpu,
  Shield,
  Layers,
  Type,
  Hash,
  ToggleLeft,
  Box,
  List,
  Users,
  Radio,
  Network,
  Globe,
  Link,
  ArrowRightLeft,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Database,
  Package,
  Tag,
} from "lucide-react";
import { registry } from "../../services/commands/registry";
import { useLLM } from "../../context/LLMContext";
import type { StudioStep } from "../views/StudioView";
import type { CommandArgType } from "../../services/commands/types";
import "../../styles/components/step-card-modal.css";

/* ═══════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

const getStepColor = (tags: string[]): string => {
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

/** Icon component for an arg type */
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

/* ═══════════════════════════════════════════════════════════════════════════
 * Component
 * ═══════════════════════════════════════════════════════════════════════════ */

interface StepCardModalProps {
  step: StudioStep;
  stepIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** e.g. "3 / 12" */
  position?: string;
}

export function StepCardModal({
  step,
  stepIndex,
  isOpen,
  onClose,
  onPrev,
  onNext,
  position,
}: StepCardModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const llm = useLLM();

  const cmd = useMemo(() => registry.get(step.commandId), [step.commandId]);
  const color = useMemo(() => getStepColor(cmd?.tags ?? []), [cmd]);
  const initials = useMemo(() => getInitials(step.commandId), [step.commandId]);

  // ── Args analysis ──
  const allArgs = useMemo(() => (cmd ? Object.entries(cmd.args) : []), [cmd]);
  const filledArgs = useMemo(
    () =>
      allArgs.filter(
        ([key]) => {
          const v = step.args[key];
          return v !== null && v !== "" && v !== undefined;
        },
      ),
    [allArgs, step.args],
  );
  const boundArgs = useMemo(
    () =>
      Object.entries(step.inputBindings).filter(([, b]) => b.sourceKey),
    [step.inputBindings],
  );
  const emptyArgs = useMemo(
    () =>
      allArgs.filter(([key]) => {
        const v = step.args[key];
        const isBound = step.inputBindings[key]?.sourceKey;
        return !isBound && (v === null || v === "" || v === undefined);
      }),
    [allArgs, step.args, step.inputBindings],
  );

  // ── Model info ──
  const modelId = step.modelId || (cmd?.usesAI ? llm.getCommandModel(step.commandId) : null);
  const modelInfo = modelId ? llm.getModelById(modelId) : null;

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onClose]);

  // ── Mouse-reactive glow ──
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1.5);
    const intensity = 0.05 + dist * 0.23;
    card.style.setProperty("--scm-glow-intensity", String(intensity.toFixed(3)));
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
          className="scm-nav scm-nav--prev"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous step"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {onNext && (
        <button
          className="scm-nav scm-nav--next"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next step"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div
        ref={cardRef}
        className="tc-card scm-card"
        style={{ "--tc-accent": color } as React.CSSProperties}
        onMouseMove={handleMouseMove}
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
        <div className="scm-identity">
          <div className="scm-step-number" style={{ color }}>
            Step {stepIndex + 1}
          </div>
          <div
            className="scm-placard"
            style={{
              background: `linear-gradient(145deg, ${color}22 0%, ${color}10 100%)`,
              color,
              borderColor: `${color}40`,
            }}
          >
            {initials}
          </div>
          <h2 className="tc-name scm-name">
            <span style={{ color: `${color}90` }}>/</span>
            {step.commandId}
          </h2>
          {cmd && <p className="scm-description">{cmd.description}</p>}

          {/* Tags */}
          {cmd && cmd.tags.length > 0 && (
            <div className="scm-chips">
              {cmd.tags.map((tag) => (
                <span
                  key={tag}
                  className="scm-chip"
                  style={{ background: `${color}12`, borderColor: `${color}20`, color }}
                >
                  #{tag}
                </span>
              ))}
              {cmd.rbac.map((role) => (
                <span key={role} className="scm-chip scm-chip--rbac">
                  <Shield size={8} />
                  {role}
                </span>
              ))}
            </div>
          )}

          {/* Flow type badge */}
          <div className="scm-flow-badge" style={{ borderColor: `${color}25` }}>
            <GitBranch size={12} style={{ color }} />
            <span>{step.flowType}</span>
          </div>
        </div>

        {/* ═══ Configured Args Section ═══ */}
        {allArgs.length > 0 && (
          <div className="scm-section">
            <div className="tc-section-label">
              <Layers size={10} />
              Arguments
              <span className="scm-section-count">
                {filledArgs.length + boundArgs.length}/{allArgs.length}
              </span>
            </div>

            {/* Filled args */}
            {filledArgs.length > 0 && (
              <div className="scm-params">
                {filledArgs.map(([key, def]) => {
                  const Icon = ARG_TYPE_ICON[def.type] || Type;
                  const val = step.args[key];
                  const isBound = step.inputBindings[key]?.sourceKey;
                  if (isBound) return null; // shown in bindings
                  return (
                    <div key={key} className="scm-param scm-param--filled">
                      <div className="scm-param__header">
                        <Icon size={11} style={{ color, flexShrink: 0 }} />
                        <span className="scm-param__name">{def.name}</span>
                        <code className="scm-param__type">{def.type}</code>
                        <CheckCircle2 size={10} className="scm-param__status scm-param__status--ok" />
                      </div>
                      <div className="scm-param__value">
                        {typeof val === "object" ? JSON.stringify(val) : String(val)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bound args */}
            {boundArgs.length > 0 && (
              <>
                <div className="scm-divider">Bound Inputs</div>
                <div className="scm-params">
                  {boundArgs.map(([key, binding]) => {
                    const def = cmd?.args[key];
                    const Icon = def ? (ARG_TYPE_ICON[def.type] || Type) : Link;
                    return (
                      <div key={key} className="scm-param scm-param--bound">
                        <div className="scm-param__header">
                          <Icon size={11} style={{ color: "#38bdf8", flexShrink: 0 }} />
                          <span className="scm-param__name">{def?.name || key}</span>
                          <code className="scm-param__type">{def?.type || "any"}</code>
                          <Link size={10} className="scm-param__status scm-param__status--bound" />
                        </div>
                        <div className="scm-param__binding">
                          <span className={`scm-binding-source scm-binding-source--${binding.source}`}>
                            {binding.source === "storage" && <Database size={9} />}
                            {binding.source === "deliverable" && <Package size={9} />}
                            {binding.source === "input" && <Tag size={9} />}
                            {binding.source}
                          </span>
                          <span className="scm-binding-arrow">→</span>
                          <span className="scm-binding-key">{binding.sourceKey}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Empty args */}
            {emptyArgs.length > 0 && (
              <>
                <div className="scm-divider">Unconfigured</div>
                <div className="scm-params scm-params--empty">
                  {emptyArgs.map(([key, def]) => {
                    const Icon = ARG_TYPE_ICON[def.type] || Type;
                    return (
                      <div key={key} className="scm-param scm-param--empty">
                        <div className="scm-param__header">
                          <Icon size={11} style={{ color: "var(--text-ghost)", flexShrink: 0 }} />
                          <span className="scm-param__name">{def.name}</span>
                          <code className="scm-param__type">{def.type}</code>
                          {def.required !== false && (
                            <AlertCircle size={10} className="scm-param__status scm-param__status--missing" />
                          )}
                        </div>
                        <div className="scm-param__desc">{def.description}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Output Mappings Section ═══ */}
        {step.outputMappings.length > 0 && (
          <div className="scm-section">
            <div className="tc-section-label">
              <ArrowRightLeft size={10} />
              Output Mappings
              <span className="scm-section-count">{step.outputMappings.length}</span>
            </div>
            <div className="scm-outputs">
              {step.outputMappings.map((m, i) => (
                <div key={i} className={`scm-output scm-output--${m.target}`}>
                  <span className="scm-output__key">
                    {m.outputKey === "*" ? "all outputs" : m.outputKey}
                  </span>
                  <span className="scm-output__arrow">→</span>
                  <span className={`scm-output__target scm-output__target--${m.target}`}>
                    {m.target === "storage" && <Database size={9} />}
                    {m.target === "deliverable" && <Package size={9} />}
                    {m.targetKey || "?"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Conditions Section ═══ */}
        {(step.preCondition || step.postCondition) && (
          <div className="scm-section">
            <div className="tc-section-label">
              <Shield size={10} />
              Conditions
            </div>
            <div className="scm-conditions">
              {step.preCondition && (
                <div className="scm-condition">
                  <span className="scm-condition__label scm-condition__label--pre">Pre</span>
                  <code className="scm-condition__expr">{step.preCondition}</code>
                </div>
              )}
              {step.postCondition && (
                <div className="scm-condition">
                  <span className="scm-condition__label scm-condition__label--post">Post</span>
                  <code className="scm-condition__expr">{step.postCondition}</code>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ AI / Model Section ═══ */}
        {(cmd?.usesAI || step.modelId) && (
          <div className="scm-section">
            <div className="tc-section-label scm-section-label--ai">
              <Sparkles size={10} />
              AI Configuration
            </div>
            <div className="scm-ai-grid">
              <div className="scm-ai-row scm-ai-row--active">
                <span className="scm-ai-row__label">Active Model</span>
                <span className="scm-ai-row__value" style={{ color }}>
                  {modelInfo?.label || modelId || "—"}
                </span>
              </div>
              {step.modelId && (
                <div className="scm-ai-row">
                  <span className="scm-ai-row__label">Step Override</span>
                  <span className="scm-ai-row__value">{step.modelId}</span>
                </div>
              )}
              {modelInfo && (
                <div className="scm-ai-row">
                  <span className="scm-ai-row__label">Provider</span>
                  <span className="scm-ai-row__value" style={{ textTransform: "capitalize" }}>
                    {modelInfo.provider}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Footer ═══ */}
        <div className="tc-footer">
          <div className="tc-meta">
            <span className="tc-meta-item">
              {filledArgs.length + boundArgs.length}/{allArgs.length} args
            </span>
            {step.outputMappings.length > 0 && (
              <span className="tc-meta-item">
                {step.outputMappings.length} output{step.outputMappings.length !== 1 ? "s" : ""}
              </span>
            )}
            {cmd && (
              <span className="tc-meta-item">{cmd.tags?.[0] || "cmd"}</span>
            )}
          </div>
          {position && <span className="scm-position">{position}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

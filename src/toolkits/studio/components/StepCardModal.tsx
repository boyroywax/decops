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
  Unlink,
  ArrowRightLeft,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Database,
  Package,
  Tag,
  Plus,
} from "lucide-react";
import { registry } from "@/services/commands/registry";
import { useLLM } from "@/context/LLMContext";
import { CommandArgInput } from "@/components/automations/CommandArgInput";
import type { StudioStep, OutputMapping, InputBinding } from "@/toolkits/studio/components/StudioView";
import type { LLMModel } from "@/context/LLMContext";
import type { CommandArgType } from "@/services/commands/types";
import type { JobDeliverable, EntityInput, StepHandler } from "@/types";
import "../styles/step-card-modal.css";

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
  /* ── Edit callbacks ── */
  onUpdateArg?: (stepId: string, argName: string, value: unknown) => void;
  onUpdatePreCondition?: (stepId: string, condition: string) => void;
  onUpdatePostCondition?: (stepId: string, condition: string) => void;
  onUpdateOutputMappings?: (stepId: string, mappings: OutputMapping[]) => void;
  onUpdateInputBindings?: (stepId: string, bindings: Record<string, InputBinding>) => void;
  onUpdateStepModel?: (stepId: string, modelId: string | undefined) => void;
  onUpdateStepOnSuccess?: (stepId: string, handler: StepHandler | undefined) => void;
  onUpdateStepOnFailure?: (stepId: string, handler: StepHandler | undefined) => void;
  /* ── Data for binding selectors ── */
  deliverables?: JobDeliverable[];
  storageEntries?: Array<{ key: string; value: string }>;
  inputs?: EntityInput[];
  allSteps?: StudioStep[];
  allModels?: LLMModel[];
}

export function StepCardModal({
  step,
  stepIndex,
  isOpen,
  onClose,
  onPrev,
  onNext,
  position,
  onUpdateArg,
  onUpdatePreCondition,
  onUpdatePostCondition,
  onUpdateOutputMappings,
  onUpdateInputBindings,
  onUpdateStepModel,
  onUpdateStepOnSuccess,
  onUpdateStepOnFailure,
  deliverables = [],
  storageEntries = [],
  inputs = [],
  allSteps = [],
  allModels = [],
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

  /** True when edit callbacks are wired in */
  const editable = !!(onUpdateArg && onUpdateInputBindings && onUpdateOutputMappings);

  // ── Collect available keys for binding selectors ──
  const availStorageKeys = useMemo(() => {
    const keys = storageEntries.filter(e => e.key.trim()).map(e => e.key);
    const priorSteps = allSteps.slice(0, allSteps.findIndex(s => s.id === step.id));
    for (const ps of priorSteps) {
      for (const om of ps.outputMappings) {
        if (om.targetKey && om.target === "storage" && !keys.includes(om.targetKey)) keys.push(om.targetKey);
      }
    }
    return keys;
  }, [storageEntries, allSteps, step.id]);

  const availDeliverableKeys = useMemo(() => {
    const keys = deliverables.filter(d => d.key.trim()).map(d => d.key);
    const priorSteps = allSteps.slice(0, allSteps.findIndex(s => s.id === step.id));
    for (const ps of priorSteps) {
      for (const om of ps.outputMappings) {
        if (om.targetKey && om.target === "deliverable" && !keys.includes(om.targetKey)) keys.push(om.targetKey);
      }
    }
    return keys;
  }, [deliverables, allSteps, step.id]);

  const availInputKeys = useMemo(
    () => inputs.filter(inp => inp.name.trim()).map(inp => inp.name),
    [inputs],
  );

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
            <span>{step.parentId ? "child" : "root"}</span>
          </div>
        </div>

        {/* ═══ Arguments Section (editable when callbacks present) ═══ */}
        {allArgs.length > 0 && (
          <div className="scm-section">
            <div className="tc-section-label">
              <Layers size={10} />
              Arguments
              <span className="scm-section-count">
                {filledArgs.length + boundArgs.length}/{allArgs.length}
              </span>
            </div>

            {editable ? (
              /* ── Editable: all args inline ── */
              <div className="scm-params">
                {allArgs.map(([key, def]) => {
                  const Icon = ARG_TYPE_ICON[def.type] || Type;
                  const binding = step.inputBindings[key];
                  const isBound = !!binding;

                  return (
                    <div key={key} className={`scm-param ${isBound ? "scm-param--bound" : step.args[key] != null && step.args[key] !== "" ? "scm-param--filled" : "scm-param--empty"}`}>
                      <div className="scm-param__header">
                        <Icon size={11} style={{ color: isBound ? "#38bdf8" : color, flexShrink: 0 }} />
                        <span className="scm-param__name">
                          {def.name}
                          {def.required !== false && <span style={{ color: "#ef4444" }}> *</span>}
                        </span>
                        <code className="scm-param__type">{def.type}</code>
                        <button
                          className={`scm-bind-toggle ${isBound ? "scm-bind-toggle--active" : ""}`}
                          onClick={() => {
                            const updated = { ...step.inputBindings };
                            if (isBound) {
                              delete updated[key];
                            } else {
                              updated[key] = { source: "storage", sourceKey: "" };
                            }
                            onUpdateInputBindings!(step.id, updated);
                          }}
                          title={isBound ? "Unbind — switch to manual entry" : "Bind from storage / deliverable / input"}
                        >
                          {isBound ? <Link size={10} /> : <Unlink size={10} />}
                        </button>
                      </div>

                      {isBound ? (
                        <div className="scm-param__binding-edit">
                          <select
                            className="scm-edit-select"
                            value={binding.source}
                            onChange={(e) => {
                              const updated = { ...step.inputBindings };
                              updated[key] = { ...binding, source: e.target.value as "storage" | "deliverable" | "input", sourceKey: "" };
                              onUpdateInputBindings!(step.id, updated);
                            }}
                          >
                            <option value="storage">Storage</option>
                            <option value="deliverable">Deliverable</option>
                            <option value="input">Input</option>
                          </select>
                          <span className="scm-binding-arrow">←</span>
                          <select
                            className="scm-edit-select scm-edit-select--grow"
                            value={binding.sourceKey}
                            onChange={(e) => {
                              const updated = { ...step.inputBindings };
                              updated[key] = { ...binding, sourceKey: e.target.value };
                              onUpdateInputBindings!(step.id, updated);
                            }}
                          >
                            <option value="">— select key —</option>
                            {(binding.source === "storage" ? availStorageKeys : binding.source === "deliverable" ? availDeliverableKeys : availInputKeys)
                              .map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="scm-param__input-wrap">
                          <CommandArgInput
                            arg={def}
                            value={step.args[key]}
                            onChange={(val) => onUpdateArg!(step.id, key, val)}
                          />
                        </div>
                      )}
                      {def.description && <div className="scm-param__desc">{def.description}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Read-only: original grouped display ── */
              <>
                {/* Filled args */}
                {filledArgs.length > 0 && (
                  <div className="scm-params">
                    {filledArgs.map(([key, def]) => {
                      const Icon = ARG_TYPE_ICON[def.type] || Type;
                      const val = step.args[key];
                      const isBound = step.inputBindings[key]?.sourceKey;
                      if (isBound) return null;
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
              </>
            )}
          </div>
        )}

        {/* ═══ Output Mappings Section ═══ */}
        {(step.outputMappings.length > 0 || editable) && (
          <div className="scm-section">
            <div className="tc-section-label">
              <ArrowRightLeft size={10} />
              Output Mappings
              <span className="scm-section-count">{step.outputMappings.length}</span>
            </div>

            {editable ? (
              <div className="scm-outputs">
                {step.outputMappings.map((m, i) => {
                  const outputKeys = cmd?.outputSchema?.properties
                    ? ["*", ...Object.keys(cmd.outputSchema.properties as Record<string, any>)]
                    : ["*"];
                  return (
                    <div key={i} className={`scm-output scm-output--${m.target} scm-output--edit`}>
                      <select
                        className="scm-edit-select scm-edit-select--sm"
                        value={m.outputKey}
                        onChange={(e) => {
                          const updated = [...step.outputMappings];
                          updated[i] = { ...updated[i], outputKey: e.target.value };
                          onUpdateOutputMappings!(step.id, updated);
                        }}
                      >
                        <option value="">— output —</option>
                        {outputKeys.map(k => <option key={k} value={k}>{k === "*" ? "* (entire)" : k}</option>)}
                      </select>
                      <span className="scm-output__arrow">→</span>
                      <select
                        className="scm-edit-select scm-edit-select--sm"
                        value={m.target}
                        onChange={(e) => {
                          const updated = [...step.outputMappings];
                          updated[i] = { ...updated[i], target: e.target.value as "storage" | "deliverable", targetKey: "" };
                          onUpdateOutputMappings!(step.id, updated);
                        }}
                      >
                        <option value="storage">Storage</option>
                        <option value="deliverable">Deliverable</option>
                      </select>
                      <select
                        className="scm-edit-select scm-edit-select--sm scm-edit-select--grow"
                        value={m.targetKey}
                        onChange={(e) => {
                          const updated = [...step.outputMappings];
                          updated[i] = { ...updated[i], targetKey: e.target.value };
                          onUpdateOutputMappings!(step.id, updated);
                        }}
                      >
                        <option value="">— key —</option>
                        {(m.target === "storage" ? availStorageKeys : availDeliverableKeys)
                          .map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button
                        className="scm-output__remove"
                        onClick={() => {
                          const updated = step.outputMappings.filter((_, idx) => idx !== i);
                          onUpdateOutputMappings!(step.id, updated);
                        }}
                        title="Remove mapping"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
                <button
                  className="scm-add-btn"
                  onClick={() => {
                    const updated: OutputMapping[] = [
                      ...step.outputMappings,
                      { outputKey: "*", target: "storage", targetKey: "" },
                    ];
                    onUpdateOutputMappings!(step.id, updated);
                  }}
                >
                  <Plus size={10} /> Add Mapping
                </button>
              </div>
            ) : (
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
            )}
          </div>
        )}

        {/* ═══ Conditions Section ═══ */}
        {(step.preCondition || step.postCondition || editable) && (
          <div className="scm-section">
            <div className="tc-section-label">
              <Shield size={10} />
              Conditions
            </div>

            {editable ? (
              <div className="scm-conditions scm-conditions--edit">
                <div className="scm-condition">
                  <span className="scm-condition__label scm-condition__label--pre">Pre</span>
                  <input
                    type="text"
                    className="scm-edit-input"
                    value={step.preCondition || ""}
                    onChange={(e) => onUpdatePreCondition?.(step.id, e.target.value)}
                    placeholder="e.g. steps[0].result === 'success'"
                  />
                </div>
                <div className="scm-condition">
                  <span className="scm-condition__label scm-condition__label--post">Post</span>
                  <input
                    type="text"
                    className="scm-edit-input"
                    value={step.postCondition || ""}
                    onChange={(e) => onUpdatePostCondition?.(step.id, e.target.value)}
                    placeholder="e.g. result.status === 'ok'"
                  />
                </div>
              </div>
            ) : (
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
            )}
          </div>
        )}

        {/* ═══ Step Handlers (onSuccess / onFailure) ═══ */}
        {(step.onSuccess || step.onFailure || editable) && (
          <div className="scm-section">
            <div className="tc-section-label">
              <GitBranch size={10} />
              Step Handlers
              <span className="scm-section-count">
                {(step.onSuccess ? 1 : 0) + (step.onFailure ? 1 : 0)}/2
              </span>
            </div>

            {editable && onUpdateStepOnSuccess && onUpdateStepOnFailure ? (
              <div className="scm-handlers">
                {/* onSuccess */}
                <div className={`scm-handler ${step.onSuccess ? "scm-handler--active" : ""}`}>
                  <div className="scm-handler__header">
                    <CheckCircle2 size={11} style={{ color: "#22c55e" }} />
                    <span className="scm-handler__label">On Success</span>
                    <button
                      className={`scm-bind-toggle ${step.onSuccess ? "scm-bind-toggle--active" : ""}`}
                      onClick={() => onUpdateStepOnSuccess(step.id, step.onSuccess ? undefined : { log: "" })}
                      title={step.onSuccess ? "Remove onSuccess handler" : "Add onSuccess handler"}
                    >
                      {step.onSuccess ? <X size={10} /> : <Plus size={10} />}
                    </button>
                  </div>
                  {step.onSuccess && (
                    <div className="scm-handler__body">
                      <div className="scm-handler__field">
                        <label>Command (optional)</label>
                        <input
                          type="text"
                          className="scm-edit-input"
                          placeholder="e.g. send_message"
                          value={step.onSuccess.commandId || ""}
                          onChange={(e) => onUpdateStepOnSuccess(step.id, { ...step.onSuccess!, commandId: e.target.value || undefined })}
                        />
                      </div>
                      <div className="scm-handler__field">
                        <label>Log message</label>
                        <input
                          type="text"
                          className="scm-edit-input"
                          placeholder="e.g. Step completed successfully"
                          value={step.onSuccess.log || ""}
                          onChange={(e) => onUpdateStepOnSuccess(step.id, { ...step.onSuccess!, log: e.target.value || undefined })}
                        />
                      </div>
                      <div className="scm-handler__field">
                        <label>Set storage (JSON)</label>
                        <input
                          type="text"
                          className="scm-edit-input"
                          placeholder='e.g. {"status": "done"}'
                          value={step.onSuccess.setStorage ? JSON.stringify(step.onSuccess.setStorage) : ""}
                          onChange={(e) => {
                            let parsed: Record<string, any> | undefined;
                            try { parsed = e.target.value ? JSON.parse(e.target.value) : undefined; } catch { return; }
                            onUpdateStepOnSuccess(step.id, { ...step.onSuccess!, setStorage: parsed });
                          }}
                        />
                      </div>
                      <div className="scm-handler__field scm-handler__field--toggle">
                        <label>Halt after success</label>
                        <input
                          type="checkbox"
                          checked={step.onSuccess.haltAfterSuccess || false}
                          onChange={(e) => onUpdateStepOnSuccess(step.id, { ...step.onSuccess!, haltAfterSuccess: e.target.checked || undefined })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* onFailure */}
                <div className={`scm-handler ${step.onFailure ? "scm-handler--active" : ""}`}>
                  <div className="scm-handler__header">
                    <AlertCircle size={11} style={{ color: "#ef4444" }} />
                    <span className="scm-handler__label">On Failure</span>
                    <button
                      className={`scm-bind-toggle ${step.onFailure ? "scm-bind-toggle--active" : ""}`}
                      onClick={() => onUpdateStepOnFailure(step.id, step.onFailure ? undefined : { log: "" })}
                      title={step.onFailure ? "Remove onFailure handler" : "Add onFailure handler"}
                    >
                      {step.onFailure ? <X size={10} /> : <Plus size={10} />}
                    </button>
                  </div>
                  {step.onFailure && (
                    <div className="scm-handler__body">
                      <div className="scm-handler__field">
                        <label>Command (optional)</label>
                        <input
                          type="text"
                          className="scm-edit-input"
                          placeholder="e.g. send_message"
                          value={step.onFailure.commandId || ""}
                          onChange={(e) => onUpdateStepOnFailure(step.id, { ...step.onFailure!, commandId: e.target.value || undefined })}
                        />
                      </div>
                      <div className="scm-handler__field">
                        <label>Log message</label>
                        <input
                          type="text"
                          className="scm-edit-input"
                          placeholder="e.g. Step failed — retrying"
                          value={step.onFailure.log || ""}
                          onChange={(e) => onUpdateStepOnFailure(step.id, { ...step.onFailure!, log: e.target.value || undefined })}
                        />
                      </div>
                      <div className="scm-handler__field">
                        <label>Set storage (JSON)</label>
                        <input
                          type="text"
                          className="scm-edit-input"
                          placeholder='e.g. {"error_count": 1}'
                          value={step.onFailure.setStorage ? JSON.stringify(step.onFailure.setStorage) : ""}
                          onChange={(e) => {
                            let parsed: Record<string, any> | undefined;
                            try { parsed = e.target.value ? JSON.parse(e.target.value) : undefined; } catch { return; }
                            onUpdateStepOnFailure(step.id, { ...step.onFailure!, setStorage: parsed });
                          }}
                        />
                      </div>
                      <div className="scm-handler__field scm-handler__field--toggle">
                        <label>Continue on failure</label>
                        <input
                          type="checkbox"
                          checked={step.onFailure.continueOnFailure || false}
                          onChange={(e) => onUpdateStepOnFailure(step.id, { ...step.onFailure!, continueOnFailure: e.target.checked || undefined })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Read-only display */
              <div className="scm-handlers">
                {step.onSuccess && (
                  <div className="scm-handler scm-handler--active">
                    <div className="scm-handler__header">
                      <CheckCircle2 size={11} style={{ color: "#22c55e" }} />
                      <span className="scm-handler__label">On Success</span>
                    </div>
                    <div className="scm-handler__body scm-handler__body--readonly">
                      {step.onSuccess.commandId && <div className="scm-handler__detail">Command: <code>{step.onSuccess.commandId}</code></div>}
                      {step.onSuccess.log && <div className="scm-handler__detail">Log: {step.onSuccess.log}</div>}
                      {step.onSuccess.setStorage && <div className="scm-handler__detail">Storage: <code>{JSON.stringify(step.onSuccess.setStorage)}</code></div>}
                      {step.onSuccess.haltAfterSuccess && <div className="scm-handler__detail">Halts job after success</div>}
                    </div>
                  </div>
                )}
                {step.onFailure && (
                  <div className="scm-handler scm-handler--active">
                    <div className="scm-handler__header">
                      <AlertCircle size={11} style={{ color: "#ef4444" }} />
                      <span className="scm-handler__label">On Failure</span>
                    </div>
                    <div className="scm-handler__body scm-handler__body--readonly">
                      {step.onFailure.commandId && <div className="scm-handler__detail">Command: <code>{step.onFailure.commandId}</code></div>}
                      {step.onFailure.log && <div className="scm-handler__detail">Log: {step.onFailure.log}</div>}
                      {step.onFailure.setStorage && <div className="scm-handler__detail">Storage: <code>{JSON.stringify(step.onFailure.setStorage)}</code></div>}
                      {step.onFailure.continueOnFailure && <div className="scm-handler__detail">Continues on failure</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ AI / Model Section ═══ */}
        {(cmd?.usesAI || step.modelId || (editable && cmd)) && (
          <div className="scm-section">
            <div className="tc-section-label scm-section-label--ai">
              <Sparkles size={10} />
              AI Configuration
            </div>

            {editable && onUpdateStepModel ? (
              <div className="scm-ai-grid">
                <div className="scm-ai-row scm-ai-row--active">
                  <span className="scm-ai-row__label">Model Override</span>
                  <select
                    className="scm-edit-select"
                    value={step.modelId || ""}
                    onChange={(e) => onUpdateStepModel(step.id, e.target.value || undefined)}
                  >
                    <option value="">Use default (global)</option>
                    {(() => {
                      const grouped = new Map<string, LLMModel[]>();
                      allModels.forEach(m => {
                        const group = m.groupLabel || m.provider;
                        if (!grouped.has(group)) grouped.set(group, []);
                        grouped.get(group)!.push(m);
                      });
                      return Array.from(grouped.entries()).map(([group, models]) => (
                        <optgroup key={group} label={group}>
                          {models.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                </div>
                {modelInfo && (
                  <div className="scm-ai-row">
                    <span className="scm-ai-row__label">Provider</span>
                    <span className="scm-ai-row__value" style={{ textTransform: "capitalize" }}>
                      {modelInfo.provider}
                    </span>
                  </div>
                )}
              </div>
            ) : (
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
            )}
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

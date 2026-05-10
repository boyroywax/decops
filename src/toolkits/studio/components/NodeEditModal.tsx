/**
 * NodeEditModal — Editable modal for Storage, Input, and Deliverable nodes.
 *
 * Uses the same trading-card overlay pattern as StepCardModal.
 * Opens on double-click of a special node on the Studio canvas.
 */

import { useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Database, Tag, Package, ChevronLeft, ChevronRight } from "lucide-react";
import type { JobDeliverable, EntityInput, InputSourceKind, InputSource, ArtifactType } from "@/types";
import { useWorkspaceStore, useEcosystemStore } from "@/stores";
import { useJobsContext } from "@/context/JobsContext";
import "../styles/node-edit-modal.css";

/* ═══════════════════════════════════════════════════════════════════════════
 * Shared constants
 * ═══════════════════════════════════════════════════════════════════════════ */

const ENTITY_TYPES: EntityInput["type"][] = ["agent", "channel", "group", "network", "text", "number_range", "list"];
const SOURCE_KINDS: InputSourceKind[] = ["prompt", "storage", "hardcoded", "artifact"];
const ARTIFACT_TYPES: ArtifactType[] = ["json", "txt", "code", "image", "markdown", "yaml", "csv"];

const SOURCE_DESCRIPTIONS: Record<InputSourceKind, string> = {
    prompt: "Ask user at runtime",
    storage: "Read from a storage key",
    hardcoded: "Literal value baked in",
    artifact: "Resolve from workspace artifact",
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Props
 * ═══════════════════════════════════════════════════════════════════════════ */

interface StorageModalData {
    type: "storage";
    index: number;
    entry: { key: string; value: string };
}

interface InputModalData {
    type: "input";
    index: number;
    entry: EntityInput;
}

interface DeliverableModalData {
    type: "deliverable";
    index: number;
    entry: JobDeliverable;
}

type ModalData = StorageModalData | InputModalData | DeliverableModalData;

interface NodeEditModalProps {
    data: ModalData;
    isOpen: boolean;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    /** e.g. "Storage 2 / 3" or "Input 1 / 2" */
    position?: string;
    // Update callbacks
    onUpdateStorage?: (index: number, field: "key" | "value", val: string) => void;
    onUpdateInput?: (index: number, field: keyof EntityInput, value: any) => void;
    onUpdateDeliverable?: (index: number, field: keyof JobDeliverable, value: any) => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Component
 * ═══════════════════════════════════════════════════════════════════════════ */

export function NodeEditModal({
    data,
    isOpen,
    onClose,
    onPrev,
    onNext,
    position,
    onUpdateStorage,
    onUpdateInput,
    onUpdateDeliverable,
}: NodeEditModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // ── Keyboard ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
            if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onPrev, onNext, onClose]);

    // ── Mouse glow ──
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
        card.style.setProperty("--nem-glow-intensity", String(intensity.toFixed(3)));
    }, []);

    if (!isOpen) return null;

    // ── Color + icon per type ──
    const accentColor = data.type === "storage" ? "#06b6d4"
        : data.type === "input" ? "#f59e0b"
        : "#a855f7";

    const Icon = data.type === "storage" ? Database
        : data.type === "input" ? Tag
        : Package;

    const title = data.type === "storage" ? "Storage Entry"
        : data.type === "input" ? "Entity Input"
        : "Deliverable";

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
                    aria-label="Previous"
                >
                    <ChevronLeft size={20} />
                </button>
            )}
            {onNext && (
                <button
                    className="scm-nav scm-nav--next"
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    aria-label="Next"
                >
                    <ChevronRight size={20} />
                </button>
            )}

            <div
                ref={cardRef}
                className={`tc-card nem-card nem-card--${data.type}`}
                style={{ "--nem-accent": accentColor } as React.CSSProperties}
                onMouseMove={handleMouseMove}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="nem-header">
                    <div className="nem-header__icon" style={{ background: accentColor }}>
                        <Icon size={18} />
                    </div>
                    <div className="nem-header__info">
                        <div className="nem-header__type">{title}</div>
                        <div className="nem-header__index">
                            {position ? (
                                <span className="scm-position">{position}</span>
                            ) : (
                                <>#{data.index + 1}</>
                            )}
                        </div>
                    </div>
                    <button className="nem-close" onClick={onClose} title="Close">
                        <X size={16} />
                    </button>
                </div>

                {/* ── Body — type-specific fields ── */}
                <div className="nem-body">
                    {data.type === "storage" && (
                        <StorageFields
                            entry={data.entry}
                            index={data.index}
                            onUpdate={onUpdateStorage}
                        />
                    )}
                    {data.type === "input" && (
                        <InputFields
                            entry={data.entry}
                            index={data.index}
                            onUpdate={onUpdateInput}
                        />
                    )}
                    {data.type === "deliverable" && (
                        <DeliverableFields
                            entry={data.entry}
                            index={data.index}
                            onUpdate={onUpdateDeliverable}
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Storage fields
 * ═══════════════════════════════════════════════════════════════════════════ */

function StorageFields({
    entry,
    index,
    onUpdate,
}: {
    entry: { key: string; value: string };
    index: number;
    onUpdate?: (index: number, field: "key" | "value", val: string) => void;
}) {
    return (
        <>
            <div className="nem-field">
                <label className="nem-field__label">Key</label>
                <input
                    className="nem-field__input"
                    type="text"
                    value={entry.key}
                    onChange={(e) => onUpdate?.(index, "key", e.target.value)}
                    placeholder="storage_key"
                    autoFocus
                />
            </div>
            <div className="nem-field">
                <label className="nem-field__label">Default Value</label>
                <textarea
                    className="nem-field__textarea"
                    value={entry.value}
                    onChange={(e) => onUpdate?.(index, "value", e.target.value)}
                    placeholder="Initial value (string or JSON)"
                    rows={4}
                />
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Input fields
 * ═══════════════════════════════════════════════════════════════════════════ */

function InputFields({
    entry,
    index,
    onUpdate,
}: {
    entry: EntityInput;
    index: number;
    onUpdate?: (index: number, field: keyof EntityInput, value: any) => void;
}) {
    const { agents, channels, groups } = useWorkspaceStore();
    const networks = useEcosystemStore((s) => s.ecosystem.networks);
    const { allArtifacts } = useJobsContext();

    const sourceKind: InputSourceKind = entry.source?.kind || "hardcoded";

    const handleSourceKindChange = (kind: InputSourceKind) => {
        let newSource: InputSource;
        switch (kind) {
            case "prompt":    newSource = { kind: "prompt" }; break;
            case "storage":   newSource = { kind: "storage", storageKey: "" }; break;
            case "hardcoded": newSource = { kind: "hardcoded", value: entry.entityId }; break;
            case "artifact":  newSource = { kind: "artifact" }; break;
        }
        onUpdate?.(index, "source", newSource);
    };

    const handleSourceFieldChange = (field: string, value: string) => {
        const base = entry.source || { kind: "hardcoded" as const, value: "" };
        onUpdate?.(index, "source", { ...base, [field]: value });
    };

    // Build entity options based on selected type
    const isEntityType = ["agent", "channel", "group", "network"].includes(entry.type);
    const entityOptions = (() => {
        switch (entry.type) {
            case "agent":
                return agents.map(a => ({ value: a.id, label: `${a.name} — ${a.id.slice(0, 8)}` }));
            case "channel":
                return channels.map(ch => {
                    const from = agents.find(a => a.id === ch.from);
                    const to = agents.find(a => a.id === ch.to);
                    const label = `${from?.name || "?"} → ${to?.name || "?"} (${ch.type})`;
                    return { value: ch.id, label };
                });
            case "group":
                return groups.map(g => ({ value: g.id, label: `${g.name} — ${g.id.slice(0, 8)}` }));
            case "network":
                return networks.map(n => ({ value: n.id, label: `${n.name} — ${n.id.slice(0, 8)}` }));
            default:
                return [];
        }
    })();

    return (
        <>
            <div className="nem-field">
                <label className="nem-field__label">Name</label>
                <input
                    className="nem-field__input"
                    type="text"
                    value={entry.name}
                    onChange={(e) => onUpdate?.(index, "name", e.target.value)}
                    placeholder='e.g. "Scout"'
                    autoFocus
                />
                <span className="nem-field__hint">Referenced as <code>$input.{entry.name || "name"}</code></span>
            </div>
            <div className="nem-field">
                <label className="nem-field__label">Input Type</label>
                <select
                    className="nem-field__select"
                    value={entry.type}
                    onChange={(e) => onUpdate?.(index, "type", e.target.value)}
                >
                    <optgroup label="Workspace Entities">
                        {(["agent", "channel", "group", "network"] as const).map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Value Types">
                        <option value="text">text</option>
                        <option value="number_range">number_range</option>
                        <option value="list">list</option>
                    </optgroup>
                </select>
            </div>

            {/* ── Value field — entity picker or value-type config ── */}
            {isEntityType && (
                <div className="nem-field">
                    <label className="nem-field__label">Entity ID</label>
                    {entityOptions.length > 0 ? (
                        <select
                            className="nem-field__select"
                            value={entry.entityId}
                            onChange={(e) => onUpdate?.(index, "entityId", e.target.value)}
                        >
                            <option value="">— select {entry.type} —</option>
                            {entityOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            className="nem-field__input"
                            type="text"
                            value={entry.entityId}
                            onChange={(e) => onUpdate?.(index, "entityId", e.target.value)}
                            placeholder="Entity UUID"
                        />
                    )}
                </div>
            )}

            {entry.type === "text" && (
                <>
                    <div className="nem-field">
                        <label className="nem-field__label">Default Value</label>
                        <input
                            className="nem-field__input"
                            type="text"
                            value={entry.entityId}
                            onChange={(e) => onUpdate?.(index, "entityId", e.target.value)}
                            placeholder={entry.placeholder || "Enter text..."}
                        />
                    </div>
                    <div className="nem-field">
                        <label className="nem-field__label">Placeholder</label>
                        <input
                            className="nem-field__input"
                            type="text"
                            value={entry.placeholder || ""}
                            onChange={(e) => onUpdate?.(index, "placeholder", e.target.value)}
                            placeholder="Hint text for runtime prompt"
                        />
                    </div>
                </>
            )}

            {entry.type === "number_range" && (
                <>
                    <div className="nem-field">
                        <label className="nem-field__label">Default Value</label>
                        <input
                            className="nem-field__input"
                            type="number"
                            value={entry.entityId}
                            onChange={(e) => onUpdate?.(index, "entityId", e.target.value)}
                            min={entry.min}
                            max={entry.max}
                            step={entry.step ?? 1}
                            placeholder="Number"
                        />
                    </div>
                    <div className="nem-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                        <div>
                            <label className="nem-field__label">Min</label>
                            <input
                                className="nem-field__input"
                                type="number"
                                value={entry.min ?? ""}
                                onChange={(e) => onUpdate?.(index, "min", e.target.value ? Number(e.target.value) : undefined)}
                                placeholder="—"
                            />
                        </div>
                        <div>
                            <label className="nem-field__label">Max</label>
                            <input
                                className="nem-field__input"
                                type="number"
                                value={entry.max ?? ""}
                                onChange={(e) => onUpdate?.(index, "max", e.target.value ? Number(e.target.value) : undefined)}
                                placeholder="—"
                            />
                        </div>
                        <div>
                            <label className="nem-field__label">Step</label>
                            <input
                                className="nem-field__input"
                                type="number"
                                value={entry.step ?? ""}
                                onChange={(e) => onUpdate?.(index, "step", e.target.value ? Number(e.target.value) : undefined)}
                                placeholder="1"
                            />
                        </div>
                    </div>
                    <span className="nem-field__hint">Range: {entry.min ?? "—∞"} to {entry.max ?? "∞"}, step {entry.step ?? 1}</span>
                </>
            )}

            {entry.type === "list" && (
                <>
                    <div className="nem-field">
                        <label className="nem-field__label">
                            Selected {entry.multiSelect ? "Values" : "Value"}
                        </label>
                        {(entry.options?.length ?? 0) > 0 ? (
                            entry.multiSelect ? (
                                <div className="nem-list-options">
                                    {(entry.options || []).map(opt => {
                                        const selected = (entry.entityId || "").split(",").filter(Boolean);
                                        const isChecked = selected.includes(opt);
                                        return (
                                            <label key={opt} className="nem-list-option">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        const next = isChecked
                                                            ? selected.filter(s => s !== opt)
                                                            : [...selected, opt];
                                                        onUpdate?.(index, "entityId", next.join(","));
                                                    }}
                                                />
                                                <span>{opt}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : (
                                <select
                                    className="nem-field__select"
                                    value={entry.entityId}
                                    onChange={(e) => onUpdate?.(index, "entityId", e.target.value)}
                                >
                                    <option value="">— select —</option>
                                    {(entry.options || []).map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <input
                                className="nem-field__input"
                                type="text"
                                value={entry.entityId}
                                onChange={(e) => onUpdate?.(index, "entityId", e.target.value)}
                                placeholder="Define options below first"
                            />
                        )}
                    </div>
                    <div className="nem-field">
                        <label className="nem-field__label">Options (one per line)</label>
                        <textarea
                            className="nem-field__textarea"
                            value={(entry.options || []).join("\n")}
                            onChange={(e) => {
                                const items = e.target.value.split("\n");
                                onUpdate?.(index, "options", items);
                            }}
                            placeholder={"Option A\nOption B\nOption C"}
                            rows={4}
                        />
                    </div>
                    <div className="nem-field">
                        <label className="nem-list-option">
                            <input
                                type="checkbox"
                                checked={entry.multiSelect || false}
                                onChange={(e) => onUpdate?.(index, "multiSelect", e.target.checked)}
                            />
                            <span className="nem-field__label" style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 400 }}>
                                Allow multiple selections
                            </span>
                        </label>
                    </div>
                </>
            )}

            {/* ── Source configuration ── */}
            <div className="nem-section">
                <div className="nem-section__title">Resolution Source</div>
                <div className="nem-source-grid">
                    {SOURCE_KINDS.map(kind => (
                        <button
                            key={kind}
                            className={`nem-source-btn ${sourceKind === kind ? "nem-source-btn--active" : ""}`}
                            onClick={() => handleSourceKindChange(kind)}
                            title={SOURCE_DESCRIPTIONS[kind]}
                        >
                            {kind}
                        </button>
                    ))}
                </div>
                <div className="nem-source-detail">
                    {sourceKind === "prompt" && (
                        <div className="nem-field">
                            <label className="nem-field__label">Prompt Text</label>
                            <input
                                className="nem-field__input"
                                type="text"
                                value={(entry.source as any)?.promptText || ""}
                                onChange={(e) => handleSourceFieldChange("promptText", e.target.value)}
                                placeholder="Question to ask user..."
                            />
                        </div>
                    )}
                    {sourceKind === "storage" && (
                        <>
                            <div className="nem-field">
                                <label className="nem-field__label">Storage Key</label>
                                <input
                                    className="nem-field__input"
                                    type="text"
                                    value={(entry.source as any)?.storageKey || ""}
                                    onChange={(e) => handleSourceFieldChange("storageKey", e.target.value)}
                                    placeholder="key_name"
                                />
                            </div>
                            <div className="nem-field">
                                <label className="nem-field__label">Path (optional)</label>
                                <input
                                    className="nem-field__input"
                                    type="text"
                                    value={(entry.source as any)?.path || ""}
                                    onChange={(e) => handleSourceFieldChange("path", e.target.value)}
                                    placeholder="e.g. data.items[0]"
                                />
                            </div>
                        </>
                    )}
                    {sourceKind === "hardcoded" && (
                        <div className="nem-field">
                            <label className="nem-field__label">Literal Value</label>
                            <input
                                className="nem-field__input"
                                type="text"
                                value={(entry.source as any)?.value || ""}
                                onChange={(e) => handleSourceFieldChange("value", e.target.value)}
                                placeholder="Hardcoded value"
                            />
                        </div>
                    )}
                    {sourceKind === "artifact" && (
                        <>
                            <div className="nem-field">
                                <label className="nem-field__label">Artifact ID</label>
                                {allArtifacts.length > 0 ? (
                                    <select
                                        className="nem-field__select"
                                        value={(entry.source as any)?.artifactId || ""}
                                        onChange={(e) => handleSourceFieldChange("artifactId", e.target.value)}
                                    >
                                        <option value="">— select artifact —</option>
                                        {allArtifacts.map(a => (
                                            <option key={a.id} value={a.id}>
                                                {a.name} ({a.type}) — {a.id.slice(0, 8)}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="nem-field__input"
                                        type="text"
                                        value={(entry.source as any)?.artifactId || ""}
                                        onChange={(e) => handleSourceFieldChange("artifactId", e.target.value)}
                                        placeholder="Specific artifact UUID"
                                    />
                                )}
                            </div>
                            <div className="nem-field">
                                <label className="nem-field__label">Tag (alternative)</label>
                                <input
                                    className="nem-field__input"
                                    type="text"
                                    value={(entry.source as any)?.tag || ""}
                                    onChange={(e) => handleSourceFieldChange("tag", e.target.value)}
                                    placeholder="Match by tag"
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Deliverable fields
 * ═══════════════════════════════════════════════════════════════════════════ */

function DeliverableFields({
    entry,
    index,
    onUpdate,
}: {
    entry: JobDeliverable;
    index: number;
    onUpdate?: (index: number, field: keyof JobDeliverable, value: any) => void;
}) {
    return (
        <>
            <div className="nem-field">
                <label className="nem-field__label">Key</label>
                <input
                    className="nem-field__input"
                    type="text"
                    value={entry.key}
                    onChange={(e) => onUpdate?.(index, "key", e.target.value)}
                    placeholder="deliverable_key"
                    autoFocus
                />
                <span className="nem-field__hint">Referenced as <code>$deliverable.{entry.key || "key"}</code></span>
            </div>
            <div className="nem-field">
                <label className="nem-field__label">Label</label>
                <input
                    className="nem-field__input"
                    type="text"
                    value={entry.label}
                    onChange={(e) => onUpdate?.(index, "label", e.target.value)}
                    placeholder="Human-readable label"
                />
            </div>
            <div className="nem-field">
                <label className="nem-field__label">Artifact Type</label>
                <select
                    className="nem-field__select"
                    value={entry.type}
                    onChange={(e) => onUpdate?.(index, "type", e.target.value as ArtifactType)}
                >
                    {ARTIFACT_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>
            <div className="nem-field">
                <label className="nem-field__label">Description</label>
                <textarea
                    className="nem-field__textarea"
                    value={entry.description || ""}
                    onChange={(e) => onUpdate?.(index, "description", e.target.value)}
                    placeholder="What this deliverable contains"
                    rows={3}
                />
            </div>
        </>
    );
}

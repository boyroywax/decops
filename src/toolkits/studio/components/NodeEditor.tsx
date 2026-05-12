import { Settings, Package, Database, Tag, ArrowRightLeft, Plus, X, Link, Unlink, Cpu } from "lucide-react";
import { registry } from "@/services/commands/registry";
import { CommandArgInput } from "@/components/automations/CommandArgInput";
import type { StudioStep, SelectedElement, OutputMapping, InputBinding } from "@/toolkits/studio/components/StudioView";
import type { JobDeliverable, ArtifactType, EntityInput } from "@/types";
import type { LLMModel } from "@/context/LLMContext";

const ARTIFACT_TYPES: ArtifactType[] = ["markdown", "json", "yaml", "csv", "image", "code", "txt"];
const ENTITY_INPUT_TYPES: EntityInput["type"][] = ["agent", "channel", "group", "network", "text", "number_range", "list"];

interface NodeEditorProps {
    selectedElement: SelectedElement;
    step: StudioStep | null;
    deliverable: JobDeliverable | null;
    deliverableIndex: number | null;
    storageEntry: { key: string; value: string } | null;
    storageIndex: number | null;
    inputEntry: EntityInput | null;
    inputIndex: number | null;
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    allSteps: StudioStep[];
    onUpdateArg: (stepId: string, argName: string, value: any) => void;
    onUpdatePreCondition: (stepId: string, condition: string) => void;
    onUpdatePostCondition: (stepId: string, condition: string) => void;
    onUpdateDeliverable: (index: number, field: keyof JobDeliverable, value: any) => void;
    onUpdateStorage: (index: number, field: "key" | "value", value: string) => void;
    onUpdateInput: (index: number, field: keyof EntityInput, value: string) => void;
    onUpdateOutputMappings: (stepId: string, mappings: OutputMapping[]) => void;
    onUpdateInputBindings: (stepId: string, bindings: Record<string, InputBinding>) => void;
    onUpdateStepModel: (stepId: string, modelId: string | undefined) => void;
    allModels: LLMModel[];
    isOpen: boolean;
    onClose: () => void;
}

export function NodeEditor({
    selectedElement, step, deliverable, deliverableIndex,
    storageEntry, storageIndex, inputEntry, inputIndex,
    deliverables, storageEntries, inputs, allSteps,
    onUpdateArg, onUpdatePreCondition, onUpdatePostCondition,
    onUpdateDeliverable, onUpdateStorage, onUpdateInput,
    onUpdateOutputMappings, onUpdateInputBindings,
    onUpdateStepModel, allModels,
    isOpen, onClose,
}: NodeEditorProps) {
    // ── Nothing selected ──
    if (!selectedElement) {
        return (
            <div className={`jm-editor-drawer${isOpen ? " jm-editor-drawer--open" : ""}`}>
                <div className="jm-editor-drawer__backdrop" onClick={onClose} />
                <div className="jm-editor">
                    <div className="jm-editor__header">
                        <Settings size={14} /> Properties
                        <button className="jm-editor__close" onClick={onClose} title="Close properties"><X size={14} /></button>
                    </div>
                    <div className="jm-editor__body">
                        <div className="jm-editor__empty">
                            <Settings size={28} className="jm-editor__empty-icon" />
                            <div className="jm-editor__empty-text">Select a step, deliverable, storage, or input node</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Input selected ──
    if (selectedElement.type === "input" && inputEntry && inputIndex !== null) {
        return (
            <div className={`jm-editor-drawer${isOpen ? " jm-editor-drawer--open" : ""}`}>
                <div className="jm-editor-drawer__backdrop" onClick={onClose} />
                <div className="jm-editor">
                <div className="jm-editor__header">
                    <Tag size={14} /> Entity Input
                    <button className="jm-editor__close" onClick={onClose} title="Close properties"><X size={14} /></button>
                </div>
                <div className="jm-editor__body">
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Name</div>
                        <input
                            type="text"
                            className="jm-editor__condition-input"
                            value={inputEntry.name}
                            onChange={(e) => onUpdateInput(inputIndex, "name", e.target.value)}
                            placeholder="e.g. researcher"
                        />
                        <div className="jm-editor__condition-hint">
                            Reference in step args as <code>$input.{inputEntry.name || "name"}</code>
                        </div>
                    </div>
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Input Type</div>
                        <select
                            className="jm-editor__condition-input"
                            value={inputEntry.type}
                            onChange={(e) => onUpdateInput(inputIndex, "type", e.target.value)}
                        >
                            {ENTITY_INPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">
                            {["agent", "channel", "group", "network"].includes(inputEntry.type) ? "Entity ID" : "Value"}
                        </div>
                        <input
                            type={inputEntry.type === "number_range" ? "number" : "text"}
                            className="jm-editor__condition-input"
                            value={inputEntry.entityId}
                            onChange={(e) => onUpdateInput(inputIndex, "entityId", e.target.value)}
                            placeholder={
                                inputEntry.type === "text" ? "Default text value"
                                : inputEntry.type === "number_range" ? "Default number"
                                : inputEntry.type === "list" ? "Selected value"
                                : "Entity ID or leave blank for runtime"
                            }
                        />
                        <div className="jm-editor__condition-hint">
                            {["agent", "channel", "group", "network"].includes(inputEntry.type)
                                ? `The ID of the ${inputEntry.type} entity this input refers to.`
                                : `Resolved as $input.${inputEntry.name || "name"} at runtime.`}
                        </div>
                    </div>
                </div>
                </div>
            </div>
        );
    }

    // ── Deliverable selected ──
    if (selectedElement.type === "deliverable" && deliverable && deliverableIndex !== null) {
        return (
            <div className={`jm-editor-drawer${isOpen ? " jm-editor-drawer--open" : ""}`}>
                <div className="jm-editor-drawer__backdrop" onClick={onClose} />
                <div className="jm-editor">
                <div className="jm-editor__header">
                    <Package size={14} /> Deliverable
                    <button className="jm-editor__close" onClick={onClose} title="Close properties"><X size={14} /></button>
                </div>
                <div className="jm-editor__body">
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Key</div>
                        <input
                            type="text"
                            className="jm-editor__condition-input"
                            value={deliverable.key}
                            onChange={(e) => onUpdateDeliverable(deliverableIndex, "key", e.target.value)}
                            placeholder="e.g. report"
                        />
                    </div>
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Label</div>
                        <input
                            type="text"
                            className="jm-editor__condition-input"
                            value={deliverable.label}
                            onChange={(e) => onUpdateDeliverable(deliverableIndex, "label", e.target.value)}
                            placeholder="e.g. Final Report"
                        />
                    </div>
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Artifact Type</div>
                        <select
                            className="jm-editor__condition-input"
                            value={deliverable.type}
                            onChange={(e) => onUpdateDeliverable(deliverableIndex, "type", e.target.value as ArtifactType)}
                        >
                            {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Description</div>
                        <input
                            type="text"
                            className="jm-editor__condition-input"
                            value={deliverable.description || ""}
                            onChange={(e) => onUpdateDeliverable(deliverableIndex, "description", e.target.value)}
                            placeholder="Optional description"
                        />
                    </div>
                </div>
                </div>
            </div>
        );
    }

    // ── Storage selected ──
    if (selectedElement.type === "storage" && storageEntry && storageIndex !== null) {
        return (
            <div className={`jm-editor-drawer${isOpen ? " jm-editor-drawer--open" : ""}`}>
                <div className="jm-editor-drawer__backdrop" onClick={onClose} />
                <div className="jm-editor">
                <div className="jm-editor__header">
                    <Database size={14} /> Shared Storage
                    <button className="jm-editor__close" onClick={onClose} title="Close properties"><X size={14} /></button>
                </div>
                <div className="jm-editor__body">
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Key</div>
                        <input
                            type="text"
                            className="jm-editor__condition-input"
                            value={storageEntry.key}
                            onChange={(e) => onUpdateStorage(storageIndex, "key", e.target.value)}
                            placeholder="e.g. shared_context"
                        />
                    </div>
                    <div className="jm-editor__section">
                        <div className="jm-editor__section-title">Default Value</div>
                        <input
                            type="text"
                            className="jm-editor__condition-input"
                            value={storageEntry.value}
                            onChange={(e) => onUpdateStorage(storageIndex, "value", e.target.value)}
                            placeholder="JSON or string value"
                        />
                        <div className="jm-editor__condition-hint">
                            Steps can read/write this key at runtime via <code>storage</code>.
                        </div>
                    </div>
                </div>
                </div>
            </div>
        );
    }

    // ── Step selected ──
    if (!step) {
        return (
            <div className={`jm-editor-drawer${isOpen ? " jm-editor-drawer--open" : ""}`}>
                <div className="jm-editor-drawer__backdrop" onClick={onClose} />
                <div className="jm-editor">
                    <div className="jm-editor__header">
                        <Settings size={14} /> Properties
                        <button className="jm-editor__close" onClick={onClose} title="Close properties"><X size={14} /></button>
                    </div>
                    <div className="jm-editor__body">
                        <div className="jm-editor__empty">
                            <Settings size={28} className="jm-editor__empty-icon" />
                            <div className="jm-editor__empty-text">Select a step to configure</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const cmd = registry.get(step.commandId);

    return (
        <div className={`jm-editor-drawer${isOpen ? " jm-editor-drawer--open" : ""}`}>
            <div className="jm-editor-drawer__backdrop" onClick={onClose} />
            <div className="jm-editor">
            <div className="jm-editor__header">
                <Settings size={14} /> Step Configuration
                <button className="jm-editor__close" onClick={onClose} title="Close properties"><X size={14} /></button>
            </div>
            <div className="jm-editor__body">
                {cmd && (
                    <>
                        <div className="jm-editor__section">
                            <div className="jm-editor__cmd-name">{cmd.id}</div>
                            <div className="jm-editor__cmd-desc">{cmd.description}</div>
                        </div>

                        {cmd.usesAI && (
                        <div className="jm-editor__section">
                            <div className="jm-editor__section-title">
                                <Cpu size={11} /> LLM Model
                            </div>
                            <select
                                className="jm-editor__model-select"
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
                            <div className="jm-editor__condition-hint">
                                Override the LLM model for this step. Leave empty to use the job or global default.
                            </div>
                        </div>
                        )}

                        <div className="jm-editor__section">
                            <div className="jm-editor__section-title">Pre-Execution Condition</div>
                            <input
                                type="text"
                                className="jm-editor__condition-input"
                                value={step.preCondition || ""}
                                onChange={(e) => onUpdatePreCondition(step.id, e.target.value)}
                                placeholder="e.g. steps[0].result === 'success'"
                            />
                            <div className="jm-editor__condition-hint">
                                Evaluated before this step runs. Step is skipped if false.
                            </div>
                        </div>

                        <div className="jm-editor__section">
                            <div className="jm-editor__section-title">Arguments</div>
                            {Object.entries(cmd.args).map(([argName, argDef]) => {
                                const binding = step.inputBindings[argName];
                                const isBound = !!binding;

                                // Collect available source keys
                                const storageKeys = storageEntries.filter(e => e.key.trim()).map(e => e.key);
                                // Collect output-mapped storage/deliverable keys from prior steps
                                const priorSteps = allSteps.slice(0, allSteps.findIndex(s => s.id === step.id));
                                for (const ps of priorSteps) {
                                    for (const om of ps.outputMappings) {
                                        if (om.targetKey && om.target === "storage" && !storageKeys.includes(om.targetKey)) {
                                            storageKeys.push(om.targetKey);
                                        }
                                    }
                                }
                                const deliverableKeys = deliverables.filter(d => d.key.trim()).map(d => d.key);
                                for (const ps of priorSteps) {
                                    for (const om of ps.outputMappings) {
                                        if (om.targetKey && om.target === "deliverable" && !deliverableKeys.includes(om.targetKey)) {
                                            deliverableKeys.push(om.targetKey);
                                        }
                                    }
                                }
                                const inputKeys = inputs.filter(inp => inp.name.trim()).map(inp => inp.name);

                                return (
                                    <div key={argName} className={`jm-editor__arg ${isBound ? "jm-editor__arg--bound" : ""}`}>
                                        <div className="jm-editor__arg-header">
                                            <label className="jm-editor__arg-label">
                                                {argDef.name}
                                                {argDef.required !== false && (
                                                    <span className="jm-editor__arg-required"> *</span>
                                                )}
                                            </label>
                                            <div className="jm-editor__arg-header-right">
                                                <button
                                                    className={`jm-editor__bind-toggle ${isBound ? "jm-editor__bind-toggle--active" : ""}`}
                                                    onClick={() => {
                                                        const updated = { ...step.inputBindings };
                                                        if (isBound) {
                                                            delete updated[argName];
                                                        } else {
                                                            updated[argName] = { source: "storage", sourceKey: "" };
                                                        }
                                                        onUpdateInputBindings(step.id, updated);
                                                    }}
                                                    title={isBound ? "Unbind – switch to manual entry" : "Bind from storage / deliverable"}
                                                >
                                                    {isBound ? <Link size={11} /> : <Unlink size={11} />}
                                                </button>
                                                <span className="jm-editor__arg-type">{argDef.type}</span>
                                            </div>
                                        </div>

                                        {isBound ? (
                                            <div className="jm-editor__arg-binding">
                                                <select
                                                    className="jm-editor__mapping-select"
                                                    value={binding.source}
                                                    onChange={(e) => {
                                                        const updated = { ...step.inputBindings };
                                                        updated[argName] = { ...binding, source: e.target.value as "storage" | "deliverable" | "input", sourceKey: "" };
                                                        onUpdateInputBindings(step.id, updated);
                                                    }}
                                                >
                                                    <option value="storage">Storage</option>
                                                    <option value="deliverable">Deliverable</option>
                                                    <option value="input">Input</option>
                                                </select>
                                                <span className="jm-editor__mapping-arrow">←</span>
                                                <select
                                                    className="jm-editor__mapping-select jm-editor__mapping-select--target"
                                                    value={binding.sourceKey}
                                                    onChange={(e) => {
                                                        const updated = { ...step.inputBindings };
                                                        updated[argName] = { ...binding, sourceKey: e.target.value };
                                                        onUpdateInputBindings(step.id, updated);
                                                    }}
                                                >
                                                    <option value="">— select key —</option>
                                                    {(binding.source === "storage" ? storageKeys : binding.source === "deliverable" ? deliverableKeys : inputKeys)
                                                        .map(k => <option key={k} value={k}>{k}</option>)}
                                                </select>
                                                <div className="jm-editor__binding-hint">
                                                    {binding.sourceKey
                                                        ? `← $${binding.source}.${binding.sourceKey}`
                                                        : "Select a source key"}
                                                </div>
                                            </div>
                                        ) : (
                                            <CommandArgInput
                                                arg={argDef}
                                                value={step.args[argName]}
                                                onChange={(val) => onUpdateArg(step.id, argName, val)}
                                            />
                                        )}
                                        {argDef.description && (
                                            <div className="jm-editor__arg-desc">{argDef.description}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="jm-editor__section">
                            <div className="jm-editor__section-title">Post-Execution Condition</div>
                            <input
                                type="text"
                                className="jm-editor__condition-input"
                                value={step.postCondition || ""}
                                onChange={(e) => onUpdatePostCondition(step.id, e.target.value)}
                                placeholder="e.g. result.status === 'ok'"
                            />
                            <div className="jm-editor__condition-hint">
                                Evaluated after step completion. Can trigger error handling.
                            </div>
                        </div>

                        {/* ── Output Mappings ── */}
                        <div className="jm-editor__section">
                            <div className="jm-editor__section-title">
                                <ArrowRightLeft size={12} style={{ marginRight: 4 }} />
                                Output Mappings
                            </div>
                            {cmd.output && (
                                <div className="jm-editor__output-desc">
                                    <strong>Output:</strong> {cmd.output}
                                </div>
                            )}
                            {(cmd.outputSchema?.properties as Record<string, unknown> | undefined) && (
                                <div className="jm-editor__output-schema">
                                    <div className="jm-editor__output-schema-label">Schema keys:</div>
                                    {Object.entries(cmd.outputSchema!.properties as Record<string, any>).map(([key, schema]) => (
                                        <div key={key} className="jm-editor__output-schema-key">
                                            <code>{key}</code>
                                            <span className="jm-editor__output-schema-type">
                                                {(schema as any)?.type || "any"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Existing mappings */}
                            {step.outputMappings.map((mapping, mi) => {
                                // Derive available output keys from schema
                                const outputKeys = cmd.outputSchema?.properties
                                    ? ["*", ...Object.keys(cmd.outputSchema.properties as Record<string, any>)]
                                    : ["*"];
                                // Available targets
                                const storageKeys = storageEntries.filter(e => e.key.trim()).map(e => e.key);
                                const deliverableKeys = deliverables.filter(d => d.key.trim()).map(d => d.key);

                                return (
                                    <div key={mi} className="jm-editor__output-mapping">
                                        <select
                                            className="jm-editor__mapping-select"
                                            value={mapping.outputKey}
                                            onChange={(e) => {
                                                const updated = [...step.outputMappings];
                                                updated[mi] = { ...updated[mi], outputKey: e.target.value };
                                                onUpdateOutputMappings(step.id, updated);
                                            }}
                                            title="Output key"
                                        >
                                            <option value="">— output —</option>
                                            {outputKeys.map(k => <option key={k} value={k}>{k === "*" ? "* (entire)" : k}</option>)}
                                        </select>

                                        <span className="jm-editor__mapping-arrow">→</span>

                                        <select
                                            className="jm-editor__mapping-select"
                                            value={mapping.target}
                                            onChange={(e) => {
                                                const updated = [...step.outputMappings];
                                                updated[mi] = { ...updated[mi], target: e.target.value as "storage" | "deliverable", targetKey: "" };
                                                onUpdateOutputMappings(step.id, updated);
                                            }}
                                            title="Target type"
                                        >
                                            <option value="storage">Storage</option>
                                            <option value="deliverable">Deliverable</option>
                                        </select>

                                        <select
                                            className="jm-editor__mapping-select jm-editor__mapping-select--target"
                                            value={mapping.targetKey}
                                            onChange={(e) => {
                                                const updated = [...step.outputMappings];
                                                updated[mi] = { ...updated[mi], targetKey: e.target.value };
                                                onUpdateOutputMappings(step.id, updated);
                                            }}
                                            title="Target key"
                                        >
                                            <option value="">— key —</option>
                                            {(mapping.target === "storage" ? storageKeys : deliverableKeys)
                                                .map(k => <option key={k} value={k}>{k}</option>)}
                                        </select>

                                        <button
                                            className="jm-editor__mapping-remove"
                                            onClick={() => {
                                                const updated = step.outputMappings.filter((_, i) => i !== mi);
                                                onUpdateOutputMappings(step.id, updated);
                                            }}
                                            title="Remove mapping"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                );
                            })}

                            <button
                                className="jm-editor__add-mapping"
                                onClick={() => {
                                    const updated: OutputMapping[] = [
                                        ...step.outputMappings,
                                        { outputKey: "*", target: "storage", targetKey: "" }
                                    ];
                                    onUpdateOutputMappings(step.id, updated);
                                }}
                            >
                                <Plus size={11} /> Add Mapping
                            </button>
                        </div>
                    </>
                )}
            </div>
            </div>
        </div>
    );
}

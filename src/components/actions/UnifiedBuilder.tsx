import { useState } from "react";
import { Plus, X, Play, Save, Settings, ArrowUp, ArrowDown, Trash2, Search, Briefcase, Clock, Zap, Package, Database, ChevronDown, ChevronRight } from "lucide-react";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { CommandArgInput } from "../automations/CommandArgInput";
import type { JobDefinition, JobStep, JobDeliverable, ArtifactType } from "../../types";
import type { DeclarativeAutomationDefinition, AutomationStep } from "../../services/automations/types";

const ARTIFACT_TYPES: ArtifactType[] = ["markdown", "json", "yaml", "csv", "image", "code"];

interface UnifiedBuilderProps {
    onRunJob: (job: JobDefinition) => void;
    onSaveAutomation: (automation: DeclarativeAutomationDefinition) => void;
    onCancel: () => void;
    initialJob?: JobDefinition | null;
    initialAutomation?: DeclarativeAutomationDefinition | null;
}

type BuilderMode = "job" | "automation";

export function UnifiedBuilder({ onRunJob, onSaveAutomation, onCancel, initialJob, initialAutomation }: UnifiedBuilderProps) {
    // General State
    const [mode, setMode] = useState<BuilderMode>(initialAutomation ? "automation" : "job");
    const [name, setName] = useState(initialJob?.name || initialAutomation?.name || "");
    const [description, setDescription] = useState(initialJob?.description || initialAutomation?.description || "");

    // Execution mode (shared across job & automation)
    const [execMode, setExecMode] = useState<"serial" | "parallel">(
        initialJob?.mode || (initialAutomation as any)?.mode || "serial"
    );

    // Automation Specific
    const [schedule, setSchedule] = useState(initialAutomation?.schedule || "");
    const [customSchedule, setCustomSchedule] = useState(false);

    // Steps
    const [steps, setSteps] = useState<any[]>((initialJob?.steps || initialAutomation?.steps || []).map(s => ({
        ...s,
        id: s.id || crypto.randomUUID(),
        args: s.args || {},
        condition: (s as any).condition || ""
    })));

    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Deliverables (shared across job & automation)
    const initDeliverables = initialJob?.deliverables || (initialAutomation as any)?.deliverables || [];
    const [deliverables, setDeliverables] = useState<JobDeliverable[]>(initDeliverables);
    const [showDeliverables, setShowDeliverables] = useState(initDeliverables.length > 0);

    // Inter-step Storage Defaults (shared across job & automation)
    const initStorage = initialJob?.storageDefaults || (initialAutomation as any)?.storageDefaults || {};
    const [storageEntries, setStorageEntries] = useState<Array<{ key: string; value: string }>>(
        Object.entries(initStorage).map(([key, value]) => ({
            key,
            value: typeof value === "string" ? value : JSON.stringify(value)
        }))
    );
    const [showStorage, setShowStorage] = useState(
        Object.keys(initStorage).length > 0
    );

    const commands = registry.getAll();
    const filteredCommands = commands.filter(c =>
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ── Step CRUD ──────────────────────────────────────────────────────────
    const addStep = (commandId: string) => {
        const command = registry.get(commandId);
        if (!command) return;

        const args: Record<string, any> = {};
        Object.entries(command.args).forEach(([key, def]) => {
            if (def.defaultValue !== undefined) args[key] = def.defaultValue;
            else if (def.type === 'boolean') args[key] = false;
            else if (def.type === 'string') args[key] = "";
            else if (def.type === 'number') args[key] = 0;
            else args[key] = null;
        });

        const newStep = {
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            commandId,
            args,
            condition: ""
        };

        setSteps(prev => [...prev, newStep]);
        setSelectedStepId(newStep.id);
    };

    const updateStepArg = (stepId: string, argName: string, value: any) => {
        setSteps(prev => prev.map(s => {
            if (s.id === stepId) {
                return { ...s, args: { ...s.args, [argName]: value } };
            }
            return s;
        }));
    };

    const updateStepCondition = (stepId: string, condition: string) => {
        setSteps(prev => prev.map(s => {
            if (s.id === stepId) {
                return { ...s, condition };
            }
            return s;
        }));
    };

    const removeStep = (id: string) => {
        setSteps(prev => prev.filter(s => s.id !== id));
        if (selectedStepId === id) setSelectedStepId(null);
    };

    const moveStep = (index: number, direction: -1 | 1) => {
        if (index + direction < 0 || index + direction >= steps.length) return;
        setSteps(prev => {
            const newSteps = [...prev];
            const temp = newSteps[index];
            newSteps[index] = newSteps[index + direction];
            newSteps[index + direction] = temp;
            return newSteps;
        });
    };

    // ── Deliverables CRUD ─────────────────────────────────────────────────
    const addDeliverable = () => {
        setDeliverables(prev => [...prev, { key: "", label: "", type: "json", description: "" }]);
        setShowDeliverables(true);
    };

    const updateDeliverable = (index: number, field: keyof JobDeliverable, value: any) => {
        setDeliverables(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
    };

    const removeDeliverable = (index: number) => {
        setDeliverables(prev => prev.filter((_, i) => i !== index));
    };

    // ── Storage CRUD ──────────────────────────────────────────────────────
    const addStorageEntry = () => {
        setStorageEntries(prev => [...prev, { key: "", value: "" }]);
        setShowStorage(true);
    };

    const updateStorageEntry = (index: number, field: "key" | "value", val: string) => {
        setStorageEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: val } : e));
    };

    const removeStorageEntry = (index: number) => {
        setStorageEntries(prev => prev.filter((_, i) => i !== index));
    };

    const buildStorageDefaults = (): Record<string, any> | undefined => {
        const entries = storageEntries.filter(e => e.key.trim());
        if (entries.length === 0) return undefined;
        const obj: Record<string, any> = {};
        entries.forEach(({ key, value }) => {
            try { obj[key] = JSON.parse(value); }
            catch { obj[key] = value; }
        });
        return obj;
    };

    // ── Submit handlers ───────────────────────────────────────────────────
    const handleRun = () => {
        if (!name.trim()) return alert("Name is required");
        if (steps.length === 0) return alert("Add at least one step");

        const validDeliverables = deliverables.filter(d => d.key.trim() && d.label.trim());

        const job: JobDefinition = {
            id: initialJob?.id || `job-def-${Date.now()}`,
            name,
            description,
            mode: execMode,
            steps: steps as JobStep[],
            deliverables: validDeliverables.length > 0 ? validDeliverables : undefined,
            storageDefaults: buildStorageDefaults(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        onRunJob(job);
    };

    const handleSaveAutomation = () => {
        if (!name.trim()) return alert("Name is required");
        if (steps.length === 0) return alert("Add at least one step");

        const validDeliverables2 = deliverables.filter(d => d.key.trim() && d.label.trim());

        const automation: DeclarativeAutomationDefinition = {
            id: initialAutomation?.id || crypto.randomUUID(),
            type: "declarative",
            name,
            description,
            schedule: schedule || undefined,
            tags: ["custom"],
            steps: steps as AutomationStep[],
            mode: execMode,
            deliverables: validDeliverables2.length > 0 ? validDeliverables2 : undefined,
            storageDefaults: buildStorageDefaults(),
        };
        onSaveAutomation(automation);
    };

    const selectedStep = steps.find(s => s.id === selectedStepId);
    const selectedCommandDef = selectedStep ? registry.get(selectedStep.commandId) : null;

    return (
        <div className="builder">
            {/* Header / Meta */}
            <div className="builder__header">
                <div className="builder__header-row">
                    <div className="builder__name-wrap">
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={mode === "job" ? "Job Name" : "Automation Name"}
                            className="builder__name-input"
                        />
                    </div>
                    <div className="builder__actions">
                        <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
                        {mode === "job" ? (
                            <button onClick={handleRun} className="btn btn-primary"><Play size={14} /> Run Job</button>
                        ) : (
                            <button onClick={handleSaveAutomation} className="btn btn-primary"><Save size={14} /> Save Automation</button>
                        )}
                    </div>
                </div>

                <div className="builder__controls">
                    {/* Mode Selector */}
                    <div className="builder__toggle-group">
                        <button
                            onClick={() => setMode("job")}
                            className={`builder__toggle-btn ${mode === "job" ? "builder__toggle-btn--active" : ""}`}
                        >
                            <Briefcase size={12} /> Run Once
                        </button>
                        <button
                            onClick={() => setMode("automation")}
                            className={`builder__toggle-btn ${mode === "automation" ? "builder__toggle-btn--active" : ""}`}
                        >
                            <Zap size={12} /> Automation
                        </button>
                    </div>

                    {/* Execution mode — available for both Job and Automation */}
                    <div className="builder__exec-group">
                        <label className="builder__exec-label">Execution:</label>
                        <div className="builder__exec-toggle">
                            <button
                                onClick={() => setExecMode("serial")}
                                className={`builder__exec-btn ${execMode === "serial" ? "builder__exec-btn--active" : ""}`}
                            >Serial</button>
                            <button
                                onClick={() => setExecMode("parallel")}
                                className={`builder__exec-btn ${execMode === "parallel" ? "builder__exec-btn--active" : ""}`}
                            >Parallel</button>
                        </div>
                    </div>

                    {mode === "automation" && (
                        <div className="builder__schedule-group">
                            <Clock size={12} className="builder__schedule-icon" />
                            {customSchedule ? (
                                <input
                                    value={schedule}
                                    onChange={e => setSchedule(e.target.value)}
                                    placeholder="e.g. every 2h, cron(0 */6 * * *)"
                                    className="builder__schedule-input"
                                    autoFocus
                                />
                            ) : (
                                <select
                                    value={schedule}
                                    onChange={e => {
                                        if (e.target.value === "__custom__") {
                                            setCustomSchedule(true);
                                            setSchedule("");
                                        } else {
                                            setSchedule(e.target.value);
                                        }
                                    }}
                                    className="builder__schedule-select"
                                >
                                    <option value="">Manual (no schedule)</option>
                                    <option value="every 1m">Every 1 minute</option>
                                    <option value="every 5m">Every 5 minutes</option>
                                    <option value="every 10m">Every 10 minutes</option>
                                    <option value="every 30m">Every 30 minutes</option>
                                    <option value="every 1h">Every 1 hour</option>
                                    <option value="every 6h">Every 6 hours</option>
                                    <option value="every 12h">Every 12 hours</option>
                                    <option value="every 24h">Every 24 hours</option>
                                    <option value="__custom__">Custom...</option>
                                </select>
                            )}
                        </div>
                    )}

                    <input
                        type="text"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="builder__desc-input"
                    />
                </div>

                {/* ── Deliverables & Storage collapsibles (both modes) ── */}
                <div className="builder__meta-sections">
                        {/* Deliverables */}
                        <div className="builder__meta-section">
                            <button
                                className="builder__meta-toggle"
                                onClick={() => setShowDeliverables(v => !v)}
                            >
                                {showDeliverables ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Package size={13} />
                                <span>Deliverables ({deliverables.length})</span>
                            </button>
                            <button className="builder__meta-add" onClick={addDeliverable} title="Add deliverable">
                                <Plus size={12} />
                            </button>
                        </div>

                        {showDeliverables && deliverables.length > 0 && (
                            <div className="builder__deliverables-list">
                                {deliverables.map((d, i) => (
                                    <div key={i} className="builder__deliverable-row">
                                        <input
                                            className="builder__kv-input builder__kv-input--key"
                                            placeholder="key"
                                            value={d.key}
                                            onChange={e => updateDeliverable(i, "key", e.target.value)}
                                        />
                                        <input
                                            className="builder__kv-input builder__kv-input--label"
                                            placeholder="Label"
                                            value={d.label}
                                            onChange={e => updateDeliverable(i, "label", e.target.value)}
                                        />
                                        <select
                                            className="builder__kv-select"
                                            value={d.type}
                                            onChange={e => updateDeliverable(i, "type", e.target.value as ArtifactType)}
                                        >
                                            {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <input
                                            className="builder__kv-input builder__kv-input--desc"
                                            placeholder="Description (optional)"
                                            value={d.description || ""}
                                            onChange={e => updateDeliverable(i, "description", e.target.value)}
                                        />
                                        <button className="builder__icon-btn builder__icon-btn--danger" onClick={() => removeDeliverable(i)}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Storage Defaults */}
                        <div className="builder__meta-section">
                            <button
                                className="builder__meta-toggle"
                                onClick={() => setShowStorage(v => !v)}
                            >
                                {showStorage ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Database size={13} />
                                <span>Shared Storage ({storageEntries.length})</span>
                            </button>
                            <button className="builder__meta-add" onClick={addStorageEntry} title="Add storage entry">
                                <Plus size={12} />
                            </button>
                        </div>

                        {showStorage && storageEntries.length > 0 && (
                            <div className="builder__storage-list">
                                {storageEntries.map((entry, i) => (
                                    <div key={i} className="builder__storage-row">
                                        <input
                                            className="builder__kv-input builder__kv-input--key"
                                            placeholder="key"
                                            value={entry.key}
                                            onChange={e => updateStorageEntry(i, "key", e.target.value)}
                                        />
                                        <input
                                            className="builder__kv-input builder__kv-input--value"
                                            placeholder="default value (JSON or string)"
                                            value={entry.value}
                                            onChange={e => updateStorageEntry(i, "value", e.target.value)}
                                        />
                                        <button className="builder__icon-btn builder__icon-btn--danger" onClick={() => removeStorageEntry(i)}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <div className="builder__storage-hint">
                                    Steps can read/write these keys at runtime via <code>storage</code>.
                                </div>
                            </div>
                        )}
                </div>
            </div>

            <div className="builder__body">
                {/* Available Commands (Left) */}
                <div className="builder__sidebar">
                    <div className="builder__search">
                        <div className="builder__search-box">
                            <Search size={12} className="builder__search-icon" />
                            <input
                                type="text"
                                placeholder="Search commands..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="builder__search-input"
                            />
                        </div>
                    </div>
                    <div className="builder__command-list">
                        {filteredCommands.map(cmd => (
                            <div
                                key={cmd.id}
                                onClick={() => addStep(cmd.id)}
                                className="builder__command"
                            >
                                <div className="builder__command-name">{cmd.id}</div>
                                <div className="builder__command-desc">
                                    {cmd.description}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Steps List (Center) */}
                <div className="builder__steps">
                    <div className="builder__panel-header">
                        Workflow Steps ({steps.length})
                    </div>
                    <div className="builder__step-list">
                        {steps.length === 0 ? (
                            <div className="builder__empty">
                                No steps added.<br />Select commands from the left.
                            </div>
                        ) : (
                            steps.map((step, idx) => (
                                <div
                                    key={step.id}
                                    onClick={() => setSelectedStepId(step.id)}
                                    className={`builder__step ${selectedStepId === step.id ? "builder__step--selected" : ""}`}
                                >
                                    <div className="builder__step-index">{idx + 1}</div>
                                    <div className="builder__step-content">
                                        <div className="builder__step-header">
                                            <div className="builder__step-name">{step.commandId}</div>
                                            {step.condition && (
                                                <div className="builder__step-badge">
                                                    Conditional
                                                </div>
                                            )}
                                        </div>
                                        <div className="builder__step-meta">{Object.keys(step.args).length} args configured</div>
                                    </div>
                                    <div className="builder__step-actions">
                                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0} className="builder__icon-btn">
                                            <ArrowUp size={12} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === steps.length - 1} className="builder__icon-btn">
                                            <ArrowDown size={12} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="builder__icon-btn builder__icon-btn--danger">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Config (Right) */}
                <div className="builder__config">
                    <div className="builder__config-header">
                        Configuration
                    </div>
                    <div className="builder__config-body">
                        {selectedStep && selectedCommandDef ? (
                            <div className="builder__config-form">
                                <div>
                                    <div className="builder__config-title">{selectedCommandDef.id}</div>
                                    <div className="builder__config-desc">{selectedCommandDef.description}</div>
                                </div>
                                <div className="builder__divider" />

                                {/* Arguments */}
                                <div className="builder__arg-list">
                                    {Object.entries(selectedCommandDef.args).map(([argName, argDef]) => (
                                        <div key={argName}>
                                            <div className="builder__arg-header">
                                                <label className="builder__arg-label">
                                                    {argDef.name} {argDef.required !== false && <span className="builder__arg-required">*</span>}
                                                </label>
                                                <span className="builder__arg-type">{argDef.type}</span>
                                            </div>
                                            <CommandArgInput
                                                arg={argDef}
                                                value={selectedStep.args[argName]}
                                                onChange={(val) => updateStepArg(selectedStep.id, argName, val)}
                                            />
                                            <div className="builder__arg-desc">{argDef.description}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="builder__divider" />

                                {/* Condition */}
                                <div>
                                    <label className="builder__condition-label">Execution Condition (Optional)</label>
                                    <input
                                        type="text"
                                        value={selectedStep.condition || ""}
                                        onChange={e => updateStepCondition(selectedStep.id, e.target.value)}
                                        placeholder="e.g. steps[0].result == 'success'"
                                        className="builder__condition-input"
                                    />
                                    <div className="builder__condition-hint">
                                        JS expression evaluated before step execution.
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <div className="builder__config-empty">
                                <Settings size={24} className="builder__config-empty-icon" />
                                <div className="builder__config-empty-text">Select a step to configure</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState } from "react";
import { Plus, X, Play, Save, Settings, ArrowUp, ArrowDown, Trash2, Search, Briefcase, Clock, Zap } from "lucide-react";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { CommandArgInput } from "../automations/CommandArgInput";
import type { JobDefinition, JobStep } from "../../types";
import type { DeclarativeAutomationDefinition, AutomationStep } from "../../services/automations/types";

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

    // Job Specific
    const [jobMode, setJobMode] = useState<"serial" | "parallel">(initialJob?.mode || "serial");

    // Automation Specific
    const [schedule, setSchedule] = useState(initialAutomation?.schedule || "");

    // Steps
    const [steps, setSteps] = useState<any[]>((initialJob?.steps || initialAutomation?.steps || []).map(s => ({
        ...s,
        id: s.id || crypto.randomUUID(), // Ensure ID
        args: s.args || {},
        condition: (s as any).condition || ""
    })));

    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const commands = registry.getAll();
    const filteredCommands = commands.filter(c =>
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const addStep = (commandId: string) => {
        const command = registry.get(commandId);
        if (!command) return;

        // Initialize default args
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

    const handleRun = () => {
        if (!name.trim()) return alert("Name is required");
        if (steps.length === 0) return alert("Add at least one step");

        const job: JobDefinition = {
            id: initialJob?.id || `job-def-${Date.now()}`,
            name,
            description,
            mode: jobMode,
            steps: steps as JobStep[],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        onRunJob(job);
    };

    const handleSaveAutomation = () => {
        if (!name.trim()) return alert("Name is required");
        if (steps.length === 0) return alert("Add at least one step");

        const automation: DeclarativeAutomationDefinition = {
            id: initialAutomation?.id || crypto.randomUUID(),
            type: "declarative",
            name,
            description,
            schedule: schedule || undefined,
            tags: ["custom"],
            steps: steps as AutomationStep[]
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

                    {mode === "job" && (
                        <div className="builder__exec-group">
                            <label className="builder__exec-label">Execution:</label>
                            <div className="builder__exec-toggle">
                                <button
                                    onClick={() => setJobMode("serial")}
                                    className={`builder__exec-btn ${jobMode === "serial" ? "builder__exec-btn--active" : ""}`}
                                >Serial</button>
                                <button
                                    onClick={() => setJobMode("parallel")}
                                    className={`builder__exec-btn ${jobMode === "parallel" ? "builder__exec-btn--active" : ""}`}
                                >Parallel</button>
                            </div>
                        </div>
                    )}

                    {mode === "automation" && (
                        <div className="builder__schedule-group">
                            <Clock size={12} className="builder__schedule-icon" />
                            <input
                                value={schedule}
                                onChange={e => setSchedule(e.target.value)}
                                placeholder="Schedule (e.g. every 10m)"
                                className="builder__schedule-input"
                            />
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

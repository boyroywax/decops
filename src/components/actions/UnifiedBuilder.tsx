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
        <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "#e4e4e7", fontFamily: "inherit" }}>
            {/* Header / Meta */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={mode === "job" ? "Job Name" : "Automation Name"}
                            style={{
                                background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.1)",
                                color: "white", fontSize: 16, fontWeight: 600, width: "100%", padding: "4px 0",
                                fontFamily: "inherit"
                            }}
                        />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
                        {mode === "job" ? (
                            <button onClick={handleRun} className="btn btn-primary"><Play size={14} className="icon-mr" /> Run Job</button>
                        ) : (
                            <button onClick={handleSaveAutomation} className="btn btn-primary"><Save size={14} className="icon-mr" /> Save Automation</button>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    {/* Mode Selector */}
                    <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 2 }}>
                        <button
                            onClick={() => setMode("job")}
                            style={{
                                background: mode === "job" ? "rgba(255,255,255,0.1)" : "none",
                                color: mode === "job" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", gap: 6, alignItems: "center"
                            }}
                        >
                            <Briefcase size={12} /> Run Once
                        </button>
                        <button
                            onClick={() => setMode("automation")}
                            style={{
                                background: mode === "automation" ? "rgba(255,255,255,0.1)" : "none",
                                color: mode === "automation" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", gap: 6, alignItems: "center"
                            }}
                        >
                            <Zap size={12} /> Automation
                        </button>
                    </div>

                    {mode === "job" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <label style={{ fontSize: 12, color: "#a1a1aa" }}>Execution:</label>
                            <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: 2 }}>
                                <button
                                    onClick={() => setJobMode("serial")}
                                    style={{
                                        background: jobMode === "serial" ? "rgba(255,255,255,0.1)" : "none",
                                        color: jobMode === "serial" ? "#fff" : "#71717a",
                                        border: "none", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer"
                                    }}
                                >Serial</button>
                                <button
                                    onClick={() => setJobMode("parallel")}
                                    style={{
                                        background: jobMode === "parallel" ? "rgba(255,255,255,0.1)" : "none",
                                        color: jobMode === "parallel" ? "#fff" : "#71717a",
                                        border: "none", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer"
                                    }}
                                >Parallel</button>
                            </div>
                        </div>
                    )}

                    {mode === "automation" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                            <Clock size={12} color="#a1a1aa" />
                            <input
                                value={schedule}
                                onChange={e => setSchedule(e.target.value)}
                                placeholder="Schedule (e.g. every 10m)"
                                style={{
                                    background: "rgba(255,255,255,0.03)", border: "none", borderRadius: 4,
                                    color: "#d4d4d8", fontSize: 11, padding: "4px 8px", fontFamily: "inherit", width: 140
                                }}
                            />
                        </div>
                    )}

                    <input
                        type="text"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Description (optional)"
                        style={{
                            background: "rgba(255,255,255,0.03)", border: "none", borderRadius: 4,
                            color: "#d4d4d8", fontSize: 12, flex: 1, padding: "4px 8px", fontFamily: "inherit", minWidth: 200
                        }}
                    />
                </div>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* Available Commands (Left) */}
                <div style={{ width: 220, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: 8 }}>
                        <div style={{ position: "relative" }}>
                            <Search size={12} style={{ position: "absolute", left: 8, top: 8, color: "#71717a" }} />
                            <input
                                type="text"
                                placeholder="Search commands..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: 4, padding: "6px 8px 6px 26px", fontSize: 11, color: "#e4e4e7", boxSizing: "border-box"
                                }}
                            />
                        </div>
                    </div>
                    <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px" }}>
                        {filteredCommands.map(cmd => (
                            <div
                                key={cmd.id}
                                onClick={() => addStep(cmd.id)}
                                style={{
                                    padding: "8px", marginBottom: 4, borderRadius: 4, cursor: "pointer",
                                    background: "rgba(255,255,255,0.02)", border: "1px solid transparent",
                                    transition: "all 0.1s"
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                                    e.currentTarget.style.borderColor = "transparent";
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 500 }}>{cmd.id}</div>
                                <div style={{ fontSize: 10, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {cmd.description}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Steps List (Center) */}
                <div style={{ flex: 1, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.1)" }}>
                    <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Workflow Steps ({steps.length})
                    </div>
                    <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
                        {steps.length === 0 ? (
                            <div style={{ textAlign: "center", color: "#52525b", marginTop: 40, fontSize: 12 }}>
                                No steps added.<br />Select commands from the left.
                            </div>
                        ) : (
                            steps.map((step, idx) => (
                                <div
                                    key={step.id}
                                    onClick={() => setSelectedStepId(step.id)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "10px 12px", marginBottom: 8, borderRadius: 6,
                                        background: selectedStepId === step.id ? "rgba(0, 229, 160, 0.08)" : "rgba(255,255,255,0.03)",
                                        border: `1px solid ${selectedStepId === step.id ? "rgba(0, 229, 160, 0.3)" : "rgba(255,255,255,0.06)"}`,
                                        cursor: "pointer",
                                        position: "relative"
                                    }}
                                >
                                    <div style={{ fontSize: 10, color: "#52525b", width: 16 }}>{idx + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: selectedStepId === step.id ? "#00e5a0" : "#e4e4e7" }}>{step.commandId}</div>
                                            {step.condition && (
                                                <div style={{ fontSize: 10, color: "#eab308", background: "rgba(234, 179, 8, 0.1)", padding: "0 4px", borderRadius: 2 }}>
                                                    Conditional
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{Object.keys(step.args).length} args configured</div>
                                    </div>
                                    <div style={{ display: "flex", gap: 2 }}>
                                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0} className="icon-btn">
                                            <ArrowUp size={12} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === steps.length - 1} className="icon-btn">
                                            <ArrowDown size={12} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="icon-btn-danger">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Config (Right) */}
                <div style={{ width: 300, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)" }}>
                    <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        Configuration
                    </div>
                    <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                        {selectedStep && selectedCommandDef ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>{selectedCommandDef.id}</div>
                                    <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.4 }}>{selectedCommandDef.description}</div>
                                </div>
                                <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                                {/* Arguments */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {Object.entries(selectedCommandDef.args).map(([argName, argDef]) => (
                                        <div key={argName}>
                                            <div style={{ display: 'flex', justifyContent: "space-between", marginBottom: 4 }}>
                                                <label style={{ display: "block", fontSize: 11, color: "#d4d4d8", fontWeight: 500 }}>
                                                    {argDef.name} {argDef.required !== false && <span style={{ color: "#ef4444" }}>*</span>}
                                                </label>
                                                <span style={{ fontSize: 9, color: "#52525b" }}>{argDef.type}</span>
                                            </div>
                                            <CommandArgInput
                                                arg={argDef}
                                                value={selectedStep.args[argName]}
                                                onChange={(val) => updateStepArg(selectedStep.id, argName, val)}
                                            />
                                            <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{argDef.description}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                                {/* Condition */}
                                <div>
                                    <label style={{ display: "block", fontSize: 11, color: "#eab308", marginBottom: 4, fontWeight: 500 }}>Execution Condition (Optional)</label>
                                    <input
                                        type="text"
                                        value={selectedStep.condition || ""}
                                        onChange={e => updateStepCondition(selectedStep.id, e.target.value)}
                                        placeholder="e.g. steps[0].result == 'success'"
                                        style={inputStyle}
                                    />
                                    <div style={{ fontSize: 9, color: "#52525b", marginTop: 4 }}>
                                        JS expression evaluated before step execution.
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#52525b" }}>
                                <Settings size={24} style={{ marginBottom: 12, opacity: 0.5 }} />
                                <div style={{ fontSize: 12 }}>Select a step to configure</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .btn {
                    border: none; border-radius: 4px; padding: 6px 12px; fontSize: 11px; font-weight: 500; cursor: pointer; display: flex; alignItems: center;
                }
                .btn-primary { background: #00e5a0; color: #000; }
                .btn-secondary { background: rgba(255,255,255,0.1); color: #e4e4e7; }
                .btn:hover { opacity: 0.9; }
                .icon-mr { margin-right: 6px; }
                
                .icon-btn {
                    background: transparent; border: none; color: #71717a; cursor: pointer; padding: 4px; border-radius: 4px;
                }
                .icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #e4e4e7; }
                .icon-btn:disabled { opacity: 0.3; cursor: default; }
                
                .icon-btn-danger {
                    background: transparent; border: none; color: #71717a; cursor: pointer; padding: 4px; border-radius: 4px;
                }
                .icon-btn-danger:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
            `}</style>
        </div>
    );
}

const inputStyle = {
    width: "100%", padding: "6px 8px", background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
    color: "#e4e4e7", fontSize: 12, boxSizing: "border-box" as const, fontFamily: "inherit"
};

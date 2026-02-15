import { useState, useCallback } from "react";
import { Plus, X, Play, Save, Settings, ArrowUp, ArrowDown, Trash2, Search, Briefcase } from "lucide-react";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { GradientIcon } from "../shared/GradientIcon";
import type { JobDefinition, JobStep } from "../../types";

interface JobCreatorProps {
    onSave: (job: JobDefinition) => void;
    onRun: (job: JobDefinition) => void;
    onCancel: () => void;
    initialJob?: JobDefinition | null;
}

export function JobCreator({ onSave, onRun, onCancel, initialJob }: JobCreatorProps) {
    const [name, setName] = useState(initialJob?.name || "");
    const [description, setDescription] = useState(initialJob?.description || "");
    const [mode, setMode] = useState<"serial" | "parallel">(initialJob?.mode || "serial");
    const [steps, setSteps] = useState<JobStep[]>(initialJob?.steps || []);
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

        const newStep: JobStep = {
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            commandId,
            args,
            status: "pending"
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

    const handleSave = () => {
        if (!name.trim()) return alert("Job name is required");
        if (steps.length === 0) return alert("Add at least one step");

        const job: JobDefinition = {
            id: initialJob?.id || `job-def-${Date.now()}`,
            name,
            description,
            mode,
            steps,
            createdAt: initialJob?.createdAt || Date.now(),
            updatedAt: Date.now()
        };
        onSave(job);
    };

    const handleRun = () => {
        if (steps.length === 0) return alert("Add at least one step");
        // Create a temporary definition if not saved? 
        // Or just pass the logic. The parent expects a JobDefinition.
        // We'll construct it on the fly.
        const job: JobDefinition = {
            id: initialJob?.id || `temp-job-${Date.now()}`,
            name: name || "Untitled Job",
            description,
            mode,
            steps,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        onRun(job);
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
                            placeholder="Job Name"
                            style={{
                                background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.1)",
                                color: "white", fontSize: 16, fontWeight: 600, width: "100%", padding: "4px 0",
                                fontFamily: "inherit"
                            }}
                        />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
                        <button onClick={handleRun} className="btn btn-secondary"><Play size={14} className="icon-mr" /> Run</button>
                        <button onClick={handleSave} className="btn btn-primary"><Save size={14} className="icon-mr" /> Save</button>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ fontSize: 12, color: "#a1a1aa" }}>Mode:</label>
                        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: 2 }}>
                            <button
                                onClick={() => setMode("serial")}
                                style={{
                                    background: mode === "serial" ? "rgba(255,255,255,0.1)" : "none",
                                    color: mode === "serial" ? "#fff" : "#71717a",
                                    border: "none", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer"
                                }}
                            >Serial</button>
                            <button
                                onClick={() => setMode("parallel")}
                                style={{
                                    background: mode === "parallel" ? "rgba(255,255,255,0.1)" : "none",
                                    color: mode === "parallel" ? "#fff" : "#71717a",
                                    border: "none", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer"
                                }}
                            >Parallel</button>
                        </div>
                    </div>
                    <input
                        type="text"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Description (optional)"
                        style={{
                            background: "rgba(255,255,255,0.03)", border: "none", borderRadius: 4,
                            color: "#d4d4d8", fontSize: 12, flex: 1, padding: "4px 8px", fontFamily: "inherit"
                        }}
                    />
                </div>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* Available Commands (Left) */}
                <div style={{ width: 200, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
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
                        Job Steps ({steps.length})
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
                                        cursor: "pointer"
                                    }}
                                >
                                    <div style={{ fontSize: 10, color: "#52525b", width: 16 }}>{idx + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: selectedStepId === step.id ? "#00e5a0" : "#e4e4e7" }}>{step.commandId}</div>
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
                <div style={{ width: 280, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)" }}>
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

                                {Object.entries(selectedCommandDef.args).map(([argName, argDef]) => (
                                    <div key={argName}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <label style={{ fontSize: 11, color: "#d4d4d8", fontWeight: 500 }}>{argName}</label>
                                            {argDef.required !== false && <span style={{ fontSize: 10, color: "#ef4444" }}>Required</span>}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#71717a", marginBottom: 6 }}>{argDef.description}</div>

                                        {argDef.type === 'boolean' ? (
                                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedStep.args[argName]}
                                                    onChange={e => updateStepArg(selectedStep.id, argName, e.target.checked)}
                                                />
                                                {selectedStep.args[argName] ? "True" : "False"}
                                            </label>
                                        ) : argDef.type === "number" ? (
                                            <input
                                                type="number"
                                                value={selectedStep.args[argName] || 0}
                                                onChange={e => updateStepArg(selectedStep.id, argName, parseFloat(e.target.value))}
                                                style={inputStyle}
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                value={selectedStep.args[argName] || ""}
                                                onChange={e => updateStepArg(selectedStep.id, argName, e.target.value)}
                                                style={inputStyle}
                                                placeholder={String(argDef.defaultValue || "")}
                                            />
                                        )}
                                    </div>
                                ))}
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

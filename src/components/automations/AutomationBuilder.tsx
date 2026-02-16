import React, { useState } from "react";
import { DeclarativeAutomationDefinition, AutomationStep } from "../../services/automations/types";
import { registry } from "../../services/commands/registry";
import { CommandArgInput } from "./CommandArgInput";
import { useAutomations } from "../../context/AutomationsContext";

interface AutomationBuilderProps {
    onClose: () => void;
}

export function AutomationBuilder({ onClose }: AutomationBuilderProps) {
    const { register } = useAutomations();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [schedule, setSchedule] = useState("");
    const [steps, setSteps] = useState<AutomationStep[]>([]);

    // Step creation state
    const [isAddingStep, setIsAddingStep] = useState(false);
    const [selectedCommandId, setSelectedCommandId] = useState("");
    const [stepArgs, setStepArgs] = useState<Record<string, any>>({});
    const [stepCondition, setStepCondition] = useState("");

    const allCommands = registry.getAll();
    const selectedCommand = allCommands.find(c => c.id === selectedCommandId);

    const handleAddStep = () => {
        if (!selectedCommandId) return;

        const newStep: AutomationStep = {
            id: crypto.randomUUID(),
            commandId: selectedCommandId,
            args: stepArgs,
            condition: stepCondition || undefined
        };

        setSteps([...steps, newStep]);
        setIsAddingStep(false);
        setSelectedCommandId("");
        setStepArgs({});
        setStepCondition("");
    };

    const handleSave = () => {
        if (!name) return;

        const newAutomation: DeclarativeAutomationDefinition = {
            id: crypto.randomUUID(),
            type: "declarative",
            name,
            description,
            schedule: schedule || undefined,
            tags: ["custom"],
            steps
        };

        register(newAutomation);
        onClose();
    };

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 20,
            background: "#18181b", padding: 24, borderRadius: 12, border: "1px solid #27272a"
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Create New Automation</h2>
                <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
                <div>
                    <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>Name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Daily Cleanup"
                        style={{ width: "100%", padding: "8px 12px", background: "#09090b", border: "1px solid #27272a", borderRadius: 6, color: "white" }}
                    />
                </div>
                <div>
                    <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>Description</label>
                    <input
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="What does manual workflow do?"
                        style={{ width: "100%", padding: "8px 12px", background: "#09090b", border: "1px solid #27272a", borderRadius: 6, color: "white" }}
                    />
                </div>
                <div>
                    <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>Schedule (optional)</label>
                    <input
                        value={schedule}
                        onChange={e => setSchedule(e.target.value)}
                        placeholder="e.g. every 10m"
                        style={{ width: "100%", padding: "8px 12px", background: "#09090b", border: "1px solid #27272a", borderRadius: 6, color: "white" }}
                    />
                </div>
            </div>

            <div style={{ borderTop: "1px solid #27272a", paddingTop: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px 0" }}>Steps</h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                    {steps.map((step, idx) => (
                        <div key={step.id} style={{
                            padding: 12, background: "#27272a", borderRadius: 8,
                            display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{
                                    width: 24, height: 24, borderRadius: "50%", background: "#3f3f46",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold"
                                }}>{idx + 1}</span>
                                <div>
                                    <div style={{ fontWeight: 500 }}>{step.commandId}</div>
                                    <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                                        {Object.keys(step.args).length} args
                                        {step.condition && <span style={{ color: "#eab308", marginLeft: 8 }}>If: {step.condition}</span>}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSteps(steps.filter(s => s.id !== step.id))}
                                style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18 }}
                            >×</button>
                        </div>
                    ))}
                    {steps.length === 0 && (
                        <div style={{ padding: 20, textAlign: "center", color: "#52525b", border: "1px dashed #27272a", borderRadius: 8 }}>
                            No steps defined yet.
                        </div>
                    )}
                </div>

                {!isAddingStep ? (
                    <button
                        onClick={() => setIsAddingStep(true)}
                        style={{
                            width: "100%", padding: 10, background: "#27272a", color: "white", border: "none", borderRadius: 6,
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                        }}
                    >
                        + Add Step
                    </button>
                ) : (
                    <div style={{
                        padding: 16, background: "#09090b", borderRadius: 8, border: "1px solid #27272a",
                        display: "flex", flexDirection: "column", gap: 16
                    }}>
                        <div>
                            <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>Select Command</label>
                            <select
                                value={selectedCommandId}
                                onChange={e => {
                                    setSelectedCommandId(e.target.value);
                                    setStepArgs({});
                                }}
                                style={{ width: "100%", padding: "8px", background: "#18181b", border: "1px solid #27272a", color: "white", borderRadius: 6 }}
                            >
                                <option value="">Select a command...</option>
                                {allCommands.map(cmd => (
                                    <option key={cmd.id} value={cmd.id}>{cmd.id}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>Condition (optional)</label>
                            <input
                                value={stepCondition}
                                onChange={e => setStepCondition(e.target.value)}
                                placeholder="e.g. steps[0].result === 'success'"
                                style={{
                                    width: "100%", padding: "8px", background: "#18181b", border: "1px solid #27272a", color: "white", borderRadius: 6,
                                    fontFamily: "monospace", fontSize: 12
                                }}
                            />
                            <p style={{ fontSize: 10, color: "#52525b", margin: "4px 0 0 0" }}>
                                JS expression. Available vars: <code>steps</code> (array of previous steps), <code>context</code>.
                            </p>
                        </div>

                        {selectedCommand && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {Object.entries(selectedCommand.args).map(([argName, argDef]) => (
                                    <div key={argName}>
                                        <div style={{ display: 'flex', justifyContent: "space-between" }}>
                                            <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>
                                                {argDef.name} {argDef.required !== false && <span style={{ color: "#ef4444" }}>*</span>}
                                            </label>
                                            <span style={{ fontSize: 10, color: "#52525b" }}>{argDef.type}</span>
                                        </div>
                                        <CommandArgInput
                                            arg={argDef}
                                            value={stepArgs[argName]}
                                            onChange={(val) => setStepArgs(prev => ({ ...prev, [argName]: val }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                            <button
                                onClick={handleAddStep}
                                disabled={!selectedCommandId}
                                style={{
                                    flex: 1, padding: "8px", background: "#2563eb", color: "white", border: "none", borderRadius: 6,
                                    cursor: selectedCommandId ? "pointer" : "not-allowed", opacity: selectedCommandId ? 1 : 0.5
                                }}
                            >
                                Add Step
                            </button>
                            <button
                                onClick={() => {
                                    setIsAddingStep(false);
                                    setSelectedCommandId("");
                                    setStepArgs({});
                                }}
                                style={{
                                    flex: 1, padding: "8px", background: "#27272a", color: "#a1a1aa", border: "none", borderRadius: 6, cursor: "pointer"
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                <button
                    onClick={onClose}
                    style={{ padding: "8px 16px", background: "transparent", color: "#a1a1aa", border: "1px solid #27272a", borderRadius: 6, cursor: "pointer" }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={!name || steps.length === 0}
                    style={{
                        padding: "8px 16px", background: "#10b981", color: "white", border: "none", borderRadius: 6,
                        cursor: (!name || steps.length === 0) ? "not-allowed" : "pointer",
                        opacity: (!name || steps.length === 0) ? 0.5 : 1
                    }}
                >
                    Create Automation
                </button>
            </div>
        </div>
    );
}

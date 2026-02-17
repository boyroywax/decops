import React, { useState } from "react";
import { DeclarativeAutomationDefinition, AutomationStep } from "../../services/automations/types";
import { registry } from "../../services/commands/registry";
import { CommandArgInput } from "./CommandArgInput";
import { useAutomations } from "../../context/AutomationsContext";
import "../../styles/components/automation-builder.css";

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
        <div className="auto-builder">
            <div className="auto-builder__header">
                <h2 className="auto-builder__title">Create New Automation</h2>
                <button onClick={onClose} className="auto-builder__close">✕</button>
            </div>

            <div className="auto-builder__form">
                <div>
                    <label className="auto-builder__label">Name</label>
                    <input
                        className="input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Daily Cleanup"
                    />
                </div>
                <div>
                    <label className="auto-builder__label">Description</label>
                    <input
                        className="input"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="What does manual workflow do?"
                    />
                </div>
                <div>
                    <label className="auto-builder__label">Schedule (optional)</label>
                    <input
                        className="input"
                        value={schedule}
                        onChange={e => setSchedule(e.target.value)}
                        placeholder="e.g. every 10m"
                    />
                </div>
            </div>

            <div className="auto-builder__steps">
                <h3 className="auto-builder__steps-title">Steps</h3>

                <div className="auto-builder__step-list">
                    {steps.map((step, idx) => (
                        <div key={step.id} className="auto-builder__step">
                            <div className="auto-builder__step-info">
                                <span className="auto-builder__step-number">{idx + 1}</span>
                                <div>
                                    <div className="auto-builder__step-command">{step.commandId}</div>
                                    <div className="auto-builder__step-meta">
                                        {Object.keys(step.args).length} args
                                        {step.condition && <span className="auto-builder__step-condition">If: {step.condition}</span>}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSteps(steps.filter(s => s.id !== step.id))}
                                className="auto-builder__step-remove"
                            >×</button>
                        </div>
                    ))}
                    {steps.length === 0 && (
                        <div className="auto-builder__empty">
                            No steps defined yet.
                        </div>
                    )}
                </div>

                {!isAddingStep ? (
                    <button
                        onClick={() => setIsAddingStep(true)}
                        className="auto-builder__add-btn"
                    >
                        + Add Step
                    </button>
                ) : (
                    <div className="auto-builder__step-form">
                        <div>
                            <label className="auto-builder__label">Select Command</label>
                            <select
                                className="auto-builder__select"
                                value={selectedCommandId}
                                onChange={e => {
                                    setSelectedCommandId(e.target.value);
                                    setStepArgs({});
                                }}
                            >
                                <option value="">Select a command...</option>
                                {allCommands.map(cmd => (
                                    <option key={cmd.id} value={cmd.id}>{cmd.id}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="auto-builder__label">Condition (optional)</label>
                            <input
                                className="input auto-builder__condition-input"
                                value={stepCondition}
                                onChange={e => setStepCondition(e.target.value)}
                                placeholder="e.g. steps[0].result === 'success'"
                            />
                            <p className="auto-builder__help-text">
                                JS expression. Available vars: <code>steps</code> (array of previous steps), <code>context</code>.
                            </p>
                        </div>

                        {selectedCommand && (
                            <div className="auto-builder__args">
                                {Object.entries(selectedCommand.args).map(([argName, argDef]) => (
                                    <div key={argName}>
                                        <div className="auto-builder__arg-header">
                                            <label className="auto-builder__label">
                                                {argDef.name} {argDef.required !== false && <span className="auto-builder__required">*</span>}
                                            </label>
                                            <span className="auto-builder__arg-type">{argDef.type}</span>
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

                        <div className="auto-builder__step-actions">
                            <button
                                className="btn btn-primary"
                                onClick={handleAddStep}
                                disabled={!selectedCommandId}
                            >
                                Add Step
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => {
                                    setIsAddingStep(false);
                                    setSelectedCommandId("");
                                    setStepArgs({});
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="auto-builder__footer">
                <button
                    className="btn btn-ghost"
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!name || steps.length === 0}
                >
                    Create Automation
                </button>
            </div>
        </div>
    );
}

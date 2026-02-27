import { Trash2, GripVertical, GitBranch, ArrowRightLeft, Link, Cpu } from "lucide-react";
import { registry } from "../../services/commands/registry";
import type { StudioStep } from "../views/StudioView";

interface JobNodeProps {
    step: StudioStep;
    index: number;
    total: number;
    selected: boolean;
    isDragging: boolean;
    onRemove: () => void;
    childCount: number;
}

export function JobNode({ step, index, total, selected, isDragging, onRemove, childCount }: JobNodeProps) {
    const cmd = registry.get(step.commandId);
    const allArgs = cmd ? Object.entries(cmd.args) : [];
    const filledCount = Object.entries(step.args).filter(([, v]) => v !== null && v !== "" && v !== undefined).length;
    const boundCount = Object.values(step.inputBindings).filter(b => b.sourceKey).length;

    return (
        <div className={`jm-node ${selected ? "jm-node--selected" : ""} ${isDragging ? "jm-node--dragging" : ""}`}>
            <div className="jm-node__header">
                <div className="jm-node__drag-handle"><GripVertical size={12} /></div>
                <div className="jm-node__index">{index + 1}</div>
                <div className="jm-node__title">{step.commandId}</div>
                <div className="jm-node__actions">
                    <button
                        className="jm-node__action-btn jm-node__action-btn--danger"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        title="Remove step"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {cmd && <div className="jm-node__description">{cmd.description}</div>}

            {/* Input args summary */}
            <div className="jm-node__section">
                <div className="jm-node__section-label">Inputs</div>
                <div className="jm-node__args-list">
                    {allArgs.slice(0, 4).map(([key, def]) => {
                        const binding = step.inputBindings[key];
                        const val = step.args[key];
                        const hasValue = val !== null && val !== "" && val !== undefined;
                        if (binding && binding.sourceKey) {
                            return (
                                <div key={key} className="jm-node__arg jm-node__arg--bound">
                                    <Link size={8} className="jm-node__arg-bind-icon" />
                                    <span className="jm-node__arg-name">{def.name}</span>
                                    <span className={`jm-node__arg-source jm-node__arg-source--${binding.source}`}>
                                        {binding.sourceKey}
                                    </span>
                                </div>
                            );
                        }
                        return (
                            <div key={key} className={`jm-node__arg ${hasValue ? "jm-node__arg--filled" : ""}`}>
                                <span className="jm-node__arg-name">{def.name}</span>
                                {hasValue && <span className="jm-node__arg-value">{String(val).slice(0, 12)}</span>}
                            </div>
                        );
                    })}
                    {allArgs.length > 4 && (
                        <div className="jm-node__arg jm-node__arg--more">+{allArgs.length - 4} more</div>
                    )}
                </div>
            </div>

            {/* Output mappings summary */}
            {step.outputMappings.length > 0 && (
                <div className="jm-node__section">
                    <div className="jm-node__section-label">Outputs</div>
                    <div className="jm-node__outputs-list">
                        {step.outputMappings.slice(0, 3).map((m, i) => (
                            <div key={i} className={`jm-node__output jm-node__output--${m.target}`}>
                                <span className="jm-node__output-key">{m.outputKey === "*" ? "all" : m.outputKey}</span>
                                <span className="jm-node__output-arrow">→</span>
                                <span className="jm-node__output-target">{m.targetKey || "?"}</span>
                            </div>
                        ))}
                        {step.outputMappings.length > 3 && (
                            <div className="jm-node__output jm-node__output--more">+{step.outputMappings.length - 3} more</div>
                        )}
                    </div>
                </div>
            )}

            {/* Pre/Post conditions */}
            {(step.preCondition || step.postCondition) && (
                <div className="jm-node__conditions">
                    {step.preCondition && <span className="jm-node__badge jm-node__badge--pre">Pre</span>}
                    {step.postCondition && <span className="jm-node__badge jm-node__badge--post">Post</span>}
                </div>
            )}

            <div className="jm-node__meta">
                <span>{filledCount + boundCount}/{allArgs.length} args</span>
                {cmd && <span>• {cmd.tags?.[0] || "cmd"}</span>}
                {childCount > 0 && (
                    <span className="jm-node__branch-badge">
                        <GitBranch size={10} /> {childCount}
                    </span>
                )}
                {step.outputMappings.length > 0 && (
                    <span className="jm-node__output-badge">
                        <ArrowRightLeft size={10} /> {step.outputMappings.length}
                    </span>
                )}
                {step.modelId && (
                    <span className="jm-node__model-badge" title={`Model: ${step.modelId}`}>
                        <Cpu size={10} /> {step.modelId.split('/').pop()?.slice(0, 14) || step.modelId.slice(0, 14)}
                    </span>
                )}
            </div>
        </div>
    );
}

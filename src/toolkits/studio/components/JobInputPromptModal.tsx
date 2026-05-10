/**
 * JobInputPromptModal — Modal that appears when a running job requires user input.
 * Watches for jobs with status "awaiting-input" and displays a prompt form.
 */

import { useState, useMemo } from "react";
import { AlertCircle, Send, X, Keyboard } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useJobsContext } from "@/context/JobsContext";
import "../styles/job-input-prompt.css";

export function JobInputPromptModal() {
    const { jobs, resolvePromptInput, stopJob } = useJobsContext();
    const [inputValue, setInputValue] = useState("");
    const [rangeValue, setRangeValue] = useState<number>(0);
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

    // Find the first job awaiting input
    const pendingJob = useMemo(
        () => jobs.find(j => j.status === "awaiting-input" && j.pendingPrompt),
        [jobs],
    );

    if (!pendingJob || !pendingJob.pendingPrompt) return null;

    const { inputName, promptText, inputType, options, min, max, step, placeholder } = pendingJob.pendingPrompt;

    const handleSubmit = () => {
        let value: string;
        if (inputType === "number_range") {
            value = String(rangeValue);
        } else if (inputType === "list" && options) {
            value = selectedOptions.join(",");
        } else {
            value = inputValue.trim();
        }
        if (!value) return;
        resolvePromptInput(pendingJob.id, inputName, value);
        setInputValue("");
        setRangeValue(min ?? 0);
        setSelectedOptions([]);
    };

    const handleCancel = () => {
        stopJob(pendingJob.id);
        setInputValue("");
        setRangeValue(min ?? 0);
        setSelectedOptions([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
        if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };

    return (
        <div className="jip-overlay" onClick={handleCancel}>
            <div className="jip-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="jip-header">
                    <div className="jip-header__icon">
                        <GradientIcon icon={Keyboard} size={18} gradient={["#fbbf24", "#f59e0b"]} />
                    </div>
                    <div className="jip-header__text">
                        <div className="jip-header__title">Input Required</div>
                        <div className="jip-header__job">Job: {pendingJob.type} <span className="jip-header__job-id">({pendingJob.id.slice(0, 8)})</span></div>
                    </div>
                    <button className="jip-close" onClick={handleCancel} title="Cancel job">
                        <X size={14} />
                    </button>
                </div>

                {/* Prompt */}
                <div className="jip-prompt">
                    <AlertCircle size={14} className="jip-prompt__icon" />
                    <span>{promptText}</span>
                </div>

                {/* Input field */}
                <div className="jip-input-area">
                    {inputType === "number_range" ? (
                        <div className="jip-range">
                            <input
                                type="range"
                                min={min ?? 0}
                                max={max ?? 100}
                                step={step ?? 1}
                                value={rangeValue}
                                onChange={e => setRangeValue(Number(e.target.value))}
                                className="jip-range__slider"
                            />
                            <span className="jip-range__value">{rangeValue}</span>
                        </div>
                    ) : inputType === "list" && options && options.length > 0 ? (
                        <div className="jip-options">
                            {options.map(opt => (
                                <button
                                    key={opt}
                                    className={`jip-option${selectedOptions.includes(opt) ? " jip-option--selected" : ""}`}
                                    onClick={() => {
                                        setSelectedOptions(prev =>
                                            prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
                                        );
                                    }}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <input
                            type="text"
                            className="jip-text-input"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder || `Enter ${inputName}...`}
                            autoFocus
                        />
                    )}
                </div>

                {/* Actions */}
                <div className="jip-actions">
                    <button className="jip-btn jip-btn--cancel" onClick={handleCancel}>
                        Cancel Job
                    </button>
                    <button
                        className="jip-btn jip-btn--submit"
                        onClick={handleSubmit}
                        disabled={inputType !== "number_range" && inputType !== "list" && !inputValue.trim()}
                    >
                        <Send size={12} /> Submit
                    </button>
                </div>
            </div>
        </div>
    );
}

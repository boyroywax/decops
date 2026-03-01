import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { X, Play, AlertCircle, ChevronDown, FlaskConical } from "lucide-react";
import type { CommandDefinition, CommandArg } from "../../services/commands/types";
import type { User } from "../../types";
import { registry } from "../../services/commands/registry";
import { DryRunReport } from "./DryRunReport";
import type { DryRunJobResult } from "../../services/commands/dryRun";
import "../../styles/components/command-prompt.css";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface CommandPromptProps {
    command: CommandDefinition;
    /** Pre-filled arg values (e.g. from CLI parsing) */
    initialArgs?: Record<string, any>;
    /** Workspace entities for entity pickers */
    entities?: {
        agents: { id: string; name: string }[];
        channels: { id: string; from?: string; to?: string; type?: string }[];
        groups: { id: string; name: string }[];
        networks: { id: string; name?: string; color?: string }[];
    };
    /** Current user for includeUserOption */
    currentUser?: User | null;
    onSubmit: (commandId: string, args: Record<string, any>) => void;
    /** Workspace context for dry-run entity resolution */
    dryRunContext?: any;
    onCancel: () => void;
}

interface FieldError {
    argName: string;
    message: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function getArgLabel(name: string): string {
    return name
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

function getPlaceholder(arg: CommandArg): string {
    if (arg.enum) return `Select ${arg.name}...`;
    switch (arg.type) {
        case "string": return `Enter ${arg.name}...`;
        case "number": return "0";
        case "boolean": return "";
        case "array": return "Comma-separated values...";
        case "object": return "{ }";
        case "agent": return "Select agent...";
        case "channel": return "Select channel...";
        case "group": return "Select group...";
        case "network": return "Select network...";
        default: return `Enter ${arg.name}...`;
    }
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function CommandPrompt({
    command,
    initialArgs = {},
    entities,
    currentUser,
    onSubmit,
    dryRunContext,
    onCancel,
}: CommandPromptProps) {
    const argEntries = useMemo(
        () => Object.entries(command.args),
        [command.args]
    );

    // Separate required and optional args
    const requiredArgs = useMemo(
        () => argEntries.filter(([, a]) => a.required !== false && a.defaultValue === undefined),
        [argEntries]
    );
    const optionalArgs = useMemo(
        () => argEntries.filter(([, a]) => a.required === false || a.defaultValue !== undefined),
        [argEntries]
    );

    // Initialize values — pre-fill defaults and initialArgs
    const [values, setValues] = useState<Record<string, any>>(() => {
        const init: Record<string, any> = {};
        for (const [name, arg] of argEntries) {
            if (name in initialArgs && initialArgs[name] !== undefined) {
                init[name] = initialArgs[name];
            } else if (arg.defaultValue !== undefined) {
                init[name] = arg.defaultValue;
            } else if (arg.type === "boolean") {
                init[name] = false;
            } else if (arg.type === "array") {
                init[name] = [];
            } else {
                init[name] = "";
            }
        }
        return init;
    });

    const [errors, setErrors] = useState<FieldError[]>([]);
    const [showOptional, setShowOptional] = useState(false);
    const [dryRunReport, setDryRunReport] = useState<DryRunJobResult | null>(null);
    const firstInputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

    // Focus first input on mount
    useEffect(() => {
        setTimeout(() => firstInputRef.current?.focus(), 100);
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onCancel]);

    const setValue = useCallback((name: string, value: any) => {
        setValues(prev => ({ ...prev, [name]: value }));
        // Clear error for this field
        setErrors(prev => prev.filter(e => e.argName !== name));
    }, []);

    const validate = useCallback((): boolean => {
        const errs: FieldError[] = [];
        for (const [name, arg] of argEntries) {
            const val = values[name];

            // Required check
            if (arg.required !== false && arg.defaultValue === undefined) {
                if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
                    errs.push({ argName: name, message: `${getArgLabel(name)} is required` });
                    continue;
                }
            }

            // Skip further validation for empty optional values
            if (val === undefined || val === null || val === "") continue;

            // Type check
            if (arg.type === "number" && isNaN(Number(val))) {
                errs.push({ argName: name, message: `${getArgLabel(name)} must be a number` });
                continue;
            }

            // Enum check
            if (arg.enum && !arg.enum.includes(String(val))) {
                errs.push({ argName: name, message: `${getArgLabel(name)} must be one of: ${arg.enum.join(", ")}` });
                continue;
            }

            // Custom validation
            if (arg.validation) {
                const coerced = arg.type === "number" ? Number(val) : val;
                const result = arg.validation(coerced);
                if (result !== true) {
                    errs.push({ argName: name, message: typeof result === "string" ? result : `${getArgLabel(name)} is invalid` });
                    continue;
                }
            }
        }

        setErrors(errs);
        return errs.length === 0;
    }, [argEntries, values]);

    const handleSubmit = useCallback(() => {
        if (!validate()) return;

        // Coerce types
        const coerced: Record<string, any> = {};
        for (const [name, arg] of argEntries) {
            let val = values[name];
            if (val === "" && arg.required === false && arg.defaultValue === undefined) continue; // skip empty optionals
            if (arg.type === "number" && val !== "" && val !== undefined) val = Number(val);
            if (arg.type === "boolean") val = Boolean(val);
            if (arg.type === "array" && typeof val === "string") {
                val = val.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
            if (arg.type === "object" && typeof val === "string") {
                try { val = JSON.parse(val); } catch { /* keep string */ }
            }
            coerced[name] = val;
        }

        onSubmit(command.id, coerced);
    }, [validate, argEntries, values, command.id, onSubmit]);

    /** Build coerced args (shared between submit and dry-run) */
    const buildCoercedArgs = useCallback(() => {
        const coerced: Record<string, any> = {};
        for (const [name, arg] of argEntries) {
            let val = values[name];
            if (val === "" && arg.required === false && arg.defaultValue === undefined) continue;
            if (arg.type === "number" && val !== "" && val !== undefined) val = Number(val);
            if (arg.type === "boolean") val = Boolean(val);
            if (arg.type === "array" && typeof val === "string") {
                val = val.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
            if (arg.type === "object" && typeof val === "string") {
                try { val = JSON.parse(val); } catch { /* keep string */ }
            }
            coerced[name] = val;
        }
        return coerced;
    }, [argEntries, values]);

    const handleDryRun = useCallback(() => {
        const coerced = buildCoercedArgs();
        const cmdResult = registry.dryRun(command.id, coerced, dryRunContext || {});
        const report: DryRunJobResult = {
            valid: cmdResult.valid,
            mode: 'single',
            steps: [{
                stepId: 'single',
                stepIndex: 0,
                commandId: command.id,
                conditionMet: null,
                result: cmdResult,
            }],
            unresolvedRefs: [],
            summary: cmdResult.summary,
            totalChecks: cmdResult.checks.length,
            passedChecks: cmdResult.checks.filter(c => c.status === 'pass').length,
            failedChecks: cmdResult.checks.filter(c => c.status === 'fail').length,
            warningCount: cmdResult.checks.filter(c => c.status === 'warn').length,
        };
        setDryRunReport(report);
    }, [command.id, buildCoercedArgs, dryRunContext]);

    const getError = (name: string) => errors.find(e => e.argName === name)?.message;

    const hasArgs = argEntries.length > 0;

    /* ─── Render Field ───────────────────────────────────────────────── */

    const renderField = (name: string, arg: CommandArg, index: number) => {
        const error = getError(name);
        const isRequired = arg.required !== false && arg.defaultValue === undefined;
        const isFirst = index === 0;

        // Entity picker — select from workspace entities
        if (["agent", "channel", "group", "network"].includes(arg.type) && entities) {
            const entityList = (() => {
                switch (arg.type) {
                    case "agent": return (entities.agents || []).map(e => ({ id: e.id, label: e.name || e.id }));
                    case "channel": return (entities.channels || []).map(e => ({ id: e.id, label: `${e.from || "?"} → ${e.to || "?"} (${e.type || "data"})` }));
                    case "group": return (entities.groups || []).map(e => ({ id: e.id, label: e.name || e.id }));
                    case "network": return (entities.networks || []).map(e => ({ id: e.id, label: e.name || e.id }));
                    default: return [];
                }
            })();

            return (
                <div key={name} className={`cmd-prompt__field${error ? " cmd-prompt__field--error" : ""}`}>
                    <label className="cmd-prompt__label">
                        {getArgLabel(name)}
                        {isRequired && <span className="cmd-prompt__required">*</span>}
                    </label>
                    <p className="cmd-prompt__hint">{arg.description}</p>
                    <div className="cmd-prompt__select-wrap">
                        <select
                            ref={isFirst ? firstInputRef as any : undefined}
                            value={values[name] || ""}
                            onChange={e => setValue(name, e.target.value)}
                            className="cmd-prompt__select"
                        >
                            <option value="">{getPlaceholder(arg)}</option>
                            {arg.type === "agent" && arg.includeUserOption && (
                                <option value="user">You ({currentUser?.profile?.name || "Current User"})</option>
                            )}
                            {entityList.map(e => (
                                <option key={e.id} value={e.id}>{e.label}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="cmd-prompt__select-icon" />
                    </div>
                    {error && <span className="cmd-prompt__error"><AlertCircle size={10} /> {error}</span>}
                </div>
            );
        }

        // Enum — dropdown
        if (arg.enum) {
            return (
                <div key={name} className={`cmd-prompt__field${error ? " cmd-prompt__field--error" : ""}`}>
                    <label className="cmd-prompt__label">
                        {getArgLabel(name)}
                        {isRequired && <span className="cmd-prompt__required">*</span>}
                    </label>
                    <p className="cmd-prompt__hint">{arg.description}</p>
                    <div className="cmd-prompt__select-wrap">
                        <select
                            ref={isFirst ? firstInputRef as any : undefined}
                            value={values[name] ?? ""}
                            onChange={e => setValue(name, e.target.value)}
                            className="cmd-prompt__select"
                        >
                            <option value="">Select...</option>
                            {arg.enum.map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="cmd-prompt__select-icon" />
                    </div>
                    {error && <span className="cmd-prompt__error"><AlertCircle size={10} /> {error}</span>}
                </div>
            );
        }

        // Boolean — toggle
        if (arg.type === "boolean") {
            return (
                <div key={name} className={`cmd-prompt__field cmd-prompt__field--row${error ? " cmd-prompt__field--error" : ""}`}>
                    <label className="cmd-prompt__label cmd-prompt__label--toggle">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={!!values[name]}
                            className={`cmd-prompt__toggle${values[name] ? " cmd-prompt__toggle--on" : ""}`}
                            onClick={() => setValue(name, !values[name])}
                        >
                            <span className="cmd-prompt__toggle-thumb" />
                        </button>
                        <span>
                            {getArgLabel(name)}
                            {isRequired && <span className="cmd-prompt__required">*</span>}
                        </span>
                    </label>
                    <p className="cmd-prompt__hint">{arg.description}</p>
                    {error && <span className="cmd-prompt__error"><AlertCircle size={10} /> {error}</span>}
                </div>
            );
        }

        // Multi-line text for "object" or long string descriptions
        if (arg.type === "object" || (arg.type === "string" && arg.name.toLowerCase().includes("prompt"))) {
            return (
                <div key={name} className={`cmd-prompt__field${error ? " cmd-prompt__field--error" : ""}`}>
                    <label className="cmd-prompt__label">
                        {getArgLabel(name)}
                        {isRequired && <span className="cmd-prompt__required">*</span>}
                    </label>
                    <p className="cmd-prompt__hint">{arg.description}</p>
                    <textarea
                        ref={isFirst ? firstInputRef as any : undefined}
                        value={values[name] ?? ""}
                        onChange={e => setValue(name, e.target.value)}
                        placeholder={getPlaceholder(arg)}
                        className="cmd-prompt__textarea"
                        rows={3}
                    />
                    {error && <span className="cmd-prompt__error"><AlertCircle size={10} /> {error}</span>}
                </div>
            );
        }

        // Number
        if (arg.type === "number") {
            return (
                <div key={name} className={`cmd-prompt__field${error ? " cmd-prompt__field--error" : ""}`}>
                    <label className="cmd-prompt__label">
                        {getArgLabel(name)}
                        {isRequired && <span className="cmd-prompt__required">*</span>}
                    </label>
                    <p className="cmd-prompt__hint">{arg.description}</p>
                    <input
                        ref={isFirst ? firstInputRef as any : undefined}
                        type="number"
                        value={values[name] ?? ""}
                        onChange={e => setValue(name, e.target.value)}
                        placeholder={getPlaceholder(arg)}
                        className="cmd-prompt__input"
                    />
                    {error && <span className="cmd-prompt__error"><AlertCircle size={10} /> {error}</span>}
                </div>
            );
        }

        // Default: string / array text input
        return (
            <div key={name} className={`cmd-prompt__field${error ? " cmd-prompt__field--error" : ""}`}>
                <label className="cmd-prompt__label">
                    {getArgLabel(name)}
                    {isRequired && <span className="cmd-prompt__required">*</span>}
                </label>
                <p className="cmd-prompt__hint">{arg.description}
                    {arg.type === "array" && <span className="cmd-prompt__hint-badge">comma-separated</span>}
                </p>
                <input
                    ref={isFirst ? firstInputRef as any : undefined}
                    type="text"
                    value={values[name] ?? ""}
                    onChange={e => setValue(name, e.target.value)}
                    placeholder={getPlaceholder(arg)}
                    className="cmd-prompt__input"
                    onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                    }}
                />
                {error && <span className="cmd-prompt__error"><AlertCircle size={10} /> {error}</span>}
            </div>
        );
    };

    /* ─── Layout ─────────────────────────────────────────────────────── */

    return (
        <div className="cmd-prompt__backdrop" onClick={onCancel}>
            <div className="cmd-prompt" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="cmd-prompt__header">
                    <div className="cmd-prompt__header-info">
                        <div className="cmd-prompt__title">
                            <span className="cmd-prompt__slash">/</span>{command.id}
                        </div>
                        <div className="cmd-prompt__desc">{command.description}</div>
                    </div>
                    <button onClick={onCancel} className="cmd-prompt__close"><X size={14} /></button>
                </div>

                {/* Body */}
                <div className="cmd-prompt__body">
                    {!hasArgs && (
                        <div className="cmd-prompt__no-args">
                            This command has no arguments. It will be queued as a job immediately.
                        </div>
                    )}

                    {/* Required fields */}
                    {requiredArgs.length > 0 && (
                        <div className="cmd-prompt__section">
                            {requiredArgs.map(([name, arg], i) => renderField(name, arg, i))}
                        </div>
                    )}

                    {/* Optional fields */}
                    {optionalArgs.length > 0 && (
                        <>
                            <button
                                className="cmd-prompt__optional-toggle"
                                onClick={() => setShowOptional(!showOptional)}
                            >
                                <ChevronDown size={11} className={`cmd-prompt__chevron${showOptional ? " cmd-prompt__chevron--open" : ""}`} />
                                {optionalArgs.length} optional parameter{optionalArgs.length !== 1 ? "s" : ""}
                            </button>
                            {showOptional && (
                                <div className="cmd-prompt__section cmd-prompt__section--optional">
                                    {optionalArgs.map(([name, arg], i) => renderField(name, arg, requiredArgs.length + i))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Validation summary */}
                    {errors.length > 0 && (
                        <div className="cmd-prompt__error-summary">
                            <AlertCircle size={12} />
                            {errors.length} field{errors.length !== 1 ? "s" : ""} need{errors.length === 1 ? "s" : ""} attention
                        </div>
                    )}

                    {/* Dry-run report */}
                    {dryRunReport && (
                        <div className="cmd-prompt__dry-run">
                            <DryRunReport
                                report={dryRunReport}
                                onClose={() => setDryRunReport(null)}
                                onRunForReal={() => {
                                    setDryRunReport(null);
                                    handleSubmit();
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="cmd-prompt__footer">
                    <div className="cmd-prompt__footer-info">
                        Queues as job — runs in background
                    </div>
                    <div className="cmd-prompt__footer-actions">
                        <button onClick={onCancel} className="cmd-prompt__cancel-btn">Cancel</button>
                        <button onClick={handleDryRun} className="cmd-prompt__dryrun-btn">
                            <FlaskConical size={11} /> Test Run
                        </button>
                        <button onClick={handleSubmit} className="cmd-prompt__submit-btn">
                            <Play size={11} /> Queue Job
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

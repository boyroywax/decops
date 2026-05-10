import {
    CheckCircle, Clock, AlertCircle,
    ArrowRight, Loader,
} from "lucide-react";

/** Status icon for a single step */
export function StepStatusIcon({ status }: { status?: string }) {
    if (status === "completed") return <CheckCircle size={13} color="#10b981" />;
    if (status === "failed") return <AlertCircle size={13} color="#ef4444" />;
    if (status === "running") return <Loader size={13} color="#3b82f6" className="actions-monitor__spin" />;
    if (status === "skipped") return <Clock size={13} color="#71717a" />;
    return <Clock size={13} color="#52525b" />;
}

/** Micro progress bar for a single step */
export function StepProgressBar({ status }: { status?: string }) {
    const pct =
        status === "completed" ? 100
        : status === "running" ? 50
        : status === "failed" ? 100
        : status === "skipped" ? 100
        : 0;
    const cls =
        status === "completed" ? "actions-monitor__step-bar--completed"
        : status === "running" ? "actions-monitor__step-bar--running"
        : status === "failed" ? "actions-monitor__step-bar--failed"
        : status === "skipped" ? "actions-monitor__step-bar--skipped"
        : "actions-monitor__step-bar--pending";
    return (
        <div className="actions-monitor__step-bar">
            <div className={`actions-monitor__step-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Single step row — reused in both serial list and parallel group */
export function StepRow({ step, isCurrent }: { step: any; isCurrent?: boolean }) {
    const stepDuration = step.startedAt && step.completedAt
        ? step.completedAt - step.startedAt : null;
    return (
        <div className={`actions-monitor__active-step${isCurrent ? " actions-monitor__active-step--current" : ""}`}>
            <div className="actions-monitor__step-icon"><StepStatusIcon status={step.status} /></div>
            <div className="actions-monitor__step-content">
                <div className="actions-monitor__step-command">
                    <span className="actions-monitor__step-command-slash">/</span>
                    {step.commandId}
                    {step.name && step.name !== step.commandId && (
                        <span style={{ color: "var(--text-ghost)", fontWeight: "normal" }}>— {step.name}</span>
                    )}
                    <span className={`actions-monitor__step-status-badge actions-monitor__step-status-badge--${step.status || 'pending'}`}>
                        {step.status || "pending"}
                    </span>
                    {stepDuration != null && (
                        <span style={{ color: "var(--text-ghost)", fontSize: "var(--text-xs)", marginLeft: 6, fontWeight: "normal" }}>
                            {stepDuration < 1000 ? `${stepDuration}ms` : `${(stepDuration / 1000).toFixed(1)}s`}
                        </span>
                    )}
                </div>
                <StepProgressBar status={step.status} />
                {step.outputMappings && step.outputMappings.length > 0 && (
                    <div className="actions-monitor__step-mappings">
                        {step.outputMappings.map((m: any, mi: number) => (
                            <span key={mi} className="actions-monitor__mapping-badge">
                                <ArrowRight size={9} />{m.target}.{m.targetKey}
                            </span>
                        ))}
                    </div>
                )}
                {step.result && <div className="actions-monitor__step-result">{step.result}</div>}
            </div>
        </div>
    );
}

export type StepNode = { kind: "step"; step: any; idx: number }
             | { kind: "group"; group: { id: string; label: string; stepIds: string[] }; children: any[] };

/** Build a structured list: serial steps interleaved with parallel group containers */
export function buildStepTree(
    steps: any[],
    parallelGroups?: Array<{ id: string; label: string; stepIds: string[] }>
): StepNode[] {
    if (!parallelGroups || parallelGroups.length === 0) {
        return steps.map((s, i) => ({ kind: "step" as const, step: s, idx: i }));
    }
    const groupChildIds = new Set<string>();
    const stepToGroup = new Map<string, { id: string; label: string; stepIds: string[] }>();
    for (const g of parallelGroups) {
        for (const sid of g.stepIds) { groupChildIds.add(sid); stepToGroup.set(sid, g); }
    }
    const insertedGroups = new Set<string>();
    const result: StepNode[] = [];
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (groupChildIds.has(s.id)) {
            const g = stepToGroup.get(s.id)!;
            if (!insertedGroups.has(g.id)) {
                insertedGroups.add(g.id);
                const children = g.stepIds.map(sid => steps.find(st => st.id === sid)).filter(Boolean);
                result.push({ kind: "group", group: g, children });
            }
        } else {
            result.push({ kind: "step", step: s, idx: i });
        }
    }
    return result;
}

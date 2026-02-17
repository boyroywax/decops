
import { Play, Activity, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import type { AutomationDefinition, AutomationRun } from "../../services/automations/types";
import "../../styles/components/automation-card.css";

interface AutomationCardProps {
    automation: AutomationDefinition;
    lastRun?: AutomationRun;
    onRun: (id: string) => void;
    onViewLogs: (id: string) => void;
    isRunning: boolean;
}

export function AutomationCard({ automation, lastRun, onRun, onViewLogs, isRunning }: AutomationCardProps) {
    const stripeClass = isRunning
        ? "automation-card__stripe--running"
        : lastRun?.status === "failed"
            ? "automation-card__stripe--failed"
            : "automation-card__stripe--default";

    const statusColor = lastRun?.status === "completed" ? "#00e5a0" : lastRun?.status === "failed" ? "#ef4444" : "#38bdf8";

    return (
        <div className="automation-card">
            {/* Status Indicator Stripe */}
            <div className={`automation-card__stripe ${stripeClass}`} />

            <div className="automation-card__header">
                <div className="automation-card__info">
                    <div className="automation-card__icon">
                        <GradientIcon icon={Activity} size={20} gradient={["#38bdf8", "#818cf8"]} />
                    </div>
                    <div>
                        <div className="automation-card__name">{automation.name}</div>
                        <div className="automation-card__schedule">{automation.schedule || "Manual trigger only"}</div>
                    </div>
                </div>

                <div className="automation-card__actions">
                    <button
                        onClick={() => onViewLogs(automation.id)}
                        className="automation-card__logs-btn"
                    >
                        Logs
                    </button>
                    <button
                        onClick={() => onRun(automation.id)}
                        disabled={isRunning}
                        className={`automation-card__run-btn ${isRunning ? "automation-card__run-btn--running" : "automation-card__run-btn--ready"}`}
                    >
                        {isRunning ? (
                            <>Running...</>
                        ) : (
                            <><Play size={12} fill="currentColor" /> Run Now</>
                        )}
                    </button>
                </div>
            </div>

            <div className="automation-card__description">
                {automation.description}
            </div>

            {/* Tags */}
            {automation.tags && (
                <div className="automation-card__tags">
                    {automation.tags.map(tag => (
                        <span key={tag} className="automation-card__tag">
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            <div className="automation-card__divider" />

            <div className="automation-card__footer">
                <div className="automation-card__last-run">
                    <Clock size={12} />
                    Last run: {lastRun ? new Date(lastRun.endTime || lastRun.startTime).toLocaleString() : "Never"}
                </div>
                {lastRun && (
                    <div className="automation-card__status" style={{ color: statusColor }}>
                        {lastRun.status === "completed" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        <span className="automation-card__status-label">{lastRun.status}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

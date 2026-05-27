/**
 * ProcessCard — running/queued/awaiting-input job card in the SystemView.
 *
 * §3.3 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { useState } from "react";
import {
    Loader, Pause, Clock, Timer, StopCircle, ChevronDown, ChevronUp,
    Terminal, GitFork, Database, Package, CheckCircle, Layers, FileText,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { CopyableId } from "@/components/shared/CopyableId";
import { StepRow, buildStepTree } from "@/components/actions/MonitorStepTree";
import type { Job } from "@/types";
import { formatDuration } from "./helpers";
import { JobTimeline } from "./JobTimeline";

interface ProcessCardProps {
    job: Job;
    onStop: (id: string) => void;
}

export function ProcessCard({ job, onStop }: ProcessCardProps) {
    const [expanded, setExpanded] = useState(false);
    const hasSteps = job.steps && job.steps.length > 0;
    const stepCount = job.steps?.length || 0;
    const completedSteps = job.steps?.filter(s => s.status === "completed").length || 0;
    const currentIdx = job.currentStepIndex ?? -1;
    const progress = stepCount > 0 ? Math.round((completedSteps / stepCount) * 100) : 0;
    const elapsed = job.startedAt ? Date.now() - job.startedAt : (job.updatedAt && job.createdAt ? job.updatedAt - job.createdAt : null);
    const duration = elapsed ? formatDuration(elapsed) : null;
    const isRunning = job.status === "running";
    const hasArtifacts = job.artifacts && job.artifacts.length > 0;
    const storageKeys = job.storage ? Object.keys(job.storage) : [];
    const deliverables = job.deliverables || [];

    return (
        <div className={`sys-process ${expanded ? "sys-process--expanded" : ""}`}>
            <div className={`sys-process__indicator sys-process__indicator--${job.status}`} />

            <div className="sys-process__body">
                <div className="sys-process__header" onClick={() => setExpanded(!expanded)}>
                    <div className="sys-process__icon">
                        {isRunning ? (
                            <div className="sys-process__spinner">
                                <Loader size={16} />
                            </div>
                        ) : job.status === "awaiting-input" ? (
                            <GradientIcon icon={Pause} size={16} gradient={["#f59e0b", "#fbbf24"]} />
                        ) : (
                            <GradientIcon icon={Clock} size={16} gradient={["#f59e0b", "#fbbf24"]} />
                        )}
                    </div>
                    <div className="sys-process__info">
                        <div className="sys-process__name">
                            {job.type}
                            {job.mode && <span className="sys-process__mode">{job.mode}</span>}
                            {job.dryRun && <span className="sys-process__tag sys-process__tag--dry">dry run</span>}
                        </div>
                        <div className="sys-process__meta">
                            <CopyableId value={job.id} label="ID" truncate={20} />
                            {duration && (
                                <span className="sys-process__duration">
                                    <Timer size={10} /> {duration}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="sys-process__actions">
                        <span className={`sys-process__status sys-process__status--${job.status}`}>
                            {job.status === "awaiting-input" ? "awaiting input" : job.status}
                        </span>
                        {isRunning && (
                            <button
                                className="sys-process__stop-btn"
                                onClick={e => { e.stopPropagation(); onStop(job.id); }}
                                title="Stop"
                            >
                                <StopCircle size={14} />
                            </button>
                        )}
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </div>

                {hasSteps && (
                    <div className="sys-process__progress">
                        <div className="sys-process__progress-bar">
                            <div
                                className={`sys-process__progress-fill${isRunning ? " sys-process__progress-fill--animated" : ""}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="sys-process__progress-label">
                            {completedSteps}/{stepCount} · {progress}%
                        </span>
                    </div>
                )}

                {expanded && (
                    <div className="sys-process__detail">
                        {hasSteps && (() => {
                            const tree = buildStepTree(job.steps!, job.parallelGroups);
                            return (
                                <div className="sys-process__section">
                                    <div className="sys-process__section-title">
                                        <Terminal size={12} /> Steps
                                        {job.parallelGroups && job.parallelGroups.length > 0 && (
                                            <span className="sys-process__badge"><GitFork size={10} /> mixed</span>
                                        )}
                                        {job.mode === "parallel" && !job.parallelGroups?.length && (
                                            <span className="sys-process__badge"><GitFork size={10} /> parallel</span>
                                        )}
                                    </div>
                                    <div className="sys-process__steps">
                                        {tree.map((node, ni) => {
                                            if (node.kind === "step") {
                                                return <StepRow key={node.step.id || ni} step={node.step} isCurrent={node.idx === currentIdx} />;
                                            }
                                            const groupDone = node.children.filter((c: any) => c.status === "completed").length;
                                            const groupTotal = node.children.length;
                                            return (
                                                <div key={node.group.id} className="sys-process__parallel-group">
                                                    <div className="sys-process__parallel-header">
                                                        <GitFork size={11} />
                                                        <span>{node.group.label}</span>
                                                        <span className="sys-process__parallel-count">{groupDone}/{groupTotal}</span>
                                                    </div>
                                                    <div className="sys-process__parallel-children">
                                                        {node.children.map((child: any, ci: number) => (
                                                            <StepRow key={child.id || ci} step={child} />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}

                        {storageKeys.length > 0 && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Database size={12} /> Storage ({storageKeys.length})
                                </div>
                                <div className="sys-process__kv-grid">
                                    {storageKeys.map(key => {
                                        const val = job.storage![key];
                                        const display = typeof val === "string"
                                            ? (val.length > 80 ? val.slice(0, 80) + "…" : val)
                                            : JSON.stringify(val)?.slice(0, 80);
                                        return (
                                            <div key={key} className="sys-process__kv">
                                                <span className="sys-process__kv-key">${key}</span>
                                                <span className="sys-process__kv-val">{display}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {deliverables.length > 0 && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Package size={12} /> Deliverables ({deliverables.length})
                                </div>
                                <div className="sys-process__deliverables">
                                    {deliverables.map(d => {
                                        const populated = !!job.storage?.[`deliverable.${d.key}`];
                                        return (
                                            <div key={d.key} className={`sys-process__deliverable${populated ? " sys-process__deliverable--done" : ""}`}>
                                                {populated ? <CheckCircle size={11} color="#10b981" /> : <Clock size={11} color="#52525b" />}
                                                <span>{d.label}</span>
                                                <span className="sys-process__deliverable-type">{d.type}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {hasArtifacts && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Layers size={12} /> Artifacts ({job.artifacts.length})
                                </div>
                                <div className="sys-process__artifacts">
                                    {job.artifacts.map(a => (
                                        <span key={a.id} className="sys-process__artifact">
                                            <FileText size={10} /> {a.name}
                                            <span className="sys-process__artifact-type">{a.type}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {job.timeline && job.timeline.length > 0 && (
                            <JobTimeline timeline={job.timeline} startedAt={job.startedAt} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

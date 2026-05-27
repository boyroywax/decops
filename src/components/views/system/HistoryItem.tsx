/**
 * HistoryItem — completed/failed job entry for the SystemView history tab.
 *
 * §3.3 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { useState } from "react";
import {
    CheckCircle, AlertCircle, Timer, FileText, ChevronUp, ChevronDown,
    Terminal, GitFork, Layers,
} from "lucide-react";
import { CopyableId } from "@/components/shared/CopyableId";
import { StepRow, buildStepTree } from "@/components/actions/MonitorStepTree";
import type { Job } from "@/types";
import { formatDuration, formatTime } from "./helpers";
import { JobTimeline } from "./JobTimeline";

export function HistoryItem({ job }: { job: Job }) {
    const [expanded, setExpanded] = useState(false);
    const duration = job.startedAt && job.completedAt
        ? formatDuration(job.completedAt - job.startedAt)
        : (job.updatedAt && job.createdAt ? formatDuration(job.updatedAt - job.createdAt) : null);
    const hasSteps = job.steps && job.steps.length > 0;
    const stepsDone = job.steps?.filter(s => s.status === "completed").length || 0;
    const hasArtifacts = job.artifacts && job.artifacts.length > 0;
    const hasTimeline = job.timeline && job.timeline.length > 0;

    return (
        <div className={`sys-history-item ${expanded ? "sys-history-item--expanded" : ""}`}>
            <div className={`sys-history-item__indicator sys-history-item__indicator--${job.status}`} />
            <div className="sys-history-item__body">
                <div className="sys-history-item__header" onClick={() => setExpanded(!expanded)}>
                    <div className="sys-history-item__icon">
                        {job.status === "completed"
                            ? <CheckCircle size={14} color="#10b981" />
                            : <AlertCircle size={14} color="#ef4444" />
                        }
                    </div>
                    <div className="sys-history-item__info">
                        <span className="sys-history-item__name">{job.type}</span>
                        <span className="sys-history-item__time">
                            {formatTime(job.updatedAt)}
                            {duration && <> · <Timer size={10} /> {duration}</>}
                        </span>
                    </div>
                    <div className="sys-history-item__right">
                        {hasSteps && (
                            <span className="sys-history-item__steps">
                                {stepsDone}/{job.steps!.length} steps
                            </span>
                        )}
                        {hasArtifacts && (
                            <span className="sys-history-item__artifact-count">
                                <FileText size={10} /> {job.artifacts.length}
                            </span>
                        )}
                        <span className={`sys-history-item__status sys-history-item__status--${job.status}`}>
                            {job.status}
                        </span>
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                </div>

                {job.result && !expanded && (
                    <div className="sys-history-item__result-preview">{job.result.slice(0, 120)}</div>
                )}

                {expanded && (
                    <div className="sys-process__detail">
                        {job.result && (
                            <div className="sys-history-item__result">{job.result}</div>
                        )}
                        <div className="sys-history-item__id-row">
                            <CopyableId value={job.id} label="Job ID" truncate={32} />
                            <span className="sys-history-item__timestamp">
                                {job.startedAt
                                    ? <>Started {new Date(job.startedAt).toLocaleString()}</>
                                    : <>Created {new Date(job.createdAt).toLocaleString()}</>
                                }
                                {job.completedAt && (
                                    <> · Ended {new Date(job.completedAt).toLocaleTimeString()}</>
                                )}
                            </span>
                        </div>

                        {hasSteps && (() => {
                            const tree = buildStepTree(job.steps!, job.parallelGroups);
                            return (
                                <div className="sys-process__section">
                                    <div className="sys-process__section-title">
                                        <Terminal size={12} /> Steps
                                    </div>
                                    <div className="sys-process__steps">
                                        {tree.map((node, ni) => {
                                            if (node.kind === "step") {
                                                return <StepRow key={node.step.id || ni} step={node.step} />;
                                            }
                                            const groupDone = node.children.filter((c: any) => c.status === "completed").length;
                                            return (
                                                <div key={node.group.id} className="sys-process__parallel-group">
                                                    <div className="sys-process__parallel-header">
                                                        <GitFork size={11} />
                                                        <span>{node.group.label}</span>
                                                        <span className="sys-process__parallel-count">{groupDone}/{node.children.length}</span>
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

                        {hasTimeline && (
                            <JobTimeline timeline={job.timeline!} startedAt={job.startedAt} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

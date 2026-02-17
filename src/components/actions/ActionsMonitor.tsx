import React from "react";
import { useJobsContext } from "../../context/JobsContext";
import { useAutomations } from "../../context/AutomationsContext";
import { AutomationCard } from "../automations/AutomationCard";
import { CheckCircle, Clock, PlayCircle, AlertCircle, Trash2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import "../../styles/components/actions-monitor.css";

export function ActionsMonitor() {
    const { jobs, isPaused, toggleQueuePause } = useJobsContext();
    const { automations, runs, runAutomation, deleteAutomation } = useAutomations();

    const activeJobs = jobs.filter(j => j.status === "queued" || j.status === "running");
    const historyJobs = jobs.filter(j => j.status === "completed" || j.status === "failed").slice(0, 10);

    return (
        <div className="actions-monitor">

            {/* Active Jobs Section */}
            <div>
                <div className="actions-monitor__section-header">
                    <h3 className="actions-monitor__section-title">Active Jobs ({activeJobs.length})</h3>
                    <div className="actions-monitor__controls">
                        <button
                            onClick={toggleQueuePause}
                            className={`actions-monitor__pause-btn ${isPaused ? "actions-monitor__pause-btn--paused" : ""}`}
                        >
                            {isPaused ? "Resume Queue" : "Pause Queue"}
                        </button>
                    </div>
                </div>

                <div className="actions-monitor__job-list">
                    {activeJobs.length === 0 ? (
                        <div className="actions-monitor__empty">
                            No active jobs.
                        </div>
                    ) : (
                        activeJobs.map(job => (
                            <div key={job.id} className="actions-monitor__job-card"
                                style={{ borderLeft: `3px solid ${job.status === 'running' ? '#3b82f6' : '#f59e0b'}` }}>
                                <div>
                                    <div className="actions-monitor__job-type">
                                        {job.type}
                                        <span className="actions-monitor__job-status">{job.status}</span>
                                    </div>
                                    <div className="actions-monitor__job-id">ID: {job.id}</div>
                                </div>
                                {job.status === 'running' && (
                                    <div className="actions-monitor__job-processing">Processing...</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Automations Section */}
            <div>
                <h3 className="actions-monitor__section-title actions-monitor__section-title--spaced">Active Automations</h3>
                <div className="actions-monitor__auto-grid">
                    {automations.map(auto => {
                        const lastRun = runs.find(r => r.automationId === auto.id); // Simple find, ideally sort
                        return (
                            <div key={auto.id} className="actions-monitor__auto-card">
                                <div className="actions-monitor__auto-header">
                                    <span className="actions-monitor__auto-name">{auto.name}</span>
                                    {auto.schedule && <span className="actions-monitor__auto-schedule">{auto.schedule}</span>}
                                </div>
                                <p className="actions-monitor__auto-desc">{auto.description}</p>
                                <div className="actions-monitor__auto-footer">
                                    <div className="actions-monitor__auto-time">
                                        <Clock size={12} />
                                        {lastRun ? new Date(lastRun.startTime).toLocaleTimeString() : "Never run"}
                                    </div>
                                    <button
                                        onClick={() => runAutomation(auto.id)}
                                        className="actions-monitor__auto-action actions-monitor__auto-action--run"
                                    >
                                        <PlayCircle size={14} /> Run Now
                                    </button>
                                    <button
                                        onClick={() => deleteAutomation(auto.id)}
                                        className="actions-monitor__auto-action actions-monitor__auto-action--delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Recent History Section */}
            <div>
                <h3 className="actions-monitor__section-title actions-monitor__section-title--spaced">Recent History</h3>
                <div className="actions-monitor__history-list">
                    {historyJobs.map(job => (
                        <div key={job.id} className="actions-monitor__history-item">
                            <div className="actions-monitor__history-info">
                                {job.status === 'completed' ?
                                    <GradientIcon icon={CheckCircle} size={16} gradient={["#10b981", "#34d399"]} /> :
                                    <GradientIcon icon={AlertCircle} size={16} gradient={["#ef4444", "#f87171"]} />
                                }
                                <div>
                                    <div className="actions-monitor__history-type">{job.type}</div>
                                    <div className="actions-monitor__history-time">{new Date(job.updatedAt).toLocaleTimeString()}</div>
                                </div>
                            </div>
                            <div className="actions-monitor__history-result">
                                {job.result || "No result"}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}

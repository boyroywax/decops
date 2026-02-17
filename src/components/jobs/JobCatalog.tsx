import { Play, Edit, Trash2, Briefcase } from "lucide-react";
import type { JobDefinition } from "../../types";
import "../../styles/components/job-catalog.css";

interface JobCatalogProps {
    jobs: JobDefinition[];
    onRun: (job: JobDefinition) => void;
    onEdit: (job: JobDefinition) => void;
    onDelete: (id: string) => void;
}

export function JobCatalog({ jobs, onRun, onEdit, onDelete }: JobCatalogProps) {
    if (jobs.length === 0) {
        return (
            <div className="job-catalog__empty">
                <Briefcase size={32} className="job-catalog__empty-icon" />
                <div className="job-catalog__empty-title">No Saved Jobs</div>
                <div className="job-catalog__empty-desc">Create a job to save it here for reuse.</div>
            </div>
        );
    }

    return (
        <div className="job-catalog__grid">
            {jobs.map(job => (
                <div key={job.id} className="job-catalog__card">
                    <div className="job-catalog__card-header">
                        <div className="job-catalog__card-info">
                            <div className="job-catalog__icon">
                                <Briefcase size={16} />
                            </div>
                            <div>
                                <div className="job-catalog__name">{job.name}</div>
                                <div className="job-catalog__meta">
                                    <span>{job.steps.length} steps</span>
                                    <span>•</span>
                                    <span className="job-catalog__mode">{job.mode}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="job-catalog__description">
                        {job.description || "No description provided."}
                    </div>

                    <div className="job-catalog__actions">
                        <button
                            onClick={() => onRun(job)}
                            className="btn btn-primary job-catalog__run-btn"
                        >
                            <Play size={12} /> Run
                        </button>
                        <button
                            onClick={() => onEdit(job)}
                            className="btn btn-secondary job-catalog__action-btn"
                            title="Edit"
                        >
                            <Edit size={12} />
                        </button>
                        <button
                            onClick={() => {
                                if (confirm("Are you sure you want to delete this job definition?")) {
                                    onDelete(job.id);
                                }
                            }}
                            className="btn btn-secondary job-catalog__action-btn job-catalog__action-btn--danger"
                            title="Delete"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

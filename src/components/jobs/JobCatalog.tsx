import { Play, Edit, Trash2, Briefcase } from "lucide-react";
import type { JobDefinition } from "../../types";

interface JobCatalogProps {
    jobs: JobDefinition[];
    onRun: (job: JobDefinition) => void;
    onEdit: (job: JobDefinition) => void;
    onDelete: (id: string) => void;
}

export function JobCatalog({ jobs, onRun, onEdit, onDelete }: JobCatalogProps) {
    if (jobs.length === 0) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#52525b" }}>
                <Briefcase size={32} style={{ marginBottom: 16, opacity: 0.5 }} />
                <div style={{ fontSize: 13, fontWeight: 500, color: "#71717a" }}>No Saved Jobs</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Create a job to save it here for reuse.</div>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, padding: 24 }}>
            {jobs.map(job => (
                <div key={job.id} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    transition: "all 0.2s"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 6, background: "rgba(0, 229, 160, 0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#00e5a0"
                            }}>
                                <Briefcase size={16} />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{job.name}</div>
                                <div style={{ fontSize: 10, color: "#71717a", display: "flex", gap: 6 }}>
                                    <span>{job.steps.length} steps</span>
                                    <span>•</span>
                                    <span style={{ textTransform: "capitalize" }}>{job.mode}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ fontSize: 11, color: "#a1a1aa", flex: 1, marginBottom: 16, lineHeight: 1.5, minHeight: 16 }}>
                        {job.description || "No description provided."}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                        <button
                            onClick={() => onRun(job)}
                            className="btn btn-primary"
                            style={{ flex: 1, justifyContent: "center" }}
                        >
                            <Play size={12} style={{ marginRight: 6 }} /> Run
                        </button>
                        <button
                            onClick={() => onEdit(job)}
                            className="btn btn-secondary"
                            style={{ padding: "6px 10px" }}
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
                            className="btn btn-secondary"
                            style={{ padding: "6px 10px", color: "#ef4444" }}
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

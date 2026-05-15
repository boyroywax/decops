import { useState, useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Job, JobStatus, JobArtifact, JobRequest, JobEvent, EntityInput } from "@/types";

/** Push a lifecycle event onto a job's timeline (immutable). */
function pushEvent(existing: JobEvent[] | undefined, event: Omit<JobEvent, "timestamp">): JobEvent[] {
    return [...(existing || []), { ...event, timestamp: Date.now() }];
}

export function useJobs() {
    const [jobs, setJobs] = useLocalStorage<Job[]>("decops_jobs", []);

    const [standaloneArtifacts, setStandaloneArtifacts] = useLocalStorage<JobArtifact[]>("decops_artifacts", []);

    // ── Boot-time reconciliation ─────────────────────────────
    // Jobs marked "running" cannot survive a page reload — the executor's
    // in-memory promise is gone. Without this, any libp2p_*/studio_*/… job
    // stuck "running" at unload time would keep the toolkit `busy` gates
    // permanently true (Start node / identity buttons greyed out forever).
    // Mark them failed once on first mount so the UI is recoverable.
    useEffect(() => {
        setJobs((prev) => {
            const hasStale = prev.some((j) => j.status === "running");
            if (!hasStale) return prev;
            const now = Date.now();
            return prev.map((job) => {
                if (job.status !== "running") return job;
                return {
                    ...job,
                    status: "failed",
                    result: "Interrupted by page reload",
                    pendingPrompt: undefined,
                    updatedAt: now,
                    completedAt: now,
                    timeline: pushEvent(job.timeline, {
                        kind: "failed",
                        label: "Interrupted by page reload",
                    }),
                } as Job;
            });
        });
        // Intentionally run once on mount — setJobs identity is stable from useLocalStorage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addJob = useCallback((jobData: JobRequest) => {
        const now = Date.now();
        const newJob: Job = {
            id: `job-${now}-${Math.random().toString(36).substr(2, 9)}`,
            status: "queued",
            artifacts: [],
            createdAt: now,
            updatedAt: now,
            timeline: [{ timestamp: now, kind: "created", label: `Job created` }],
            ...jobData,
        };
        setJobs((prev) => [newJob, ...prev]);
        return newJob;
    }, []);

    const updateJobStatus = useCallback((id: string, status: JobStatus, result?: string) => {
        setJobs((prev) => prev.map((job) => {
            if (job.id === id) {
                const now = Date.now();
                const kind = status as JobEvent["kind"]; // "completed"|"failed"|"started" etc.
                const duration = (status === "completed" || status === "failed") && job.startedAt
                    ? now - job.startedAt : undefined;
                return {
                    ...job,
                    status,
                    result,
                    updatedAt: now,
                    ...(status === "running" ? { startedAt: job.startedAt || now } : {}),
                    ...(status === "completed" || status === "failed" ? { completedAt: now } : {}),
                    timeline: pushEvent(job.timeline, {
                        kind,
                        label: `Job ${status}`,
                        detail: result?.slice(0, 200),
                        duration,
                    }),
                } as Job;
            }
            return job;
        }));
    }, []);

    const updateJob = useCallback((id: string, updates: Partial<Job>) => {
        setJobs((prev) => prev.map((job) => {
            if (job.id === id) {
                return { ...job, ...updates, updatedAt: Date.now() } as Job;
            }
            return job;
        }));
    }, []);

    const addArtifact = useCallback((jobId: string, artifact: JobArtifact) => {
        const stamped = { ...artifact, createdAt: artifact.createdAt || Date.now(), source: artifact.source || "job" as const };
        setJobs((prev) => prev.map((job) => {
            if (job.id === jobId) {
                return {
                    ...job,
                    artifacts: [...job.artifacts, stamped],
                    updatedAt: Date.now()
                };
            }
            return job;
        }));
    }, []);

    const importArtifact = useCallback((artifact: JobArtifact) => {
        const stamped = { ...artifact, createdAt: artifact.createdAt || Date.now(), source: artifact.source || "import" as const };
        setStandaloneArtifacts(prev => [stamped, ...prev]);
    }, []);

    const updateArtifact = useCallback((id: string, updates: Partial<JobArtifact>) => {
        setStandaloneArtifacts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
        setJobs(prev => prev.map(job => ({
            ...job,
            artifacts: job.artifacts.map(a => a.id === id ? { ...a, ...updates } : a)
        })));
    }, []);

    const removeJob = useCallback((id: string) => {
        setJobs((prev) => prev.filter((job) => job.id !== id));
    }, []);

    const clearJobs = useCallback(() => {
        setJobs([]);
        setStandaloneArtifacts([]);
    }, []);

    const removeArtifact = useCallback((id: string) => {
        setStandaloneArtifacts(prev => prev.filter(a => a.id !== id));
        setJobs(prev => prev.map(job => ({
            ...job,
            artifacts: job.artifacts.filter(a => a.id !== id)
        })));
    }, []);

    const allArtifacts = [
        ...standaloneArtifacts,
        ...jobs.flatMap(j => j.artifacts)
    ].sort((a, b) => {
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const [isPaused, setIsPaused] = useState(false);

    const toggleQueuePause = useCallback(() => {
        setIsPaused(prev => !prev);
    }, []);

    const stopJob = useCallback((id: string) => {
        setJobs(prev => prev.map(job => {
            if (job.id === id && (job.status === "running" || job.status === "awaiting-input")) {
                const now = Date.now();
                return {
                    ...job,
                    status: "failed",
                    result: "Stopped by user",
                    pendingPrompt: undefined,
                    updatedAt: now,
                    completedAt: now,
                    timeline: pushEvent(job.timeline, {
                        kind: "stopped",
                        label: "Stopped by user",
                    }),
                };
            }
            return job;
        }));
    }, []);

    /** Resolve a pending prompt input — fills the input value and re-queues the job */
    const resolvePromptInput = useCallback((jobId: string, inputName: string, value: string) => {
        setJobs(prev => prev.map(job => {
            if (job.id === jobId && job.status === "awaiting-input" && job.pendingPrompt?.inputName === inputName) {
                // Update the input's entityId with the user-provided value
                const updatedInputs = (job.inputs || job.request?.inputDefaults || []).map((inp: EntityInput) =>
                    inp.name === inputName ? { ...inp, entityId: value } : inp
                );
                const now = Date.now();
                return {
                    ...job,
                    status: "queued" as const,
                    inputs: updatedInputs,
                    inputDefaults: updatedInputs,
                    pendingPrompt: undefined,
                    updatedAt: now,
                    timeline: pushEvent(job.timeline, {
                        kind: "input-received",
                        label: `User provided input: ${inputName}`,
                        detail: value.slice(0, 200),
                    }),
                } as Job;
            }
            return job;
        }));
    }, []);

    const reorderJobs = useCallback((fromIndex: number, toIndex: number) => {
        setJobs(prev => {
            // Only reorder queued jobs. We need to find the indices in the full array.
            // Simplified: We'll assume the UI passes indices relative to the *queue* view, 
            // but for safety, let's just reorder the whole array or expect the UI to handle logic?
            // Better: active jobs are at the top usually. 
            // Actually, `jobs` contains history too. 
            // Let's filter for queued/running? No, history is typically at end or filtered out.
            // Reordering usually only applies to "queued" items. "Running" is locked.

            // To be safe and simple: The UI will pass ids or we assume we are moving `jobs[from]` to `jobs[to]`.
            // But if `jobs` has history, indices are messy.
            // Let's change the signature to take IDs if possible, or just reorder the underlying array if the UI shows all.
            // For now, let's implement validation: we find the items and swap them. 

            // Wait, UI Drag and Drop usually gives indices of the *rendered list*.
            // If the rendered list is just `queue`, we need to map that back to the main `jobs` array.
            // Let's keep it simple: `reorderJobs` will accept the new order of IDs for the queue.

            return prev; // Placeholder, see actual logic below
        });
    }, []);

    // Re-implementing reorder correctly based on IDs is safer
    const reorderQueue = useCallback((activeJobIds: string[]) => {
        setJobs(prev => {
            const queueItems = activeJobIds.map(id => prev.find(j => j.id === id)).filter(Boolean) as Job[];
            const nonQueueItems = prev.filter(j => !activeJobIds.includes(j.id));
            // We want to keep the relative order of queue items as passed in `activeJobIds`
            // But we also need to respect that "running" jobs might be in there. 
            // Usually we only reorder "queued" status.

            // Let's just assume `activeJobIds` represents the desired top of the list.
            return [...queueItems, ...nonQueueItems];
        });
    }, []);

    return {
        jobs,
        addJob,
        updateJobStatus,
        addArtifact,
        removeJob,
        clearJobs,
        importArtifact,
        removeArtifact,
        updateArtifact,
        allArtifacts,
        isPaused,
        toggleQueuePause,
        stopJob,
        resolvePromptInput,
        updateJob,
        reorderQueue,
        setJobs,
        setStandaloneArtifacts,
        standaloneArtifacts
    };
}

/**
 * Inferred return type of {@link useJobs}. Use this in components/hooks
 * that accept the jobs object as a prop so we don't propagate `any` —
 * the shape stays in sync with the implementation automatically.
 */
export type UseJobsReturn = ReturnType<typeof useJobs>;

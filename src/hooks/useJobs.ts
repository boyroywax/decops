import { useState, useCallback } from "react";
import type { Job, JobStatus, JobArtifact } from "../types";

export function useJobs() {
    const [jobs, setJobs] = useState<Job[]>([]);

    const [standaloneArtifacts, setStandaloneArtifacts] = useState<JobArtifact[]>([]);

    const addJob = useCallback((jobData: Omit<Job, "id" | "status" | "createdAt" | "updatedAt" | "artifacts">) => {
        const newJob: Job = {
            id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            status: "queued",
            artifacts: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...jobData,
        };
        setJobs((prev) => [newJob, ...prev]);

    }, []);

    const updateJobStatus = useCallback((id: string, status: JobStatus, result?: string) => {
        setJobs((prev) => prev.map((job) => {
            if (job.id === id) {
                return { ...job, status, result, updatedAt: Date.now() };
            }
            return job;
        }));
    }, []);

    const addArtifact = useCallback((jobId: string, artifact: JobArtifact) => {
        setJobs((prev) => prev.map((job) => {
            if (job.id === jobId) {
                return {
                    ...job,
                    artifacts: [...job.artifacts, artifact],
                    updatedAt: Date.now()
                };
            }
            return job;
        }));
    }, []);

    const importArtifact = useCallback((artifact: JobArtifact) => {
        setStandaloneArtifacts(prev => [artifact, ...prev]);
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
        const tsA = parseInt(a.id.split('-')[1] || '0');
        const tsB = parseInt(b.id.split('-')[1] || '0');
        return tsB - tsA;
    });

    const [isPaused, setIsPaused] = useState(false);

    const toggleQueuePause = useCallback(() => {
        setIsPaused(prev => !prev);
    }, []);

    const stopJob = useCallback((id: string) => {
        setJobs(prev => prev.map(job => {
            if (job.id === id && job.status === "running") {
                return { ...job, status: "failed", result: "Stopped by user", updatedAt: Date.now() };
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
        allArtifacts,
        isPaused,
        toggleQueuePause,
        stopJob,
        reorderQueue
    };
}

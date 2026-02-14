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

    return {
        jobs,
        addJob,
        updateJobStatus,
        addArtifact,
        removeJob,
        clearJobs,
        importArtifact,
        removeArtifact,
        allArtifacts
    };
}

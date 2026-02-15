import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { JobDefinition } from "../types";

export function useJobCatalog() {
    const [savedJobs, setSavedJobs] = useLocalStorage<JobDefinition[]>("decops_job_catalog", []);

    const saveJob = useCallback((job: JobDefinition) => {
        setSavedJobs(prev => {
            const exists = prev.find(j => j.id === job.id);
            if (exists) {
                return prev.map(j => j.id === job.id ? { ...job, updatedAt: Date.now() } : j);
            }
            return [...prev, { ...job, createdAt: Date.now(), updatedAt: Date.now() }];
        });
    }, [setSavedJobs]);

    const deleteJob = useCallback((id: string) => {
        setSavedJobs(prev => prev.filter(j => j.id !== id));
    }, [setSavedJobs]);

    return {
        savedJobs,
        saveJob,
        deleteJob
    };
}

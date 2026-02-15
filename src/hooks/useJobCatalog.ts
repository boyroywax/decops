import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { JobDefinition } from "../types";

export function useJobCatalog() {
    const [savedJobs, setSavedJobs] = useLocalStorage<JobDefinition[]>("decops_job_catalog", []);

    const saveJob = useCallback((job: Omit<JobDefinition, "createdAt" | "updatedAt"> & { createdAt?: number }) => {
        setSavedJobs(prev => {
            const existingIndex = prev.findIndex(j => j.id === job.id);
            const now = Date.now();
            const newJob: JobDefinition = {
                ...job,
                createdAt: job.createdAt || now,
                updatedAt: now,
            };

            if (existingIndex >= 0) {
                const newArr = [...prev];
                newArr[existingIndex] = newJob;
                return newArr;
            }
            return [...prev, newJob];
        });
    }, [setSavedJobs]);

    const deleteJob = useCallback((id: string) => {
        setSavedJobs(prev => prev.filter(j => j.id !== id));
    }, [setSavedJobs]);

    const getJob = useCallback((id: string) => {
        return savedJobs.find(j => j.id === id);
    }, [savedJobs]);

    return {
        savedJobs,
        saveJob,
        deleteJob,
        getJob
    };
}

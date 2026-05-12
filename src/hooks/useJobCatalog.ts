import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { JobDefinition } from "@/types";
import { seedCatalogJobs, isSeedJob } from "@/services/jobs/seedCatalog";

export function useJobCatalog() {
    const [userJobs, setUserJobs] = useLocalStorage<JobDefinition[]>("decops_job_catalog", []);

    // Merge seeded (built-in) jobs with user-created jobs.
    // Seed jobs always appear first; user jobs cannot shadow seed IDs.
    const savedJobs = useMemo<JobDefinition[]>(() => {
        const userIds = new Set(userJobs.map(j => j.id));
        const seeds = seedCatalogJobs.filter(s => !userIds.has(s.id));
        return [...seeds, ...userJobs];
    }, [userJobs]);

    const saveJob = useCallback((job: Omit<JobDefinition, "createdAt" | "updatedAt"> & { createdAt?: number }) => {
        setUserJobs(prev => {
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
    }, [setUserJobs]);

    const deleteJob = useCallback((id: string) => {
        // Seed jobs cannot be deleted — they'll re-appear from the seed array
        if (isSeedJob(id)) return;
        setUserJobs(prev => prev.filter(j => j.id !== id));
    }, [setUserJobs]);

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

/** Inferred return type of {@link useJobCatalog}. Prefer this over `any`. */
export type UseJobCatalogReturn = ReturnType<typeof useJobCatalog>;

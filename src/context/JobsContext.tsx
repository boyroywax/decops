import { createContext, useContext, ReactNode } from "react";
import { useJobs } from "../hooks/useJobs";
import type { Job, JobStatus, JobArtifact, JobRequest } from "../types";

// Return type of useJobs hook
type UseJobsReturn = ReturnType<typeof useJobs>;

const JobsContext = createContext<UseJobsReturn | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
    const jobsState = useJobs();

    return (
        <JobsContext.Provider value={jobsState}>
            {children}
        </JobsContext.Provider>
    );
}

export function useJobsContext() {
    const context = useContext(JobsContext);
    if (!context) {
        throw new Error("useJobsContext must be used within a JobsProvider");
    }
    return context;
}

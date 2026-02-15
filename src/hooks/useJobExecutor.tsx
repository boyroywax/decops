import { useEffect, useRef } from "react";
import { Rocket, CheckCircle, XCircle } from "lucide-react";
import { GradientIcon } from "../components/shared/GradientIcon";
import { useNotebook } from "./useNotebook";
import { registry } from "../services/commands/registry";
import type { CommandContext } from "../services/commands/types";
import type { WorkspaceContextType } from "../context/WorkspaceContext";
import type { User } from "../types";

// Define strict types for the complex objects we're passing in
// Ideally these should be exported from their respective hooks, but for now we'll define the shape or use 'any' for the complex rendering hooks if strict types aren't available easily.
// However, we want to maintain type safety.

interface JobExecutorProps {
    jobs: any[]; // useJobs return type
    addJob: any;
    updateJobStatus: any;
    addArtifact: any;
    removeJob: any;
    clearJobs: any;
    allArtifacts: any;
    importArtifact: any;
    removeArtifact: any;
    isPaused: boolean;
    toggleQueuePause: any;

    savedJobs: any[];
    saveJob: any;
    deleteJob: any;

    workspace: WorkspaceContextType;
    user: User | null;

    architect: any; // useArchitect return
    ecosystem: any; // useEcosystem return

    addLog: (log: string) => void;
    addNotebookEntry: (entry: any) => void;
}

export function useJobExecutor({
    jobs,
    addJob,
    updateJobStatus,
    addArtifact,
    removeJob,
    allArtifacts,
    importArtifact,
    removeArtifact,
    isPaused,
    toggleQueuePause,
    savedJobs,
    saveJob,
    deleteJob,
    workspace,
    user,
    architect,
    ecosystem,
    addLog,
    addNotebookEntry
}: JobExecutorProps) {
    const processingRef = useRef(false);

    useEffect(() => {
        const processJobs = async () => {
            if (processingRef.current || isPaused) return;

            const queuedJob = jobs.find((j: any) => j.status === "queued");
            if (queuedJob) {
                processingRef.current = true;
                try {
                    updateJobStatus(queuedJob.id, "running");
                    addNotebookEntry({
                        category: "action",
                        icon: <GradientIcon icon={Rocket} size={16} gradient={["#fbbf24", "#f59e0b"]} />,
                        title: `Job Started: ${queuedJob.type}`,
                        description: `Running command "${queuedJob.type}" (Job ${queuedJob.id.slice(0, 8)}).`,
                        details: { jobId: queuedJob.id, command: queuedJob.type, request: queuedJob.request },
                        tags: ["job", queuedJob.type],
                    });

                    const context: CommandContext = {
                        workspace: {
                            ...workspace,
                            addLog,
                            activeChannel: workspace.activeChannel,
                            setActiveChannel: workspace.setActiveChannel,
                            setActiveChannels: workspace.setActiveChannels
                        },
                        auth: { user },
                        jobs: {
                            addArtifact,
                            removeArtifact,
                            importArtifact,
                            allArtifacts,
                            // Queue Management
                            addJob,
                            removeJob,
                            pauseQueue: () => (!isPaused && toggleQueuePause()),
                            resumeQueue: () => (isPaused && toggleQueuePause()),
                            isPaused,
                            getQueue: () => jobs,
                            // Catalog Management
                            getCatalog: () => savedJobs,
                            saveDefinition: saveJob,
                            deleteDefinition: deleteJob
                        },
                        ecosystem: {
                            ecosystems: ecosystem.ecosystems,
                            bridges: ecosystem.bridges,
                            bridgeMessages: ecosystem.bridgeMessages,
                            setEcosystems: ecosystem.setEcosystems,
                            setBridges: ecosystem.setBridges,
                            setBridgeMessages: ecosystem.setBridgeMessages,
                            setActiveBridges: ecosystem.setActiveBridges,
                            createBridge: ecosystem.createBridge,
                            removeBridge: ecosystem.removeBridge,
                            saveCurrentNetwork: ecosystem.saveCurrentNetwork,
                            loadNetwork: ecosystem.loadNetwork,
                            dissolveNetwork: ecosystem.dissolveNetwork
                        },
                        system: {
                            setApiKey: (key: string) => localStorage.setItem("anthropic_api_key", key),
                            setModel: (model: string) => localStorage.setItem("anthropic_model", model)
                        },
                        architect: {
                            generateNetwork: architect.generateNetwork,
                            deployNetwork: architect.deployNetwork
                        }
                    };

                    let finalResult;

                    if (queuedJob.steps && queuedJob.steps.length > 0) {
                        // Multi-step Job
                        if (queuedJob.mode === "parallel") {
                            const promises = queuedJob.steps.map(async (step: any) => {
                                const res = await registry.execute(step.commandId, step.args, context);
                                return { stepId: step.id, result: res };
                            });
                            await Promise.all(promises);
                            finalResult = "All steps completed";
                        } else {
                            // Serial
                            for (let i = 0; i < queuedJob.steps.length; i++) {
                                const step = queuedJob.steps[i];
                                await registry.execute(step.commandId, step.args, context);
                            }
                            finalResult = "Sequence completed";
                        }
                    } else {
                        // Legacy / Single Command Job
                        finalResult = await registry.execute(queuedJob.type, queuedJob.request, context);
                    }

                    updateJobStatus(queuedJob.id, "completed", typeof finalResult === 'string' ? finalResult : "Done");
                    addNotebookEntry({
                        category: "output",
                        icon: <GradientIcon icon={CheckCircle} size={16} gradient={["#00e5a0", "#10b981"]} />,
                        title: `Job Completed: ${queuedJob.type}`,
                        description: `Job "${queuedJob.type}" finished successfully.`,
                        details: { jobId: queuedJob.id, command: queuedJob.type, result: finalResult },
                        tags: ["job", "success", queuedJob.type],
                    });

                    // Enriched Result Artifact
                    const resultArtifact = {
                        jobId: queuedJob.id,
                        timestamp: Date.now(),
                        status: "success",
                        command: queuedJob.type,
                        data: finalResult || {}
                    };

                    addArtifact(queuedJob.id, {
                        id: `art-${Date.now()}`,
                        type: "json",
                        name: "result.json",
                        content: JSON.stringify(resultArtifact, null, 2)
                    });

                } catch (err: any) {
                    console.error("Job Failed", err);
                    updateJobStatus(queuedJob.id, "failed", err.message || "Unknown error");
                    addNotebookEntry({
                        category: "system",
                        icon: <GradientIcon icon={XCircle} size={16} gradient={["#ef4444", "#dc2626"]} />,
                        title: `Job Failed: ${queuedJob.type}`,
                        description: `Job "${queuedJob.type}" failed: ${err.message || "Unknown error"}.`,
                        details: { jobId: queuedJob.id, command: queuedJob.type, error: err.message },
                        tags: ["job", "error", queuedJob.type],
                    });
                } finally {
                    processingRef.current = false;
                }
            }
        };

        const interval = setInterval(processJobs, 1000); // Check every second (simple polling)
        return () => clearInterval(interval);
    }, [
        jobs, updateJobStatus, workspace, addLog, user, addArtifact, ecosystem, architect,
        addJob, removeJob, importArtifact, removeArtifact, allArtifacts,
        isPaused, toggleQueuePause, savedJobs, saveJob, deleteJob, addNotebookEntry
    ]);
}

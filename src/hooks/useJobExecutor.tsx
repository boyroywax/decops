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
    updateJob?: any; // New prop for detailed updates
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

    setJobs?: any; // [NEW]
    setStandaloneArtifacts?: any; // [NEW]

    workspace: WorkspaceContextType;
    user: User | null;

    architect: any; // useArchitect return
    ecosystem: any; // useEcosystem return

    addLog: (log: string) => void;
    addNotebookEntry: (entry: any) => void;
    addDetail?: any; // metrics or similar
    automations?: any; // Automations context
    workspaceManager?: {
        list: () => any[];
        create: (name: string, description?: string) => Promise<string>;
        switch: (id: string) => Promise<void>;
        delete: (id: string) => Promise<void>;
        currentId: string | null;
    };
}

export function useJobExecutor({
    jobs,
    addJob,
    updateJobStatus,
    updateJob,
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
    setJobs, // [NEW]
    setStandaloneArtifacts, // [NEW]
    clearJobs,
    workspace,
    user,
    architect,
    ecosystem,
    addLog,
    addNotebookEntry,
    automations,
    workspaceManager // [NEW]
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
                            deleteDefinition: deleteJob,
                            // Persistence
                            setJobs,
                            setStandaloneArtifacts,
                            clearJobs
                        },
                        ecosystem: {
                            ecosystem: ecosystem.ecosystem,
                            setEcosystem: ecosystem.setEcosystem,
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
                        },
                        automations: automations || { runAutomation: async () => { }, runs: [] },
                        workspaceManager
                    };

                    let finalResult;

                    if (queuedJob.steps && queuedJob.steps.length > 0) {
                        // Initialize steps status if not present
                        // Usually this would be done on job creation, but let's ensure it here if needed
                        // Actually, we should update the job to "running" state with initial pending status for steps?
                        // For now, tracking execution.

                        // Multi-step Job
                        if (queuedJob.mode === "parallel") {
                            const steps = [...queuedJob.steps];
                            // Mark all running? Or pending? Parallel means all start running.
                            // But we can't update state inside map strictly.
                            // Let's launch them.

                            // Update job to mark all running
                            if (updateJob) {
                                const runningSteps = steps.map((s: any) => ({ ...s, status: 'running' }));
                                updateJob(queuedJob.id, { steps: runningSteps });
                            }

                            const promises = queuedJob.steps.map(async (step: any, idx: number) => {
                                try {
                                    const res = await registry.execute(step.commandId, step.args, context);
                                    if (updateJob) {
                                        // We need latest steps? No, just update this specific step.
                                        // But updateJob merges updates? No, usually it sets the whole object or partial.
                                        // If we update just one step, we need the whole array.
                                        // This is tricky with concurrent updates in parallel mode.
                                        // "updateJob" implementation in useJobs usually updates the whole job object based on ID.
                                        // If we call updateJob multiple times rapidly, we might have race conditions on "prev" state if utilizing functional updates correctly?
                                        // check useJobs: setJobs(prev => prev.map(...))
                                        // It uses functional update, so it's safe IF we use functional update on the specific field properly.
                                        // But updateJob takes `updates: Partial<Job>`.
                                        // `...job, ...updates`.
                                        // If we pass `steps: newSteps`, it replaces steps.
                                        // If parallel tasks finish at different times, we need to read the latest state?
                                        // useJobs doesn't expose a way to "update step N".

                                        // Workaround for parallel:
                                        // Maybe we don't update intermediate "completed" status for parallel steps individually to avoid race condition unless we are careful.
                                        // Or we rely on the fact that `useLocalStorage` might be synchronous enough or batch? No.
                                        // Let's just update all at end? No, user wants progress.

                                        // Better: context.jobs.updateJob is available?
                                        // We passed updateJob to useJobExecutor.
                                        // We can't easily update single array item without reading current state safely.
                                        // BUT `useJobs` `updateJob` implementation:
                                        // setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j))
                                        // This is atomic for the job object.
                                        // But if we do: updateJob(id, { steps: [s1_done, s2_running] })
                                        // AND concurrently: updateJob(id, { steps: [s1_running, s2_done] })
                                        // One will overwrite the other.

                                        // So for parallel, maybe we just mark them all done at the end? 
                                        // OR we accept race conditions for now (UI might flicker).
                                        // OR we implement `updateJobStep` in useJobs?

                                        // Let's implement `updateJobStep` in useJobs would be cleaner but `useJobExecutor` is what I'm editing now.
                                        // I'll stick to Serial updates being safe. Parallel updates might be racy.
                                        // For now, I'll allow parallel race (it's rare they finish exactly same millisecond).

                                        // Re-read current steps from WHERE? `queuedJob` is stale closure?
                                        // Yes `queuedJob` is from `jobs` prop which changes. But inside `useEffect`, `processJobs` closes over `jobs`.
                                        // `processJobs` runs, finds `queuedJob`.
                                        // It starts executing.
                                        // `jobs` updates in background but our `queuedJob` variable is const.

                                        // So we can't reliably update steps incrementally in parallel mode without a better state manager or `updateStep` method.
                                        // Let's revert to tracking locally and then batch update?
                                        // But we want live progress.

                                        // Let's IMPLEMENT `updateJobStep` in `context.jobs`?
                                        // No, I can't easily change `useJobs` without breaking context interface used everywhere.

                                        // I will use `updateJob` to mark complete.
                                        // AND I will try to read fresh state? No easy way.

                                        // Let's just do it for Serial mode properly. Parallel mode might just show all running then all done.
                                    }
                                    return { stepId: step.id, result: res, status: 'completed' };
                                } catch (e: any) {
                                    return { stepId: step.id, error: e.message, status: 'failed' };
                                }
                            });

                            const results = await Promise.all(promises);

                            // Update final state of steps
                            if (updateJob) {
                                const finalSteps = queuedJob.steps.map((s: any) => {
                                    const res = results.find(r => r.stepId === s.id);
                                    return res ? { ...s, result: res.result || res.error, status: res.status } : s;
                                });
                                updateJob(queuedJob.id, { steps: finalSteps });
                            }

                            finalResult = "All steps completed";
                        } else {
                            // Serial - We can update incrementally safely!
                            const steps = [...queuedJob.steps];

                            // Helper for simple condition evaluation
                            const evaluateCondition = (condition: string, context: CommandContext, previousSteps: any[]) => {
                                try {
                                    // Safe(ish) evaluation: we can provide a context with previous results
                                    // e.g. condition: "step1.result === 'success'" or "context.activeChannel"

                                    // Construct an evaluation context
                                    const stepMap = previousSteps.reduce((acc, s) => {
                                        // Use name as identifier if available, else id (shortened?) or index?
                                        // For simplicity, let's allow accessing by index via steps[i] or id
                                        acc[s.id] = s;
                                        if (s.name) acc[s.name] = s;
                                        return acc;
                                    }, {} as any);

                                    // Create a function to evaluate
                                    // eslint-disable-next-line no-new-func
                                    const fn = new Function('steps', 'context', `return ${condition}`);
                                    return fn(stepMap, context);
                                } catch (e) {
                                    console.warn(`Condition evaluation failed: ${condition}`, e);
                                    return false; // Fail safe
                                }
                            };

                            for (let i = 0; i < steps.length; i++) {
                                // Check condition if exists
                                if (steps[i].condition) {
                                    const shouldRun = evaluateCondition(steps[i].condition, context, steps);
                                    if (!shouldRun) {
                                        steps[i] = { ...steps[i], status: 'skipped', result: 'Condition not met' };
                                        if (updateJob) updateJob(queuedJob.id, { steps: [...steps] });
                                        continue;
                                    }
                                }

                                // Mark current running
                                steps[i] = { ...steps[i], status: 'running' };
                                if (updateJob) updateJob(queuedJob.id, { steps: [...steps] });

                                try {
                                    const res = await registry.execute(steps[i].commandId, steps[i].args, context);
                                    steps[i] = { ...steps[i], status: 'completed', result: typeof res === 'string' ? res : JSON.stringify(res) };
                                } catch (e: any) {
                                    steps[i] = { ...steps[i], status: 'failed', result: e.message };
                                    if (updateJob) updateJob(queuedJob.id, { steps: [...steps] });
                                    throw e; // Stop execution
                                }

                                // Update progress
                                if (updateJob) updateJob(queuedJob.id, { steps: [...steps] });
                            }
                            finalResult = "Sequence completed";
                        }
                    } else {
                        // Legacy / Single Command Job
                        finalResult = await registry.execute(queuedJob.type, queuedJob.request, context);
                    }

                    updateJobStatus(queuedJob.id, "completed", typeof finalResult === 'string' ? finalResult : JSON.stringify(finalResult));
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
        isPaused, toggleQueuePause, savedJobs, saveJob, deleteJob, addNotebookEntry, automations
    ]);
}

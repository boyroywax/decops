import { useEffect, useRef } from "react";
import { Rocket, CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useNotebook } from "./useNotebook";
import { registry } from "@/services/commands/registry";
import { resolveToolJob, rejectToolJob } from "@/services/commands/tools";
import { getAgentModel, getCommandModel } from "@/services/ai";
import type { CommandContext } from "@/services/commands/types";
import type { WorkspaceContextType } from "@/context/WorkspaceContext";
import type { User } from "@/types";
import { useStudioContext } from "@/context/StudioContext";
import {
    resolveRefs, applyInputBindings, applyOutputMappings,
    evaluateCondition, getStepContext, executeStepHandler,
    assembleDeliverables, DELIVERABLE_STORAGE_PREFIX,
    type RefContext, type HandlerRefContext,
} from "@/utils/jobRuntime";

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
    updateArtifact: (id: string, updates: Record<string, any>) => void;

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
    updateArtifact,
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
    const processingRef = useRef<Set<string>>(new Set());
    const MAX_CONCURRENT_JOBS = 4;
    const { api: studioApi } = useStudioContext();

    useEffect(() => {
        const processJobs = async () => {
            if (isPaused) return;

            // Find all queued jobs that aren't already being processed
            const queuedJobs = jobs.filter(
                (j: any) => j.status === "queued" && !processingRef.current.has(j.id)
            );
            if (queuedJobs.length === 0) return;

            // Limit concurrent execution
            const slotsAvailable = MAX_CONCURRENT_JOBS - processingRef.current.size;
            if (slotsAvailable <= 0) return;

            const batch = queuedJobs.slice(0, slotsAvailable);

            for (const queuedJob of batch) {
                processingRef.current.add(queuedJob.id);
                // Fire-and-forget: each job runs independently
                (async () => {
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

                    // Initialize shared storage from job's storageDefaults
                    const jobStorage: Record<string, any> = { ...(queuedJob.request?.storageDefaults || queuedJob.storageDefaults || {}) };

                    // Initialize entity input map from job's inputDefaults
                    const inputMap: Record<string, string> = {};
                    const inputDefaults = queuedJob.request?.inputDefaults || queuedJob.inputDefaults || queuedJob.inputs || [];
                    for (const inp of inputDefaults) {
                        if (inp.name && inp.entityId) inputMap[inp.name] = inp.entityId;
                    }

                    // Check for unresolved prompt inputs — pause job and ask user
                    const unresolvedPrompt = inputDefaults.find(
                        (inp: any) => inp.source?.kind === "prompt" && !inp.entityId
                    );
                    if (unresolvedPrompt) {
                        if (updateJob) updateJob(queuedJob.id, {
                            status: "awaiting-input" as any,
                            pendingPrompt: {
                                inputName: unresolvedPrompt.name,
                                promptText: unresolvedPrompt.source?.promptText || `Enter value for "${unresolvedPrompt.name}"`,
                                inputType: unresolvedPrompt.type || "text",
                                options: unresolvedPrompt.options,
                                min: unresolvedPrompt.min,
                                max: unresolvedPrompt.max,
                                step: unresolvedPrompt.step,
                                placeholder: unresolvedPrompt.placeholder,
                            },
                        });
                        addLog(`Job "${queuedJob.type}" is waiting for user input: ${unresolvedPrompt.name}`);
                        processingRef.current.delete(queuedJob.id);
                        return; // Exit — job will resume when user provides input
                    }

                    // Track deliverables produced during execution
                    const producedDeliverables: any[] = [];
                    /** Map of deliverable key → content for $deliverable.key resolution */
                    const deliverableContents: Record<string, any> = {};

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
                            updateArtifact,
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
                            activeNetworkId: ecosystem.activeNetworkId ?? null,
                            setActiveNetworkId: ecosystem.setActiveNetworkId ?? (() => {}),
                            networks: ecosystem.networks,
                            bridges: ecosystem.bridges,
                            bridgeMessages: ecosystem.bridgeMessages,
                            setNetworks: ecosystem.setNetworks,
                            setBridges: ecosystem.setBridges,
                            setBridgeMessages: ecosystem.setBridgeMessages,
                            setActiveBridges: ecosystem.setActiveBridges,
                            createBridge: ecosystem.createBridge,
                            removeBridge: ecosystem.removeBridge,
                            dissolveNetwork: ecosystem.dissolveNetwork
                        },
                        system: {
                            setApiKey: (key: string) => localStorage.setItem("anthropic_api_key", key),
                            setModel: (model: string) => localStorage.setItem("anthropic_model", model),
                            getModelForCommand: (commandId: string) => getCommandModel(commandId),
                            getModelForAgent: (agentId: string) => getAgentModel(agentId),
                        },
                        architect: {
                            generateNetwork: architect.generateNetwork,
                            deployNetwork: architect.deployNetwork
                        },
                        automations: automations || { runAutomation: async () => { }, runs: [] },
                        workspaceManager: workspaceManager as CommandContext['workspaceManager'],
                        studio: studioApi ?? null,
                        storage: jobStorage,
                        addDeliverable: (deliverable) => {
                            // Stage deliverable content into storage for later assembly
                            const storageKey = `${DELIVERABLE_STORAGE_PREFIX}${deliverable.key}`;
                            jobStorage[storageKey] = deliverable.content;
                            deliverableContents[deliverable.key] = deliverable.content;
                            addLog(`Deliverable staged: ${deliverable.name} → storage[${storageKey}]`);
                        },
                    };

                    /** Ref context for $storage / $deliverable / $input resolution */
                    const refs: RefContext = { storage: jobStorage, deliverables: deliverableContents, inputs: inputMap };

                    /** Build a step-scoped context that overrides model resolution if step has modelId */
                    const stepCtxFor = (step: any): CommandContext => getStepContext(step, context);

                    /** Wrapper: sync storage + deliverables into job state alongside step updates */
                    const syncJobState = (updates: Partial<any>) => {
                        if (!updateJob) return;
                        updateJob(queuedJob.id, {
                            ...updates,
                            storage: { ...jobStorage },
                        });
                    };

                    let finalResult;

                    // ═══ DRY-RUN BRANCH ═══
                    // When dryRun is flagged, validate without executing and return report
                    if ((queuedJob as any).dryRun) {
                        let dryRunReport;

                        if (queuedJob.steps && queuedJob.steps.length > 0) {
                            // Multi-step job dry-run
                            const deliverableKeys = (queuedJob.deliverables || []).map((d: any) => d.key);
                            dryRunReport = registry.dryRunJob(
                                queuedJob.steps,
                                queuedJob.mode || 'serial',
                                context,
                                jobStorage,
                                deliverableKeys,
                                inputMap,
                            );
                        } else {
                            // Single command dry-run
                            const cmdResult = registry.dryRun(queuedJob.type, queuedJob.request, context);
                            dryRunReport = {
                                valid: cmdResult.valid,
                                mode: 'single' as const,
                                steps: [{
                                    stepId: 'single',
                                    stepIndex: 0,
                                    commandId: queuedJob.type,
                                    conditionMet: null,
                                    result: cmdResult,
                                }],
                                unresolvedRefs: [],
                                summary: cmdResult.summary,
                                totalChecks: cmdResult.checks.length,
                                passedChecks: cmdResult.checks.filter((c: any) => c.status === 'pass').length,
                                failedChecks: cmdResult.checks.filter((c: any) => c.status === 'fail').length,
                                warningCount: cmdResult.checks.filter((c: any) => c.status === 'warn').length,
                            };
                        }

                        // Store the report as an artifact
                        const reportArtifact = {
                            id: crypto.randomUUID(),
                            name: `Dry Run Report: ${queuedJob.type}`,
                            type: 'json' as const,
                            content: JSON.stringify(dryRunReport, null, 2),
                            tags: ['type:json', 'source:dry-run', `job:${queuedJob.type}`],
                            createdAt: Date.now(),
                            source: 'job' as const,
                        };
                        addArtifact(queuedJob.id, reportArtifact);

                        const status = dryRunReport.valid ? 'completed' : 'failed';
                        const resultSummary = `[DRY RUN] ${dryRunReport.summary}`;
                        updateJobStatus(queuedJob.id, status, resultSummary);

                        addNotebookEntry({
                            category: dryRunReport.valid ? 'output' : 'system',
                            icon: <GradientIcon icon={FlaskConical} size={16} gradient={dryRunReport.valid ? ['#818cf8', '#6366f1'] : ['#ef4444', '#dc2626']} />,
                            title: `Dry Run ${dryRunReport.valid ? 'Passed' : 'Failed'}: ${queuedJob.type}`,
                            description: resultSummary,
                            details: {
                                jobId: queuedJob.id,
                                command: queuedJob.type,
                                passed: dryRunReport.passedChecks,
                                failed: dryRunReport.failedChecks,
                                warnings: dryRunReport.warningCount,
                            },
                            tags: ['job', 'dry-run', queuedJob.type],
                        });

                        // Don't trigger tool job resolution for dry runs
                        processingRef.current.delete(queuedJob.id);
                        return; // Skip actual execution
                    }

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
                                syncJobState({ steps: runningSteps });
                            }

                            const promises = queuedJob.steps.map(async (step: any, idx: number) => {
                                try {
                                    const boundArgs = applyInputBindings(step.args, step.inputBindings, jobStorage, deliverableContents);
                                    const resolvedArgs = resolveRefs(boundArgs, refs);
                                    const stepCtx = stepCtxFor(step);
                                    const res = await registry.execute(step.commandId, resolvedArgs, stepCtx);

                                    // ── onSuccess handler (parallel) ──
                                    if (step.onSuccess) {
                                        const handlerRefs: HandlerRefContext = { ...refs, result: res };
                                        await executeStepHandler(
                                            step.onSuccess, handlerRefs, jobStorage,
                                            (cmdId, args) => registry.execute(cmdId, args, stepCtx),
                                            addLog,
                                        );
                                        // haltAfterSuccess is ignored in parallel mode (all steps already launched)
                                    }

                                    return { stepId: step.id, result: res, status: 'completed', outputMappings: step.outputMappings };
                                } catch (e: any) {
                                    // ── onFailure handler (parallel) ──
                                    let continueFlag = false;
                                    if (step.onFailure) {
                                        const handlerRefs: HandlerRefContext = { ...refs, error: e.message };
                                        const handlerResult = await executeStepHandler(
                                            step.onFailure, handlerRefs, jobStorage,
                                            (cmdId, args) => registry.execute(cmdId, args, stepCtxFor(step)),
                                            addLog,
                                        );
                                        continueFlag = handlerResult.continueOnFailure;
                                    }
                                    // In parallel mode, continueOnFailure marks the step as failed but doesn't abort others
                                    return {
                                        stepId: step.id,
                                        error: e.message,
                                        status: continueFlag ? 'completed' : 'failed',
                                        outputMappings: undefined,
                                        continued: continueFlag,
                                    };
                                }
                            });

                            const results = await Promise.all(promises);

                            // Update final state of steps
                            if (updateJob) {
                                const finalSteps = queuedJob.steps.map((s: any) => {
                                    const res = results.find(r => r.stepId === s.id);
                                    return res ? { ...s, result: res.result || res.error, status: res.status } : s;
                                });
                                syncJobState({ steps: finalSteps });
                            }

                            // Apply output mappings from parallel results
                            for (const r of results) {
                                if (r.status === 'completed' && r.outputMappings && r.result != null) {
                                    applyOutputMappings(r.outputMappings, r.result, jobStorage);
                                }
                            }

                            finalResult = "All steps completed";
                        } else if (queuedJob.mode === "mixed" && queuedJob.parallelGroups && queuedJob.parallelGroups.length > 0) {
                            // ═══ MIXED MODE: serial chain + parallel groups ═══
                            const steps = [...queuedJob.steps];
                            const groups: Array<{ id: string; label: string; stepIds: string[] }> = queuedJob.parallelGroups;
                            const groupChildIds = new Set<string>();
                            const stepToGroup = new Map<string, string>();
                            for (const g of groups) {
                                for (const sid of g.stepIds) {
                                    groupChildIds.add(sid);
                                    stepToGroup.set(sid, g.id);
                                }
                            }

                            // Build serialOrder: step IDs and group IDs in execution order
                            const insertedGroups = new Set<string>();
                            const serialOrder: string[] = [];
                            for (const s of steps) {
                                if (groupChildIds.has(s.id)) {
                                    const gid = stepToGroup.get(s.id)!;
                                    if (!insertedGroups.has(gid)) {
                                        insertedGroups.add(gid);
                                        serialOrder.push(gid); // group placeholder
                                    }
                                } else {
                                    serialOrder.push(s.id);
                                }
                            }

                            // Helper: execute a single step by ID, update its status in the `steps` array
                            const executeStep = async (stepId: string): Promise<{ status: string; result?: string; error?: string }> => {
                                const idx = steps.findIndex(s => s.id === stepId);
                                if (idx < 0) return { status: 'failed', error: `Step ${stepId} not found` };
                                const step = steps[idx];

                                // Condition check
                                if (step.condition) {
                                    if (!evaluateCondition(step.condition, context, steps)) {
                                        steps[idx] = { ...steps[idx], status: 'skipped', result: 'Condition not met' };
                                        syncJobState({ steps: [...steps] });
                                        return { status: 'skipped' };
                                    }
                                }

                                // Mark running
                                steps[idx] = { ...steps[idx], status: 'running' };
                                syncJobState({ steps: [...steps] });

                                try {
                                    const boundArgs = applyInputBindings(step.args, step.inputBindings, jobStorage, deliverableContents);
                                    const resolvedArgs = resolveRefs(boundArgs, refs);
                                    const stepCtx = stepCtxFor(step);
                                    const res = await registry.execute(step.commandId, resolvedArgs, stepCtx);
                                    const resultStr = typeof res === 'string' ? res : JSON.stringify(res);
                                    steps[idx] = { ...steps[idx], status: 'completed', result: resultStr };

                                    // Output mappings
                                    applyOutputMappings(step.outputMappings, res, jobStorage);

                                    // ── onSuccess handler (mixed) ──
                                    if (step.onSuccess) {
                                        const handlerRefs: HandlerRefContext = { ...refs, result: res };
                                        await executeStepHandler(
                                            step.onSuccess, handlerRefs, jobStorage,
                                            (cmdId, a) => registry.execute(cmdId, a, stepCtx),
                                            addLog,
                                        );
                                        // haltAfterSuccess not supported in mixed group children
                                    }

                                    syncJobState({ steps: [...steps] });
                                    return { status: 'completed', result: resultStr };
                                } catch (e: any) {
                                    steps[idx] = { ...steps[idx], status: 'failed', result: e.message };

                                    // ── onFailure handler (mixed) ──
                                    if (step.onFailure) {
                                        const handlerRefs: HandlerRefContext = { ...refs, error: e.message };
                                        const handlerResult = await executeStepHandler(
                                            step.onFailure, handlerRefs, jobStorage,
                                            (cmdId, a) => registry.execute(cmdId, a, stepCtxFor(step)),
                                            addLog,
                                        );
                                        if (handlerResult.continueOnFailure) {
                                            steps[idx] = { ...steps[idx], status: 'completed', result: `[continued] ${e.message}` };
                                            syncJobState({ steps: [...steps] });
                                            return { status: 'completed', result: e.message };
                                        }
                                    }

                                    syncJobState({ steps: [...steps] });
                                    return { status: 'failed', error: e.message };
                                }
                            };

                            // Walk the serial order
                            let mixedFailed = false;
                            for (const nodeId of serialOrder) {
                                if (mixedFailed) break;
                                const group = groups.find(g => g.id === nodeId);
                                if (group) {
                                    // Run all group children in parallel
                                    const childResults = await Promise.all(group.stepIds.map(sid => executeStep(sid)));
                                    if (childResults.some(r => r.status === 'failed')) {
                                        mixedFailed = true;
                                    }
                                } else {
                                    // Serial step
                                    const result = await executeStep(nodeId);
                                    if (result.status === 'failed') {
                                        mixedFailed = true;
                                    }
                                }
                            }

                            if (mixedFailed) throw new Error("One or more steps failed");
                            finalResult = "Sequence completed";
                        } else {
                            // Serial - We can update incrementally safely!
                            const steps = [...queuedJob.steps];

                            for (let i = 0; i < steps.length; i++) {
                                // Check condition if exists
                                if (steps[i].condition) {
                                    if (!evaluateCondition(steps[i].condition, context, steps)) {
                                        steps[i] = { ...steps[i], status: 'skipped', result: 'Condition not met' };
                                        syncJobState({ steps: [...steps] });
                                        continue;
                                    }
                                }

                                // Mark current running
                                steps[i] = { ...steps[i], status: 'running' };
                                syncJobState({ steps: [...steps] });

                                try {
                                    const boundArgs = applyInputBindings(steps[i].args, steps[i].inputBindings, jobStorage, deliverableContents);
                                    const resolvedArgs = resolveRefs(boundArgs, refs);
                                    const stepCtx = stepCtxFor(steps[i]);
                                    const res = await registry.execute(steps[i].commandId, resolvedArgs, stepCtx);
                                    steps[i] = { ...steps[i], status: 'completed', result: typeof res === 'string' ? res : JSON.stringify(res) };

                                    // Apply output mappings
                                    applyOutputMappings(steps[i].outputMappings, res, jobStorage);

                                    // ── onSuccess handler ──
                                    if (steps[i].onSuccess) {
                                        const handlerRefs: HandlerRefContext = { ...refs, result: res };
                                        const handlerResult = await executeStepHandler(
                                            steps[i].onSuccess,
                                            handlerRefs,
                                            jobStorage,
                                            (cmdId, args) => registry.execute(cmdId, args, stepCtxFor(steps[i])),
                                            addLog,
                                        );
                                        if (handlerResult.haltAfterSuccess) {
                                            syncJobState({ steps: [...steps] });
                                            addLog(`Step "${steps[i].name || steps[i].id}" halted job after success.`);
                                            break;
                                        }
                                    }
                                } catch (e: any) {
                                    steps[i] = { ...steps[i], status: 'failed', result: e.message };

                                    // ── onFailure handler ──
                                    if (steps[i].onFailure) {
                                        const handlerRefs: HandlerRefContext = { ...refs, error: e.message };
                                        const handlerResult = await executeStepHandler(
                                            steps[i].onFailure,
                                            handlerRefs,
                                            jobStorage,
                                            (cmdId, args) => registry.execute(cmdId, args, stepCtxFor(steps[i])),
                                            addLog,
                                        );
                                        if (handlerResult.continueOnFailure) {
                                            addLog(`Step "${steps[i].name || steps[i].id}" failed but continuing: ${e.message}`);
                                            syncJobState({ steps: [...steps] });
                                            continue; // Skip throw, proceed to next step
                                        }
                                    }

                                    syncJobState({ steps: [...steps] });
                                    throw e; // Stop execution
                                }

                                // Update progress
                                syncJobState({ steps: [...steps] });
                            }
                            finalResult = "Sequence completed";
                        }
                    } else {
                        // Legacy / Single Command Job
                        finalResult = await registry.execute(queuedJob.type, queuedJob.request, context);
                    }

                    // ═══ DELIVERABLE ASSEMBLY ═══
                    // After all steps complete, assemble declared deliverables from storage
                    const declaredDeliverables = queuedJob.deliverables
                        || queuedJob.request?.deliverables
                        || [];
                    if (declaredDeliverables.length > 0) {
                        addLog(`Assembling ${declaredDeliverables.length} deliverable(s) from storage…`);
                        const assembled = await assembleDeliverables(
                            declaredDeliverables,
                            jobStorage,
                            (cmdId, args) => registry.execute(cmdId, args, context),
                            addLog,
                        );
                        for (const item of assembled) {
                            producedDeliverables.push(item);
                            // Populate deliverableContents for any downstream refs
                            const storageKey = `${DELIVERABLE_STORAGE_PREFIX}${item.key}`;
                            if (storageKey in jobStorage) {
                                deliverableContents[item.key] = jobStorage[storageKey];
                            }
                        }
                        addLog(`Assembly complete: ${assembled.length}/${declaredDeliverables.length} deliverables produced.`);
                    }

                    // Final sync: push storage + deliverables into job state before marking complete
                    syncJobState({ deliverables: producedDeliverables.length > 0 ? producedDeliverables : undefined });

                    updateJobStatus(queuedJob.id, "completed", typeof finalResult === 'string' ? finalResult : JSON.stringify(finalResult));

                    // Signal tool call promise (if this job was created by a tool call)
                    resolveToolJob(queuedJob.id, finalResult);

                    addNotebookEntry({
                        category: "output",
                        icon: <GradientIcon icon={CheckCircle} size={16} gradient={["#00e5a0", "#10b981"]} />,
                        title: `Job Completed: ${queuedJob.type}`,
                        description: `Job "${queuedJob.type}" finished successfully.`,
                        details: { jobId: queuedJob.id, command: queuedJob.type, result: finalResult },
                        tags: ["job", "success", queuedJob.type],
                    });

                } catch (err: any) {
                    console.error("Job Failed", err);
                    updateJobStatus(queuedJob.id, "failed", err.message || "Unknown error");

                    // Signal tool call promise (if this job was created by a tool call)
                    rejectToolJob(queuedJob.id, err.message || "Unknown error");

                    addNotebookEntry({
                        category: "system",
                        icon: <GradientIcon icon={XCircle} size={16} gradient={["#ef4444", "#dc2626"]} />,
                        title: `Job Failed: ${queuedJob.type}`,
                        description: `Job "${queuedJob.type}" failed: ${err.message || "Unknown error"}.`,
                        details: { jobId: queuedJob.id, command: queuedJob.type, error: err.message },
                        tags: ["job", "error", queuedJob.type],
                    });
                } finally {
                    processingRef.current.delete(queuedJob.id);
                }
                })(); // end fire-and-forget IIFE
            } // end for batch
        };

        const interval = setInterval(processJobs, 1000); // Check every second (simple polling)
        return () => clearInterval(interval);
    }, [
        jobs, updateJobStatus, workspace, addLog, user, addArtifact, ecosystem, architect,
        addJob, removeJob, importArtifact, removeArtifact, allArtifacts,
        isPaused, toggleQueuePause, savedJobs, saveJob, deleteJob, addNotebookEntry, automations
    ]);
}

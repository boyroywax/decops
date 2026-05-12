import { useEffect, useRef } from "react";
import { Rocket, CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useNotebook } from "./useNotebook";
import { registry } from "@/services/commands/registry";
import { resolveToolJob, rejectToolJob } from "@/services/commands/tools";
import { getAgentModel, getCommandModel } from "@/services/ai";
import type { CommandContext } from "@/services/commands/types";
import type { WorkspaceContextType } from "@/context/WorkspaceContext";
import type { User, JobEvent, Job, JobArtifact, JobRequest, NotebookEntry, EntityInput } from "@/types";
import type { UseJobsReturn } from "./useJobs";
import type { UseJobCatalogReturn } from "./useJobCatalog";
import type { UseNotebookReturn } from "./useNotebook";
import type { UseEcosystemReturn } from "./useEcosystem";
import type { UseArchitectReturn } from "@/toolkits/architect/hooks/useArchitect";
import type { AutomationRun } from "@/services/automations/types";
import { useStudioContext } from "@/toolkits/studio";
import {
    resolveRefs, applyInputBindings, applyOutputMappings,
    evaluateCondition, getStepContext, executeStepHandler,
    assembleDeliverables, DELIVERABLE_STORAGE_PREFIX,
    type RefContext, type HandlerRefContext,
} from "@/utils/jobRuntime";
import { reserveBatch } from "./jobScheduler";

/** Max number of jobs running concurrently. Exposed for tests. */
export const MAX_CONCURRENT_JOBS = 4;

// Type aliases derived from the source hooks so this file stays in sync
// when those return shapes change. Previously every prop was `any`; the
// derived types catch wiring bugs at compile time and document intent.

/** Job-catalog half of `useJobs` (saved templates, not the live queue). */
interface SavedJobsApi {
    savedJobs: UseJobCatalogReturn["savedJobs"];
    saveJob: UseJobCatalogReturn["saveJob"];
    deleteJob: UseJobCatalogReturn["deleteJob"];
}

interface JobExecutorProps {
    // ── Live queue + job state (from useJobs) ──
    jobs: UseJobsReturn["jobs"];
    addJob: UseJobsReturn["addJob"];
    updateJobStatus: UseJobsReturn["updateJobStatus"];
    updateJob?: UseJobsReturn["updateJob"];
    addArtifact: UseJobsReturn["addArtifact"];
    removeJob: UseJobsReturn["removeJob"];
    clearJobs: UseJobsReturn["clearJobs"];
    allArtifacts: JobArtifact[];
    importArtifact: UseJobsReturn["importArtifact"];
    removeArtifact: UseJobsReturn["removeArtifact"];
    isPaused: boolean;
    toggleQueuePause: UseJobsReturn["toggleQueuePause"];
    updateArtifact: UseJobsReturn["updateArtifact"];

    // ── Saved-job catalog ──
    savedJobs: SavedJobsApi["savedJobs"];
    saveJob: SavedJobsApi["saveJob"];
    deleteJob: SavedJobsApi["deleteJob"];

    // ── Persistence (optional setters used by reset / import flows) ──
    setJobs?: UseJobsReturn["setJobs"];
    setStandaloneArtifacts?: UseJobsReturn["setStandaloneArtifacts"];

    workspace: WorkspaceContextType;
    user: User | null;

    architect: UseArchitectReturn;
    ecosystem: UseEcosystemReturn;

    addLog: (log: string) => void;
    addNotebookEntry: UseNotebookReturn["addEntry"];
    /** Optional metrics/details emitter (UI bookkeeping). */
    addDetail?: (entry: NotebookEntry | Omit<NotebookEntry, "id" | "timestamp">) => void;
    /** Automations context — runner/queue management for automation runs. */
    automations?: {
        runAutomation: (id: string) => Promise<void>;
        runs: AutomationRun[];
    };
    workspaceManager?: CommandContext['workspaceManager'];
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
    const { api: studioApi } = useStudioContext();

    // Live-state refs: jobs run async, so the workspace arrays captured into
    // the per-job CommandContext go stale during multi-step execution.
    // Getters below close over these refs so commands always see fresh state.
    const agentsRef = useRef(workspace.agents);
    const channelsRef = useRef(workspace.channels);
    const groupsRef = useRef(workspace.groups);
    const messagesRef = useRef(workspace.messages);
    useEffect(() => { agentsRef.current = workspace.agents; }, [workspace.agents]);
    useEffect(() => { channelsRef.current = workspace.channels; }, [workspace.channels]);
    useEffect(() => { groupsRef.current = workspace.groups; }, [workspace.groups]);
    useEffect(() => { messagesRef.current = workspace.messages; }, [workspace.messages]);

    useEffect(() => {
        const processJobs = async () => {
            // Atomically reserve a batch — guarantees concurrency invariant
            // even when processJobs is invoked repeatedly within the same tick.
            const batch = reserveBatch(jobs, {
                inFlight: processingRef.current,
                maxConcurrent: MAX_CONCURRENT_JOBS,
                paused: isPaused,
            });
            if (batch.length === 0) return;

            for (const queuedJob of batch) {
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

                    // Initialize shared storage from the request's storageDefaults
                    const jobStorage: Record<string, any> = { ...(queuedJob.request?.storageDefaults || {}) };

                    // Initialize entity input map from the request's inputDefaults
                    const inputMap: Record<string, string> = {};
                    const inputDefaults: EntityInput[] = (queuedJob.request?.inputDefaults || queuedJob.inputs || []) as EntityInput[];
                    for (const inp of inputDefaults) {
                        if (inp.name && inp.entityId) inputMap[inp.name] = inp.entityId;
                    }

                    /** Accumulated timeline events for this job execution */
                    const timelineBuffer: Omit<JobEvent, "timestamp">[] = [];

                    /** Push a timeline event + sync it into job state */
                    const pushTimelineEvent = (event: Omit<JobEvent, "timestamp">) => {
                        timelineBuffer.push(event);
                        if (updateJob) {
                            updateJob(queuedJob.id, {
                                timeline: [...(queuedJob.timeline || [{ timestamp: queuedJob.createdAt, kind: 'created' as const, label: 'Job created' }]), ...timelineBuffer.map(e => ({ ...e, timestamp: Date.now() }))],
                            });
                        }
                    };

                    pushTimelineEvent({ kind: "started", label: "Job started" });

                    // Check for unresolved prompt inputs — pause job and ask user
                    const unresolvedPrompt = inputDefaults.find(
                        (inp: any) => inp.source?.kind === "prompt" && !inp.entityId
                    );
                    if (unresolvedPrompt) {
                        const promptSource = unresolvedPrompt.source;
                        const promptText = promptSource?.kind === "prompt" ? promptSource.promptText : undefined;
                        if (updateJob) updateJob(queuedJob.id, {
                            status: "awaiting-input" as any,
                            pendingPrompt: {
                                inputName: unresolvedPrompt.name,
                                promptText: promptText || `Enter value for "${unresolvedPrompt.name}"`,
                                inputType: unresolvedPrompt.type || "text",
                                options: unresolvedPrompt.options,
                                min: unresolvedPrompt.min,
                                max: unresolvedPrompt.max,
                                step: unresolvedPrompt.step,
                                placeholder: unresolvedPrompt.placeholder,
                            },
                        });
                        pushTimelineEvent({
                            kind: "awaiting-input",
                            label: `Waiting for input: ${unresolvedPrompt.name}`,
                            detail: promptText,
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
                            setActiveChannels: workspace.setActiveChannels,
                            getAgents: () => agentsRef.current,
                            getChannels: () => channelsRef.current,
                            getGroups: () => groupsRef.current,
                            getMessages: () => messagesRef.current,
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
                        automations: automations || { runAutomation: async () => { }, runs: [] as AutomationRun[] },
                        workspaceManager: workspaceManager as CommandContext['workspaceManager'],
                        extensions: { studio: studioApi ?? undefined },
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
                            // dryRunJob only supports serial|parallel — 'mixed' jobs use parallel scheduling.
                            const dryRunMode: 'serial' | 'parallel' =
                                queuedJob.mode === 'parallel' || queuedJob.mode === 'mixed' ? 'parallel' : 'serial';
                            dryRunReport = registry.dryRunJob(
                                queuedJob.steps,
                                dryRunMode,
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

                            // Update job to mark all running with startedAt
                            if (updateJob) {
                                const now = Date.now();
                                const runningSteps = steps.map((s: any) => ({ ...s, status: 'running', startedAt: now }));
                                syncJobState({ steps: runningSteps });
                            }
                            pushTimelineEvent({ kind: "step:started", label: `All ${steps.length} steps started (parallel)` });

                            const promises = queuedJob.steps.map(async (step: any, idx: number) => {
                                const stepStarted = Date.now();
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

                                    return { stepId: step.id, result: res, status: 'completed', outputMappings: step.outputMappings, startedAt: stepStarted, completedAt: Date.now() };
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
                                        startedAt: stepStarted,
                                        completedAt: Date.now(),
                                    };
                                }
                            });

                            const results = await Promise.all(promises);

                            // Update final state of steps with timestamps
                            if (updateJob) {
                                const finalSteps = queuedJob.steps.map((s: any) => {
                                    const res = results.find(r => r.stepId === s.id);
                                    return res ? { ...s, result: res.result || res.error, status: res.status, startedAt: res.startedAt, completedAt: res.completedAt } : s;
                                });
                                syncJobState({ steps: finalSteps });
                            }

                            // Push timeline events for parallel results
                            for (const r of results) {
                                const step = queuedJob.steps.find((s: any) => s.id === r.stepId);
                                const stepName = step?.name || step?.commandId || r.stepId;
                                pushTimelineEvent({
                                    kind: r.status === 'completed' ? 'step:completed' : 'step:failed',
                                    label: `${stepName} ${r.status}`,
                                    stepId: r.stepId,
                                    detail: r.error || (typeof r.result === 'string' ? r.result.slice(0, 120) : undefined),
                                    duration: r.completedAt && r.startedAt ? r.completedAt - r.startedAt : undefined,
                                });
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
                                const stepName = step.name || step.commandId || stepId;

                                // Condition check
                                if (step.condition) {
                                    if (!evaluateCondition(step.condition, context, steps)) {
                                        steps[idx] = { ...steps[idx], status: 'skipped', result: 'Condition not met' };
                                        syncJobState({ steps: [...steps] });
                                        pushTimelineEvent({ kind: 'step:skipped', label: `${stepName} skipped`, stepId, detail: 'Condition not met' });
                                        return { status: 'skipped' };
                                    }
                                }

                                // Mark running
                                const stepStart = Date.now();
                                steps[idx] = { ...steps[idx], status: 'running', startedAt: stepStart };
                                syncJobState({ steps: [...steps] });
                                pushTimelineEvent({ kind: 'step:started', label: `${stepName} started`, stepId });

                                try {
                                    const boundArgs = applyInputBindings(step.args, step.inputBindings, jobStorage, deliverableContents);
                                    const resolvedArgs = resolveRefs(boundArgs, refs);
                                    const stepCtx = stepCtxFor(step);
                                    const res = await registry.execute(step.commandId, resolvedArgs, stepCtx);
                                    const resultStr = typeof res === 'string' ? res : JSON.stringify(res);
                                    steps[idx] = { ...steps[idx], status: 'completed', result: resultStr, completedAt: Date.now() };

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
                                    pushTimelineEvent({ kind: 'step:completed', label: `${stepName} completed`, stepId, duration: Date.now() - stepStart, detail: resultStr.slice(0, 120) });
                                    return { status: 'completed', result: resultStr };
                                } catch (e: any) {
                                    steps[idx] = { ...steps[idx], status: 'failed', result: e.message, completedAt: Date.now() };

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
                                    pushTimelineEvent({ kind: 'step:failed', label: `${stepName} failed`, stepId, duration: Date.now() - stepStart, detail: e.message });
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
                                const stepName = steps[i].name || steps[i].commandId || steps[i].id;
                                // Check condition if exists
                                const stepCondition = steps[i].condition;
                                if (stepCondition) {
                                    if (!evaluateCondition(stepCondition, context, steps)) {
                                        steps[i] = { ...steps[i], status: 'skipped', result: 'Condition not met' };
                                        syncJobState({ steps: [...steps] });
                                        pushTimelineEvent({ kind: 'step:skipped', label: `${stepName} skipped`, stepId: steps[i].id, detail: 'Condition not met' });
                                        continue;
                                    }
                                }

                                // Mark current running
                                const stepStart = Date.now();
                                steps[i] = { ...steps[i], status: 'running', startedAt: stepStart };
                                syncJobState({ steps: [...steps] });
                                pushTimelineEvent({ kind: 'step:started', label: `${stepName} started`, stepId: steps[i].id });

                                try {
                                    const boundArgs = applyInputBindings(steps[i].args, steps[i].inputBindings, jobStorage, deliverableContents);
                                    const resolvedArgs = resolveRefs(boundArgs, refs);
                                    const stepCtx = stepCtxFor(steps[i]);
                                    const res = await registry.execute(steps[i].commandId, resolvedArgs, stepCtx);
                                    steps[i] = { ...steps[i], status: 'completed', result: typeof res === 'string' ? res : JSON.stringify(res), completedAt: Date.now() };

                                    pushTimelineEvent({ kind: 'step:completed', label: `${stepName} completed`, stepId: steps[i].id, duration: Date.now() - stepStart, detail: (typeof res === 'string' ? res : JSON.stringify(res)).slice(0, 120) });

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
                                    steps[i] = { ...steps[i], status: 'failed', result: e.message, completedAt: Date.now() };

                                    pushTimelineEvent({ kind: 'step:failed', label: `${stepName} failed`, stepId: steps[i].id, duration: Date.now() - stepStart, detail: e.message });

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

        // Run immediately on state changes to bypass 1000ms latency
        processJobs();
        const interval = setInterval(processJobs, 1000); // Check every second (simple polling for stalled states)
        return () => clearInterval(interval);
    }, [
        jobs, updateJobStatus, workspace, addLog, user, addArtifact, ecosystem, architect,
        addJob, removeJob, importArtifact, removeArtifact, allArtifacts,
        isPaused, toggleQueuePause, savedJobs, saveJob, deleteJob, addNotebookEntry, automations
    ]);
}

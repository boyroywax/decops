/**
 * Headless job executor — runs a JobDefinition to completion without React context.
 *
 * This is the pure-service counterpart to useJobExecutor.tsx.  The task engine
 * and other non-React callers use `runJob()` to execute multi-step pipelines
 * with full support for:
 *   - serial / parallel / mixed execution modes
 *   - $storage, $deliverable, $input reference resolution
 *   - input bindings and output mappings
 *   - onSuccess / onFailure step handlers
 *   - deliverable assembly after all steps succeed
 *   - step conditions
 *   - per-step model overrides
 *
 * The caller supplies a CommandContext and a set of callbacks for logging
 * and status updates.  The function returns a structured `JobResult`.
 */

import { registry } from "@/services/commands/registry";
import type { CommandContext } from "@/services/commands/types";
import type { JobDefinition, JobStep, JobDeliverable, EntityInput } from "@/types/jobs";
import {
  resolveRefs, applyInputBindings, applyOutputMappings,
  evaluateCondition, getStepContext, executeStepHandler,
  assembleDeliverables, DELIVERABLE_STORAGE_PREFIX,
  type RefContext, type HandlerRefContext,
} from "@/utils/jobRuntime";

// ── Result types ───────────────────────────────────

export type JobStepResult = {
  stepId: string;
  status: "completed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
};

export interface JobResult {
  /** Did all required steps complete successfully? */
  success: boolean;
  /** Human-readable summary */
  summary: string;
  /** Per-step outcomes */
  stepResults: JobStepResult[];
  /** Shared storage after execution (contains inter-step data) */
  storage: Record<string, any>;
  /** Assembled deliverables: [{ key, artifactId }] */
  deliverables: Array<{ key: string; artifactId: string }>;
  /** Error message if the job failed */
  error?: string;
}

// ── Callbacks ──────────────────────────────────────

export interface JobExecutorCallbacks {
  /** Called when a step changes status */
  onStepUpdate?: (stepId: string, status: string, result?: string) => void;
  /** Append to log */
  addLog: (msg: string) => void;
}

// ── Main entry point ───────────────────────────────

/**
 * Execute a JobDefinition to completion.
 *
 * This is a headless (non-React) function that the task engine, automations,
 * or any service-layer caller can `await` to run a full multi-step job pipeline.
 *
 * @param definition  The job definition (steps, mode, deliverables, etc.)
 * @param context     A CommandContext providing workspace, jobs, storage, etc.
 * @param callbacks   Optional callbacks for logging and step status updates
 * @param inputOverrides  Optional entity input values (overrides definition defaults)
 * @returns A structured JobResult
 */
export async function runJob(
  definition: JobDefinition,
  context: CommandContext,
  callbacks?: JobExecutorCallbacks,
  inputOverrides?: Record<string, string>,
): Promise<JobResult> {
  const addLog = callbacks?.addLog ?? (() => {});
  const onStepUpdate = callbacks?.onStepUpdate;

  // Initialize shared storage from job defaults
  const jobStorage: Record<string, any> = {
    ...(definition.storageDefaults || {}),
    ...context.storage,
  };

  // Initialize input map from definition defaults + overrides
  const inputMap: Record<string, string> = {};
  for (const inp of (definition.inputDefaults || [])) {
    if (inp.name && inp.entityId) inputMap[inp.name] = inp.entityId;
  }
  if (inputOverrides) Object.assign(inputMap, inputOverrides);

  // Deliverable content tracking
  const deliverableContents: Record<string, any> = {};

  // Wire up a job-scoped context with shared storage and deliverable staging
  const jobContext: CommandContext = {
    ...context,
    storage: jobStorage,
    addDeliverable: (deliverable) => {
      const storageKey = `${DELIVERABLE_STORAGE_PREFIX}${deliverable.key}`;
      jobStorage[storageKey] = deliverable.content;
      deliverableContents[deliverable.key] = deliverable.content;
      addLog(`Deliverable staged: ${deliverable.name} → storage[${storageKey}]`);
    },
  };

  const refs: RefContext = { storage: jobStorage, deliverables: deliverableContents, inputs: inputMap };
  const stepResults: JobStepResult[] = [];

  try {
    // Choose execution strategy based on mode
    if (definition.mode === "parallel") {
      await executeParallel(definition.steps, jobContext, refs, stepResults, addLog, onStepUpdate);
    } else if (definition.mode === "mixed" && definition.parallelGroups?.length) {
      await executeMixed(definition.steps, definition.parallelGroups, jobContext, refs, stepResults, addLog, onStepUpdate);
    } else {
      await executeSerial(definition.steps, jobContext, refs, stepResults, addLog, onStepUpdate);
    }

    // Check for failures
    const failed = stepResults.filter(r => r.status === "failed");
    if (failed.length > 0) {
      return {
        success: false,
        summary: `${failed.length}/${stepResults.length} steps failed`,
        stepResults,
        storage: jobStorage,
        deliverables: [],
        error: failed.map(f => `${f.stepId}: ${f.error}`).join("; "),
      };
    }

    // ═══ DELIVERABLE ASSEMBLY ═══
    const assembled = await assembleJobDeliverables(
      definition.deliverables || [],
      jobStorage,
      jobContext,
      addLog,
    );

    return {
      success: true,
      summary: `All ${stepResults.length} steps completed`,
      stepResults,
      storage: jobStorage,
      deliverables: assembled,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      summary: `Job failed: ${msg}`,
      stepResults,
      storage: jobStorage,
      deliverables: [],
      error: msg,
    };
  }
}

// ── Serial execution ───────────────────────────────

async function executeSerial(
  steps: JobStep[],
  context: CommandContext,
  refs: RefContext,
  results: JobStepResult[],
  addLog: (msg: string) => void,
  onStepUpdate?: (stepId: string, status: string, result?: string) => void,
): Promise<void> {
  for (const step of steps) {
    // Condition check
    if (step.condition) {
      if (!evaluateCondition(step.condition, context, steps)) {
        results.push({ stepId: step.id, status: "skipped", result: "Condition not met" });
        onStepUpdate?.(step.id, "skipped", "Condition not met");
        continue;
      }
    }

    onStepUpdate?.(step.id, "running");

    try {
      const boundArgs = applyInputBindings(step.args, step.inputBindings, refs.storage, refs.deliverables);
      const resolvedArgs = resolveRefs(boundArgs, refs);
      const stepCtx = getStepContext(step, context);
      const res = await registry.execute(step.commandId, resolvedArgs, stepCtx);
      const resultStr = typeof res === "string" ? res : JSON.stringify(res);

      // Output mappings
      applyOutputMappings(step.outputMappings, res, refs.storage);

      results.push({ stepId: step.id, status: "completed", result: resultStr });
      onStepUpdate?.(step.id, "completed", resultStr);

      // onSuccess handler
      if (step.onSuccess) {
        const handlerRefs: HandlerRefContext = { ...refs, result: res };
        const handlerResult = await executeStepHandler(
          step.onSuccess, handlerRefs, refs.storage,
          (cmdId, args) => registry.execute(cmdId, args, stepCtx),
          addLog,
        );
        if (handlerResult.haltAfterSuccess) {
          addLog(`Step "${step.name || step.id}" halted job after success.`);
          break;
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // onFailure handler
      let continueOnFailure = false;
      if (step.onFailure) {
        const handlerRefs: HandlerRefContext = { ...refs, error: errMsg };
        const handlerResult = await executeStepHandler(
          step.onFailure, handlerRefs, refs.storage,
          (cmdId, args) => registry.execute(cmdId, args, getStepContext(step, context)),
          addLog,
        );
        continueOnFailure = handlerResult.continueOnFailure;
      }

      if (continueOnFailure) {
        addLog(`Step "${step.name || step.id}" failed but continuing: ${errMsg}`);
        results.push({ stepId: step.id, status: "completed", result: `[continued] ${errMsg}` });
        onStepUpdate?.(step.id, "completed", `[continued] ${errMsg}`);
        continue;
      }

      results.push({ stepId: step.id, status: "failed", error: errMsg });
      onStepUpdate?.(step.id, "failed", errMsg);
      throw e; // Stop serial execution
    }
  }
}

// ── Parallel execution ─────────────────────────────

async function executeParallel(
  steps: JobStep[],
  context: CommandContext,
  refs: RefContext,
  results: JobStepResult[],
  addLog: (msg: string) => void,
  onStepUpdate?: (stepId: string, status: string, result?: string) => void,
): Promise<void> {
  const promises = steps.map(async (step) => {
    onStepUpdate?.(step.id, "running");
    try {
      const boundArgs = applyInputBindings(step.args, step.inputBindings, refs.storage, refs.deliverables);
      const resolvedArgs = resolveRefs(boundArgs, refs);
      const stepCtx = getStepContext(step, context);
      const res = await registry.execute(step.commandId, resolvedArgs, stepCtx);

      // Output mappings
      applyOutputMappings(step.outputMappings, res, refs.storage);

      // onSuccess handler (haltAfterSuccess ignored in parallel)
      if (step.onSuccess) {
        const handlerRefs: HandlerRefContext = { ...refs, result: res };
        await executeStepHandler(
          step.onSuccess, handlerRefs, refs.storage,
          (cmdId, args) => registry.execute(cmdId, args, stepCtx),
          addLog,
        );
      }

      return { stepId: step.id, status: "completed" as const, result: typeof res === "string" ? res : JSON.stringify(res) };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      let continueFlag = false;
      if (step.onFailure) {
        const handlerRefs: HandlerRefContext = { ...refs, error: errMsg };
        const handlerResult = await executeStepHandler(
          step.onFailure, handlerRefs, refs.storage,
          (cmdId, args) => registry.execute(cmdId, args, getStepContext(step, context)),
          addLog,
        );
        continueFlag = handlerResult.continueOnFailure;
      }

      return {
        stepId: step.id,
        status: (continueFlag ? "completed" : "failed") as "completed" | "failed",
        error: errMsg,
        result: continueFlag ? `[continued] ${errMsg}` : undefined,
      };
    }
  });

  const outcomes = await Promise.all(promises);
  for (const o of outcomes) {
    results.push(o);
    onStepUpdate?.(o.stepId, o.status, o.result || o.error);
  }
}

// ── Mixed execution ────────────────────────────────

async function executeMixed(
  steps: JobStep[],
  parallelGroups: Array<{ id: string; label: string; stepIds: string[] }>,
  context: CommandContext,
  refs: RefContext,
  results: JobStepResult[],
  addLog: (msg: string) => void,
  onStepUpdate?: (stepId: string, status: string, result?: string) => void,
): Promise<void> {
  const groupChildIds = new Set<string>();
  const stepToGroup = new Map<string, string>();
  for (const g of parallelGroups) {
    for (const sid of g.stepIds) {
      groupChildIds.add(sid);
      stepToGroup.set(sid, g.id);
    }
  }

  // Build serial order: step IDs and group IDs in execution order
  const insertedGroups = new Set<string>();
  const serialOrder: string[] = [];
  for (const s of steps) {
    if (groupChildIds.has(s.id)) {
      const gid = stepToGroup.get(s.id)!;
      if (!insertedGroups.has(gid)) {
        insertedGroups.add(gid);
        serialOrder.push(gid);
      }
    } else {
      serialOrder.push(s.id);
    }
  }

  const stepsById = new Map(steps.map(s => [s.id, s]));

  // Helper: execute a single step
  const executeSingleStep = async (stepId: string): Promise<JobStepResult> => {
    const step = stepsById.get(stepId);
    if (!step) return { stepId, status: "failed", error: `Step ${stepId} not found` };

    if (step.condition && !evaluateCondition(step.condition, context, steps)) {
      return { stepId, status: "skipped", result: "Condition not met" };
    }

    onStepUpdate?.(stepId, "running");

    try {
      const boundArgs = applyInputBindings(step.args, step.inputBindings, refs.storage, refs.deliverables);
      const resolvedArgs = resolveRefs(boundArgs, refs);
      const stepCtx = getStepContext(step, context);
      const res = await registry.execute(step.commandId, resolvedArgs, stepCtx);
      const resultStr = typeof res === "string" ? res : JSON.stringify(res);

      applyOutputMappings(step.outputMappings, res, refs.storage);

      if (step.onSuccess) {
        const handlerRefs: HandlerRefContext = { ...refs, result: res };
        await executeStepHandler(
          step.onSuccess, handlerRefs, refs.storage,
          (cmdId, a) => registry.execute(cmdId, a, stepCtx),
          addLog,
        );
      }

      onStepUpdate?.(stepId, "completed", resultStr);
      return { stepId, status: "completed", result: resultStr };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (step.onFailure) {
        const handlerRefs: HandlerRefContext = { ...refs, error: errMsg };
        const handlerResult = await executeStepHandler(
          step.onFailure, handlerRefs, refs.storage,
          (cmdId, a) => registry.execute(cmdId, a, getStepContext(step, context)),
          addLog,
        );
        if (handlerResult.continueOnFailure) {
          onStepUpdate?.(stepId, "completed", `[continued] ${errMsg}`);
          return { stepId, status: "completed", result: `[continued] ${errMsg}` };
        }
      }

      onStepUpdate?.(stepId, "failed", errMsg);
      return { stepId, status: "failed", error: errMsg };
    }
  };

  // Walk the serial order
  for (const nodeId of serialOrder) {
    const group = parallelGroups.find(g => g.id === nodeId);
    if (group) {
      // Run all group children in parallel
      const childResults = await Promise.all(group.stepIds.map(sid => executeSingleStep(sid)));
      results.push(...childResults);
      if (childResults.some(r => r.status === "failed")) {
        throw new Error("One or more steps failed in parallel group");
      }
    } else {
      // Serial step
      const result = await executeSingleStep(nodeId);
      results.push(result);
      if (result.status === "failed") {
        throw new Error(`Step "${nodeId}" failed: ${result.error}`);
      }
    }
  }
}

// ── Deliverable assembly helper ────────────────────

async function assembleJobDeliverables(
  declaredDeliverables: JobDeliverable[],
  storage: Record<string, any>,
  context: CommandContext,
  addLog: (msg: string) => void,
): Promise<Array<{ key: string; artifactId: string }>> {
  if (declaredDeliverables.length === 0) return [];

  addLog(`Assembling ${declaredDeliverables.length} deliverable(s) from storage…`);
  const assembled = await assembleDeliverables(
    declaredDeliverables,
    storage,
    (cmdId, args) => registry.execute(cmdId, args, context),
    addLog,
  );
  addLog(`Assembly complete: ${assembled.length}/${declaredDeliverables.length} deliverables produced.`);
  return assembled;
}

/**
 * Tool Use Bridge — converts CommandDefinitions to Anthropic tool schemas
 * and queues tool calls as jobs for the job executor.
 *
 * This bridges the existing command system with Anthropic's tool_use API,
 * allowing the AI to natively call any registered command as a tool.
 * Tool calls are routed through the job queue for tracking, artifacts, and notebook logging.
 */

import type { CommandContext } from "./types";
import { registry } from "./registry";
import {
  clearAll,
  resolveToolJob,
  rejectToolJob,
  watchChildJob,
  resolveToolTimeout,
  registerPendingToolJob,
  hasPendingToolJob,
  deletePendingToolJob,
} from "./toolJobRegistry";
import {
  type AnthropicTool,
  type ToolCallResult,
  EXCLUDED_COMMANDS,
  isReadOnlyToolCommand,
  commandToTool,
  capForAnthropic,
  prioritizeToolCommands,
  TOOL_PRIORITY_ORDER,
} from "./toolSchema";
import {
  getAllTools,
  getAllCommandTools,
  getToolsByTags,
  getToolsByToolkitIds,
  getToolsForAgent,
  getCommandIdsForAgent,
  getUnmigratedToolkitsForAgentTools,
} from "./toolSurface";
import { perfLog } from "@/services/perf";

// Re-export for backward compatibility — external callers still import these
// from "@/services/commands/tools". §3.6.
export {
  // toolJobRegistry
  clearAll, resolveToolJob, rejectToolJob, watchChildJob, resolveToolTimeout,
  // toolSchema
  commandToTool, capForAnthropic, prioritizeToolCommands, TOOL_PRIORITY_ORDER,
  // toolSurface
  getAllTools, getAllCommandTools, getToolsByTags, getToolsByToolkitIds,
  getToolsForAgent, getCommandIdsForAgent, getUnmigratedToolkitsForAgentTools,
};
export type { AnthropicTool, ToolCallResult };

// Commands that should execute directly rather than be wrapped in another
// queued job. queue_new_job is already a job factory; create_job is the
// orchestration command itself.
const DIRECT_TOOL_COMMANDS = new Set([
  "queue_new_job",
  "create_job",
  "navigator_start_subgoal",
]);

// Keep chat turns responsive: if a tool-backed job does not finish quickly,
// return a deferred status and let inline job cards track completion.
const TOOL_RESULT_SOFT_WAIT_MS = 1800;

function shouldAutoWrapToolCommand(toolName: string): boolean {
  const def = registry.get(toolName);
  if (!def) return false;
  if (DIRECT_TOOL_COMMANDS.has(toolName)) return false;
  if (def.spawnsChildJobs) return false;
  return !isReadOnlyToolCommand(def);
}

async function settleOrDefer<T>(
  promise: Promise<T>,
  waitMs: number,
  fallback: T,
): Promise<T> {
  let timedOut = false;
  const timer = new Promise<T>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(fallback);
    }, waitMs);
  });
  const result = await Promise.race([promise, timer]);
  return timedOut ? fallback : result;
}

function shouldWaitForDirectToolJobResult(toolName: string): boolean {
  // Orchestration commands spawn jobs that are already tracked by job cards.
  // Waiting here can stall the chat turn for up to the child-job timeout.
  if (toolName === "queue_new_job" || toolName === "create_job") return false;
  return true;
}

// ── Execution ──────────────────────────────────────

/**
 * Execute a tool call by queuing it as a job.
 * The job executor picks it up, runs the command, and resolves the promise.
 * Falls back to direct execution if addJob is unavailable.
 */
export async function executeToolCall(
  toolUseId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  context: CommandContext,
): Promise<ToolCallResult> {
  const start = performance.now();

  try {
    // Safety guard
    if (EXCLUDED_COMMANDS.has(toolName)) {
      throw new Error(`Command "${toolName}" is not available for AI tool use.`);
    }

    // Some orchestration commands should execute directly. In particular,
    // queue_new_job is already a job factory and wrapping it in another job
    // produces redundant single-step jobs around the real work.
    if (DIRECT_TOOL_COMMANDS.has(toolName)) {
      const queued = await registry.execute(toolName, toolInput, context);
      const jobId =
        queued && typeof queued === "object" && "jobId" in (queued as Record<string, unknown>)
          ? String((queued as Record<string, unknown>).jobId)
          : undefined;
      const waitForResult = shouldWaitForDirectToolJobResult(toolName);
      const deferredResult = {
        _deferred: true,
        status: "running",
        jobId,
        success: true,
        message: `[DEFERRED] Job ${jobId?.slice(0, 8)} (command: ${toolName}) was successfully queued and is executing now. This tool call SUCCEEDED — the work is in progress, NOT failed. Do NOT re-issue this command. To check the outcome, call get_job_status with jobId="${jobId}" in a later round, or proceed with the next step of the user's request.`,
      };
      const result = waitForResult && jobId
        ? await settleOrDefer(
          watchChildJob(jobId, resolveToolTimeout(toolName)),
          TOOL_RESULT_SOFT_WAIT_MS,
          deferredResult,
        )
        : (queued ?? { status: "queued", jobId });
      const duration_ms = Math.round(performance.now() - start);
      perfLog("commands.execute_tool_call", {
        toolName,
        mode: waitForResult ? "direct-tool-command" : "direct-tool-command-no-wait",
        durationMs: duration_ms,
        timeoutMs: resolveToolTimeout(toolName),
        hasJobId: !!jobId,
      });
      return {
        tool_use_id: toolUseId,
        name: toolName,
        input: toolInput,
        result: result ?? { success: true },
        duration_ms,
        jobId,
      };
    }

    if (shouldAutoWrapToolCommand(toolName)) {
      const jobRequest = { ...toolInput, _toolUseId: toolUseId };
      const queued = await registry.execute(
        "queue_new_job",
        {
          type: toolName,
          request: jobRequest,
          steps: [{ commandId: toolName, args: jobRequest }],
          mode: "serial",
        },
        context,
      );
      const jobId =
        queued && typeof queued === "object" && "jobId" in (queued as Record<string, unknown>)
          ? String((queued as Record<string, unknown>).jobId)
          : undefined;

      const result = jobId
        ? await settleOrDefer(
          watchChildJob(jobId, resolveToolTimeout(toolName)),
          TOOL_RESULT_SOFT_WAIT_MS,
          {
            _deferred: true,
            status: "running",
            jobId,
            success: true,
            message: `[DEFERRED] Job ${jobId.slice(0, 8)} (command: ${toolName}) was successfully queued and is executing now. This tool call SUCCEEDED — the work is in progress, NOT failed. Do NOT re-issue this command. To check the outcome, call get_job_status with jobId="${jobId}" in a later round, or proceed with the next step of the user's request.`,
          },
        )
        : (queued ?? { status: "queued" });
      const duration_ms = Math.round(performance.now() - start);
      perfLog("commands.execute_tool_call", {
        toolName,
        mode: "auto-wrap",
        durationMs: duration_ms,
        timeoutMs: resolveToolTimeout(toolName),
        hasJobId: !!jobId,
      });
      return {
        tool_use_id: toolUseId,
        name: toolName,
        input: toolInput,
        result: result ?? { success: true },
        duration_ms,
        jobId,
      };
    }

    // Queue the tool call as a job
    const job = context.jobs.addJob({
      type: toolName,
      request: { ...toolInput, _toolUseId: toolUseId },
    });

    const jobId: string | undefined = job?.id;

    if (!jobId) {
      // Fallback: if addJob didn't return a job (shouldn't happen), execute directly
      const result = await registry.execute(toolName, toolInput, context);
      const duration_ms = Math.round(performance.now() - start);
      perfLog("commands.execute_tool_call", {
        toolName,
        mode: "direct-registry-fallback",
        durationMs: duration_ms,
        timeoutMs: resolveToolTimeout(toolName),
        hasJobId: false,
      });
      return {
        tool_use_id: toolUseId,
        name: toolName,
        input: toolInput,
        result: result ?? { success: true },
        duration_ms,
      };
    }

    // Wait for the job executor to complete this job
    const waitForJobResult = new Promise<unknown>((resolve, reject) => {
      registerPendingToolJob(jobId, { resolve, reject });

      // Timeout safety — don't block the tool loop forever.
      // Per-command `timeoutMs` / `spawnsChildJobs` on the CommandDefinition
      // override the default. See `resolveToolTimeout`.
      const timeout = resolveToolTimeout(toolName);
      setTimeout(() => {
        if (hasPendingToolJob(jobId)) {
          deletePendingToolJob(jobId);
          resolve({ _timeout: true, success: true, jobId, message: `[DEFERRED] Job ${jobId.slice(0, 8)} is still executing after ${timeout / 1000}s. This tool call SUCCEEDED — the work is in progress, NOT failed. Do NOT re-issue this command. Call get_job_status with jobId="${jobId}" later to retrieve the final outcome.` });
        }
      }, timeout);
    });
    const result = await settleOrDefer(
      waitForJobResult,
      TOOL_RESULT_SOFT_WAIT_MS,
      {
        _deferred: true,
        status: "running",
        jobId,
        success: true,
        message: `[DEFERRED] Job ${jobId.slice(0, 8)} (command: ${toolName}) was successfully queued and is executing now. This tool call SUCCEEDED — the work is in progress, NOT failed. Do NOT re-issue this command. To check the outcome, call get_job_status with jobId="${jobId}" in a later round, or proceed with the next step of the user's request.`,
      },
    );

    const duration_ms = Math.round(performance.now() - start);
    perfLog("commands.execute_tool_call", {
      toolName,
      mode: "job-bridge",
      durationMs: duration_ms,
      timeoutMs: resolveToolTimeout(toolName),
      hasJobId: !!jobId,
    });

    return {
      tool_use_id: toolUseId,
      name: toolName,
      input: toolInput,
      result: result ?? { success: true },
      duration_ms,
      jobId,
    };
  } catch (err) {
    const duration_ms = Math.round(performance.now() - start);
    const errorMsg = err instanceof Error ? err.message : String(err);
    perfLog("commands.execute_tool_call", {
      toolName,
      mode: "error",
      durationMs: duration_ms,
      timeoutMs: resolveToolTimeout(toolName),
      error: errorMsg,
    });

    return {
      tool_use_id: toolUseId,
      name: toolName,
      input: toolInput,
      result: null,
      error: errorMsg,
      duration_ms,
    };
  }
}

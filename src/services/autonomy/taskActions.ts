/**
 * Action dispatch — runs a list of PlannedActions (job or command).
 *
 * Split from taskEngine.ts per §3.8 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { AgentTask, PlannedAction, TaskResult } from "@/types/autonomy";
import type { CommandContext } from "@/services/commands/types";
import { registry } from "@/services/commands/registry";
import { runJob } from "@/services/jobs/executor";
import { addEvent } from "./taskStore";

export async function executeActions(
  task: AgentTask,
  actions: PlannedAction[],
  context: CommandContext,
): Promise<TaskResult> {
  const jobIds: string[] = [];
  const artifactIds: string[] = [];
  const errors: string[] = [];
  const results: Record<string, any> = {};

  for (const action of actions) {
    try {
      // ── Job action: run a multi-step pipeline via the headless executor ──
      if (action.type === "job") {
        const jobDef = resolveJobDefinition(action, context);
        if (!jobDef) {
          const msg = `Job definition not found for action ${action.order}`;
          if (action.optional) {
            addEvent(task, {
              kind: "action_failed",
              timestamp: new Date().toISOString(),
              agentId: task.assigneeId,
              detail: { type: "job", error: msg, optional: true },
            });
            continue;
          }
          errors.push(msg);
          break;
        }

        addEvent(task, {
          kind: "job_queued",
          timestamp: new Date().toISOString(),
          agentId: task.assigneeId,
          detail: {
            jobName: jobDef.name,
            jobId: jobDef.id,
            stepCount: jobDef.steps.length,
            mode: jobDef.mode,
            reasoning: action.reasoning,
          },
        });

        context.workspace.addLog(
          `📋 [Task] Running job "${jobDef.name}" (${jobDef.steps.length} steps, ${jobDef.mode} mode)`,
        );

        const jobResult = await runJob(jobDef, context, {
          addLog: context.workspace.addLog,
          onStepUpdate: (stepId, status, result) => {
            context.workspace.addLog(`  └─ Step ${stepId}: ${status}${result ? ` — ${result.substring(0, 80)}` : ""}`);
          },
        }, action.jobInputs);

        if (jobResult.success) {
          addEvent(task, {
            kind: "job_completed",
            timestamp: new Date().toISOString(),
            agentId: task.assigneeId,
            detail: {
              jobName: jobDef.name,
              summary: jobResult.summary,
              deliverableCount: jobResult.deliverables.length,
            },
          });

          results[`action_${action.order}`] = {
            type: "job",
            jobName: jobDef.name,
            success: true,
            summary: jobResult.summary,
            deliverables: jobResult.deliverables,
          };

          // Merge job storage back into task workspace
          if (task.workspaceStorage) {
            Object.assign(task.workspaceStorage, jobResult.storage);
          }

          jobIds.push(jobDef.id);
          for (const d of jobResult.deliverables) {
            artifactIds.push(d.artifactId);
          }
        } else {
          addEvent(task, {
            kind: "job_failed",
            timestamp: new Date().toISOString(),
            agentId: task.assigneeId,
            detail: {
              jobName: jobDef.name,
              error: jobResult.error,
              summary: jobResult.summary,
            },
          });

          if (action.optional) continue;
          errors.push(`Job "${jobDef.name}": ${jobResult.error || jobResult.summary}`);
          break;
        }

        continue;
      }

      // ── Command action: run a single command via the registry ──
      // Validate command exists
      const cmd = registry.get(action.commandId);
      if (!cmd) {
        const msg = `Command "${action.commandId}" not found`;
        if (action.optional) {
          addEvent(task, {
            kind: "action_failed",
            timestamp: new Date().toISOString(),
            agentId: task.assigneeId,
            detail: { commandId: action.commandId, error: msg, optional: true },
          });
          continue;
        }
        errors.push(msg);
        addEvent(task, {
          kind: "action_failed",
          timestamp: new Date().toISOString(),
          agentId: task.assigneeId,
          detail: { commandId: action.commandId, error: msg },
        });
        break;
      }

      // Execute command
      const result = await registry.execute(action.commandId, action.args, context);

      addEvent(task, {
        kind: "action_executed",
        timestamp: new Date().toISOString(),
        agentId: task.assigneeId,
        detail: {
          commandId: action.commandId,
          order: action.order,
          reasoning: action.reasoning,
          resultPreview: typeof result === "string"
            ? result.substring(0, 200)
            : JSON.stringify(result).substring(0, 200),
        },
      });

      results[`action_${action.order}`] = result;

      // Track created entities
      if (result?.id) {
        if (action.commandId.includes("artifact")) artifactIds.push(result.id);
        if (action.commandId.includes("job")) jobIds.push(result.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (action.optional) {
        addEvent(task, {
          kind: "action_failed",
          timestamp: new Date().toISOString(),
          agentId: task.assigneeId,
          detail: { commandId: action.commandId, error: msg, optional: true },
        });
        continue;
      }
      errors.push(`${action.commandId}: ${msg}`);
      addEvent(task, {
        kind: "action_failed",
        timestamp: new Date().toISOString(),
        agentId: task.assigneeId,
        detail: { commandId: action.commandId, error: msg },
      });
      break; // Stop on non-optional failure
    }
  }

  return {
    success: errors.length === 0,
    summary: errors.length === 0
      ? `Successfully executed ${actions.length} actions`
      : `Failed: ${errors.join("; ")}`,
    artifactIds,
    jobIds,
    resolvedBy: task.assigneeId,
    data: results,
  };
}

// ── Job definition resolver ────────────────────────

/**
 * Resolve a job definition from a PlannedAction.
 *
 * Sources (in priority order):
 * 1. Inline `action.jobDefinition` — the AI composed a full job definition
 * 2. Catalog lookup via `action.jobDefinitionId` — references a saved definition
 * 3. Fallback: synthesize a single-step job from the action's commandId/args
 */
function resolveJobDefinition(
  action: PlannedAction,
  context: CommandContext,
): import("@/types/jobs").JobDefinition | null {
  // 1. Inline definition
  if (action.jobDefinition) return action.jobDefinition;

  // 2. Catalog lookup
  if (action.jobDefinitionId) {
    const catalog = context.jobs.getCatalog?.() || [];
    const found = catalog.find((d) => d.id === action.jobDefinitionId);
    if (found) return found;
    return null;
  }

  // 3. Synthesize from command
  if (action.commandId) {
    const now = Date.now();
    return {
      id: `synth-${action.commandId}-${now}`,
      name: `Synthesized: ${action.commandId}`,
      description: action.reasoning,
      mode: "serial" as const,
      steps: [{
        id: `step-1`,
        commandId: action.commandId,
        args: action.args,
        name: action.commandId,
      }],
      createdAt: now,
      updatedAt: now,
    };
  }

  return null;
}

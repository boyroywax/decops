/**
 * Tool Use Bridge — converts CommandDefinitions to Anthropic tool schemas
 * and queues tool calls as jobs for the job executor.
 *
 * This bridges the existing command system with Anthropic's tool_use API,
 * allowing the AI to natively call any registered command as a tool.
 * Tool calls are routed through the job queue for tracking, artifacts, and notebook logging.
 */

import type { CommandDefinition, CommandArg, CommandArgType, CommandContext } from "./types";
import { registry } from "./registry";

// ── Anthropic Tool Schema Types ────────────────────

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, AnthropicToolProperty>;
    required: string[];
  };
}

interface AnthropicToolProperty {
  type: string;
  description: string;
  items?: { type: string };
  default?: any;
  enum?: string[];
}

// ── Tool Result ────────────────────────────────────

export interface ToolCallResult {
  tool_use_id: string;
  name: string;
  input: Record<string, any>;
  result: any;
  error?: string;
  duration_ms: number;
  jobId?: string;
}

// ── Pending Tool Job Registry ──────────────────────
// Module-level promise map so the job executor can signal completion
// back to the awaiting tool call.

interface PendingToolJob {
  resolve: (result: any) => void;
  reject: (err: Error) => void;
}

const pendingToolJobs = new Map<string, PendingToolJob>();

const TOOL_JOB_TIMEOUT_MS = 30_000; // 30 second timeout

/** Called by the job executor when a tool-initiated job completes */
export function resolveToolJob(jobId: string, result: any): boolean {
  const pending = pendingToolJobs.get(jobId);
  if (pending) {
    pending.resolve(result);
    pendingToolJobs.delete(jobId);
    return true;
  }
  return false;
}

/** Called by the job executor when a tool-initiated job fails */
export function rejectToolJob(jobId: string, error: string): boolean {
  const pending = pendingToolJobs.get(jobId);
  if (pending) {
    pending.reject(new Error(error));
    pendingToolJobs.delete(jobId);
    return true;
  }
  return false;
}

// ── Type Mapping ───────────────────────────────────

/** Map our CommandArgType to JSON Schema types */
function argTypeToJsonSchema(type: CommandArgType): { type: string; items?: { type: string } } {
  switch (type) {
    case "string":
    case "agent":
    case "channel":
    case "group":
    case "network":
    case "workspace":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      return { type: "array", items: { type: "string" } };
    case "object":
      return { type: "object" };
    default:
      return { type: "string" };
  }
}

/** Add description hints for entity reference types */
function descriptionForType(arg: CommandArg): string {
  let desc = arg.description;
  switch (arg.type) {
    case "agent":
      desc += " (agent ID or name)";
      break;
    case "channel":
      desc += " (channel ID)";
      break;
    case "group":
      desc += " (group ID)";
      break;
    case "network":
      desc += " (network ID)";
      break;
    case "workspace":
      desc += " (workspace ID)";
      break;
  }
  if (arg.defaultValue !== undefined) {
    desc += ` (default: ${JSON.stringify(arg.defaultValue)})`;
  }
  return desc;
}

// ── Commands to exclude from tool use ──────────────
// System/security commands that the AI should not call autonomously

const EXCLUDED_COMMANDS = new Set([
  "set_api_key",       // Security: don't let AI set API keys
  "select_ai_model",   // System: model selection is user-only
  "reset_workspace",   // Danger: full workspace wipe
]);

// ── Conversion ─────────────────────────────────────

/** Convert a single CommandDefinition to an Anthropic tool schema */
export function commandToTool(cmd: CommandDefinition): AnthropicTool {
  const properties: Record<string, AnthropicToolProperty> = {};
  const required: string[] = [];

  for (const [argName, argDef] of Object.entries(cmd.args)) {
    const schema = argTypeToJsonSchema(argDef.type);
    properties[argName] = {
      type: schema.type,
      description: descriptionForType(argDef),
      ...(schema.items ? { items: schema.items } : {}),
      ...(argDef.defaultValue !== undefined ? { default: argDef.defaultValue } : {}),
      ...(argDef.enum ? { enum: argDef.enum } : {}),
    };

    if (argDef.required !== false && argDef.defaultValue === undefined) {
      required.push(argName);
    }
  }

  return {
    name: cmd.id,
    description: cmd.description,
    input_schema: {
      type: "object",
      properties,
      required,
    },
  };
}

/** Convert all registered commands to Anthropic tool schemas */
export function getAllTools(): AnthropicTool[] {
  return registry
    .getAll()
    .filter(cmd => !EXCLUDED_COMMANDS.has(cmd.id) && !cmd.hidden)
    .map(commandToTool);
}

/** Get tools filtered by tags (e.g. only "agent" + "query" tools) */
export function getToolsByTags(tags: string[]): AnthropicTool[] {
  return registry
    .getAll()
    .filter(cmd => !EXCLUDED_COMMANDS.has(cmd.id) && !cmd.hidden)
    .filter(cmd => tags.some(t => cmd.tags.includes(t)))
    .map(commandToTool);
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
  toolInput: Record<string, any>,
  context: CommandContext,
): Promise<ToolCallResult> {
  const start = performance.now();

  try {
    // Safety guard
    if (EXCLUDED_COMMANDS.has(toolName)) {
      throw new Error(`Command "${toolName}" is not available for AI tool use.`);
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
      return {
        tool_use_id: toolUseId,
        name: toolName,
        input: toolInput,
        result: result ?? { success: true },
        duration_ms,
      };
    }

    // Wait for the job executor to complete this job
    const result = await new Promise<any>((resolve, reject) => {
      pendingToolJobs.set(jobId, { resolve, reject });

      // Timeout safety — don't block the tool loop forever
      setTimeout(() => {
        if (pendingToolJobs.has(jobId)) {
          pendingToolJobs.delete(jobId);
          resolve({ _timeout: true, message: `Job ${jobId.slice(0, 8)} is still running after ${TOOL_JOB_TIMEOUT_MS / 1000}s` });
        }
      }, TOOL_JOB_TIMEOUT_MS);
    });

    const duration_ms = Math.round(performance.now() - start);

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

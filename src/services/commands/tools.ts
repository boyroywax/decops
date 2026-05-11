/**
 * Tool Use Bridge — converts CommandDefinitions to Anthropic tool schemas
 * and queues tool calls as jobs for the job executor.
 *
 * This bridges the existing command system with Anthropic's tool_use API,
 * allowing the AI to natively call any registered command as a tool.
 * Tool calls are routed through the job queue for tracking, artifacts, and notebook logging.
 */

import type { CommandDefinition, CommandArg, CommandArgType, CommandContext } from "./types";
import type { Agent } from "@/types";
import { TOOLKITS } from "@/services/toolkits";
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
const JOB_RUNNER_TIMEOUT_MS = 180_000; // 3 minute timeout for commands that spawn child jobs

/** Commands that spawn and wait for child jobs — need longer timeouts */
const JOB_RUNNER_COMMANDS = new Set(["studio_run_job", "studio_create_job"]);

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

/**
 * Watch a child job spawned by a command (e.g. studio_run_job).
 * Returns a Promise that resolves when the child job completes or rejects on failure.
 * The job executor already calls resolveToolJob/rejectToolJob for every job,
 * so registering here piggy-backs on that mechanism.
 */
export function watchChildJob(childJobId: string, timeoutMs = JOB_RUNNER_TIMEOUT_MS): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    pendingToolJobs.set(childJobId, { resolve, reject });
    setTimeout(() => {
      if (pendingToolJobs.has(childJobId)) {
        pendingToolJobs.delete(childJobId);
        resolve({ _childTimeout: true, message: `Child job ${childJobId.slice(0, 12)} is still running after ${timeoutMs / 1000}s. Check the job history for results.` });
      }
    }, timeoutMs);
  });
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

// Anthropic's tools API caps the array at 128 entries. We must keep the
// exposed surface under that ceiling or every chat call rejects with
// `Invalid 'tools': array too long`.
const MAX_ANTHROPIC_TOOLS = 128;

/**
 * Sort + slice a tool list so it fits inside Anthropic's 128-tool ceiling.
 *
 * Priority (kept first):
 *  1. Lower-cardinality / orchestration commands (toolkit + meta).
 *  2. Ecosystem / network / agent / channel / group / message commands.
 *  3. Everything else, by alphabetical id (deterministic).
 *
 * If we still overflow, we drop from the tail and emit a single warning.
 */
function capForAnthropic(cmds: CommandDefinition[]): CommandDefinition[] {
  if (cmds.length <= MAX_ANTHROPIC_TOOLS) return cmds;

  const priorityTag = (c: CommandDefinition): number => {
    const tags = c.tags || [];
    if (tags.includes("toolkit") || tags.includes("meta")) return 0;
    if (
      tags.includes("ecosystem") ||
      tags.includes("network") ||
      tags.includes("agent") ||
      tags.includes("channel") ||
      tags.includes("group") ||
      tags.includes("message")
    ) return 1;
    return 2;
  };

  const sorted = [...cmds].sort((a, b) => {
    const pa = priorityTag(a);
    const pb = priorityTag(b);
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  const kept = sorted.slice(0, MAX_ANTHROPIC_TOOLS);
  const dropped = sorted.slice(MAX_ANTHROPIC_TOOLS).map((c) => c.id);
  // eslint-disable-next-line no-console
  console.warn(
    `[tools] ${cmds.length} commands exceeds Anthropic's ${MAX_ANTHROPIC_TOOLS}-tool limit; dropping ${dropped.length}: ${dropped.join(", ")}`,
  );
  return kept;
}

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
  const cmds = registry
    .getAll()
    .filter(cmd => !EXCLUDED_COMMANDS.has(cmd.id) && !cmd.hidden);
  return capForAnthropic(cmds).map(commandToTool);
}

/** Get tools filtered by tags (e.g. only "agent" + "query" tools) */
export function getToolsByTags(tags: string[]): AnthropicTool[] {
  const cmds = registry
    .getAll()
    .filter(cmd => !EXCLUDED_COMMANDS.has(cmd.id) && !cmd.hidden)
    .filter(cmd => tags.some(t => cmd.tags.includes(t)));
  return capForAnthropic(cmds).map(commandToTool);
}

/**
 * Get tools restricted to the union of the given toolkit IDs' commands,
 * plus a small set of always-available meta commands. Used by the workspace
 * chat to scope the AI's tool surface to whatever the active chat agent
 * declares it needs (keeps the request well under Anthropic's 128 cap and
 * keeps the model focused on relevant tools).
 *
 * If `toolkitIds` is empty/undefined, falls back to `getAllTools()`.
 */
export function getToolsByToolkitIds(toolkitIds: string[] | undefined): AnthropicTool[] {
  if (!toolkitIds || toolkitIds.length === 0) return getAllTools();

  const allowed = new Set<string>();
  for (const id of toolkitIds) {
    const tk = TOOLKITS.find(t => t.id === id);
    if (tk) for (const cmdId of tk.commands) allowed.add(cmdId);
  }

  // Always allow toolkit-management meta commands so the model can ask the
  // operator to enable a missing toolkit instead of failing silently.
  const META_COMMANDS = new Set([
    "enable_toolkit",
    "disable_toolkit",
    "list_agent_toolkits",
    "set_agent_toolkits",
  ]);

  const cmds = registry
    .getAll()
    .filter(cmd =>
      !EXCLUDED_COMMANDS.has(cmd.id) &&
      !cmd.hidden &&
      (allowed.has(cmd.id) || META_COMMANDS.has(cmd.id)),
    );
  return capForAnthropic(cmds).map(commandToTool);
}

/**
 * Get tools filtered by an agent's enabled toolkit bindings.
 *
 * Behavior:
 * - If the agent has NO toolkit bindings (toolkits is empty or undefined),
 *   returns ALL tools (backward-compatible — RBAC is the only gate).
 * - If the agent HAS toolkit bindings, returns ONLY tools whose command IDs
 *   appear in at least one enabled toolkit, PLUS always-available toolkit
 *   management commands (enable_toolkit, disable_toolkit, etc.).
 *
 * This allows fine-grained per-agent command scoping for autonomous tasks.
 */
export function getToolsForAgent(agent: Agent): AnthropicTool[] {
  const bindings = agent.toolkits;

  // No bindings → backward-compatible: all tools available (gated by RBAC only)
  if (!bindings || bindings.length === 0) {
    return getAllTools();
  }

  // Build set of allowed command IDs from enabled toolkits
  const allowedCommands = new Set<string>();

  for (const binding of bindings) {
    const toolkit = TOOLKITS.find(t => t.id === binding.toolkitId);
    if (toolkit) {
      for (const cmdId of toolkit.commands) {
        allowedCommands.add(cmdId);
      }
    }
  }

  // Always allow meta-commands for toolkit management and introspection
  const META_COMMANDS = new Set([
    "enable_toolkit",
    "disable_toolkit",
    "list_agent_toolkits",
    "set_agent_toolkits",
  ]);

  const cmds = registry
    .getAll()
    .filter(cmd =>
      !EXCLUDED_COMMANDS.has(cmd.id) &&
      !cmd.hidden &&
      (allowedCommands.has(cmd.id) || META_COMMANDS.has(cmd.id)),
    );
  return capForAnthropic(cmds).map(commandToTool);
}

/**
 * Get the set of allowed command IDs for an agent based on toolkit bindings.
 * Returns null if the agent has no bindings (meaning all commands are allowed).
 */
export function getCommandIdsForAgent(agent: Agent): Set<string> | null {
  const bindings = agent.toolkits;
  if (!bindings || bindings.length === 0) return null;

  const allowed = new Set<string>();
  for (const binding of bindings) {
    const toolkit = TOOLKITS.find(t => t.id === binding.toolkitId);
    if (toolkit) {
      for (const cmdId of toolkit.commands) {
        allowed.add(cmdId);
      }
    }
  }
  return allowed;
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
      // Job-running commands get a longer timeout since they wait for child jobs
      const timeout = JOB_RUNNER_COMMANDS.has(toolName) ? JOB_RUNNER_TIMEOUT_MS : TOOL_JOB_TIMEOUT_MS;
      setTimeout(() => {
        if (pendingToolJobs.has(jobId)) {
          pendingToolJobs.delete(jobId);
          resolve({ _timeout: true, message: `Job ${jobId.slice(0, 8)} is still running after ${timeout / 1000}s` });
        }
      }, timeout);
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

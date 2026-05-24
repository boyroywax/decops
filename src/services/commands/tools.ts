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
  default?: unknown;
  enum?: string[];
}

// ── Tool Result ───────────────────────────────────────

export interface ToolCallResult {
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  error?: string;
  duration_ms: number;
  jobId?: string;
}

// ── Pending Tool Job Registry ──────────────────────
// Module-level promise map so the job executor can signal completion
// back to the awaiting tool call.

interface PendingToolJob {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

const pendingToolJobs = new Map<string, PendingToolJob>();

const TOOL_JOB_TIMEOUT_MS = 12_000; // 12s default — most non-child-job commands complete in <2s; long-running ones declare spawnsChildJobs or timeoutMs
const JOB_RUNNER_TIMEOUT_MS = 180_000; // 3 minute default for commands that spawn child jobs
const DIRECT_TOOL_COMMANDS = new Set([
  "queue_new_job",
  "create_job",
]);
const TOOL_PRIORITY_ORDER = [
  "create_job",
  "list_available_commands",
  "get_command_schema",
  "list_toolkits",
  "queue_new_job",
  "list_queued_jobs",
  "delete_queued_job",
  "studio_create_job",
  "studio_run_job",
];

/**
 * The curated default tool surface. Every agent sees these tools, regardless
 * of toolkit bindings. Agents discover other commands through
 * `list_available_commands` and execute them via `create_job`, which keeps
 * the LLM-facing tool count tiny (well under Anthropic's 128-tool cap) while
 * preserving full access to the registry.
 */
const DEFAULT_AGENT_TOOL_IDS = new Set<string>([
  // Meta / orchestration
  "create_job",
  "list_available_commands",
  "get_command_schema",
  // Workspace inspectors
  "list_toolkits",
  "list_agents",
  "list_channels",
  "list_queued_jobs",
  // Toolkit management (always available so the model can request capability changes)
  "list_agent_toolkits",
  "set_agent_toolkits",
  "enable_toolkit",
  "disable_toolkit",
]);

/**
 * Pick the tool-call wait timeout for a given command.
 *
 * Resolution order:
 *   1. Explicit `command.timeoutMs` on the definition.
 *   2. `JOB_RUNNER_TIMEOUT_MS` when the definition sets `spawnsChildJobs`.
 *   3. `TOOL_JOB_TIMEOUT_MS` otherwise.
 *
 * Falls back to the short timeout if the command id is unknown (the
 * registry only knows about installed commands, but the tool adapter
 * receives whatever the LLM tries to call).
 *
 * Exported for testing.
 */
export function resolveToolTimeout(toolName: string): number {
  const def = registry.get(toolName);
  if (def?.timeoutMs != null) return def.timeoutMs;
  if (def?.spawnsChildJobs) return JOB_RUNNER_TIMEOUT_MS;
  return TOOL_JOB_TIMEOUT_MS;
}

/** Called by the job executor when a tool-initiated job completes */
export function resolveToolJob(jobId: string, result: unknown): boolean {
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
export function watchChildJob(childJobId: string, timeoutMs = JOB_RUNNER_TIMEOUT_MS): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
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

function prioritizeToolCommands(cmds: CommandDefinition[]): CommandDefinition[] {
  return [...cmds].sort((a, b) => {
    const aIndex = TOOL_PRIORITY_ORDER.indexOf(a.id);
    const bIndex = TOOL_PRIORITY_ORDER.indexOf(b.id);
    const aPriority = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bPriority = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.id.localeCompare(b.id);
  });
}

function isReadOnlyToolCommand(cmd: CommandDefinition): boolean {
  const tags = new Set(cmd.tags || []);
  return tags.has("query") || tags.has("read") || tags.has("inspect");
}

function shouldAutoWrapToolCommand(toolName: string): boolean {
  const def = registry.get(toolName);
  if (!def) return false;
  if (DIRECT_TOOL_COMMANDS.has(toolName)) return false;
  if (def.spawnsChildJobs) return false;
  return !isReadOnlyToolCommand(def);
}

async function queueJobAndWait(
  jobType: string,
  jobRequest: Record<string, unknown>,
  context: CommandContext,
  timeoutMs: number,
): Promise<{ jobId?: string; result: unknown }> {
  const queued = await registry.execute(
    "queue_new_job",
    {
      type: jobType,
      request: jobRequest,
      steps: [{ commandId: jobType, args: jobRequest }],
      mode: "serial",
    },
    context,
  );

  const jobId =
    queued && typeof queued === "object" && "jobId" in (queued as Record<string, unknown>)
      ? String((queued as Record<string, unknown>).jobId)
      : undefined;

  if (!jobId) {
    return { jobId: undefined, result: queued ?? { success: true } };
  }

  const result = await watchChildJob(jobId, timeoutMs);
  return { jobId, result };
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

/**
 * Convert every registered command to an Anthropic tool schema.
 *
 * This returns the full command surface and is intended for callers that
 * need to look up specific commands (e.g. specialised toolkit bots that
 * filter by a known command-id set). Most AI-facing call-sites should use
 * `getAllTools()` (curated default surface) or `getToolsForAgent()` instead.
 */
export function getAllCommandTools(): AnthropicTool[] {
  const cmds = registry
    .getAll()
    .filter(cmd => !EXCLUDED_COMMANDS.has(cmd.id) && !cmd.hidden);
  return capForAnthropic(prioritizeToolCommands(cmds)).map(commandToTool);
}

/**
 * Return the curated DEFAULT tool surface for AI agents — the small set of
 * always-available meta-tools, inspectors, and toolkit-management commands.
 *
 * Agents should use `create_job` (with `list_available_commands` /
 * `get_command_schema` for discovery) to execute anything outside this set.
 * This keeps the tool array tiny and avoids Anthropic's 128-tool ceiling.
 */
export function getAllTools(): AnthropicTool[] {
  const cmds = registry
    .getAll()
    .filter(cmd =>
      !EXCLUDED_COMMANDS.has(cmd.id) &&
      !cmd.hidden &&
      DEFAULT_AGENT_TOOL_IDS.has(cmd.id),
    );
  return capForAnthropic(prioritizeToolCommands(cmds)).map(commandToTool);
}

/** Get tools filtered by tags (e.g. only "agent" + "query" tools) */
export function getToolsByTags(tags: string[]): AnthropicTool[] {
  const cmds = registry
    .getAll()
    .filter(cmd => !EXCLUDED_COMMANDS.has(cmd.id) && !cmd.hidden)
    .filter(cmd => tags.some(t => cmd.tags.includes(t)));
  return capForAnthropic(prioritizeToolCommands(cmds)).map(commandToTool);
}

/**
 * Resolve which command IDs a single toolkit contributes to the agent's
 * direct LLM-facing tool surface.
 *
 * - If the toolkit's `tools[]` declares any entries with `commandId`,
 *   ONLY those IDs are promoted (curated subset). Long-tail commands
 *   stay reachable through `create_job` / `list_available_commands`.
 * - Otherwise (toolkit hasn't been migrated to the curated model, or
 *   intentionally exposes no direct tools), this returns an empty list.
 *   The toolkit's commands remain registered and discoverable, but the
 *   agent reaches them via `create_job`. This is what keeps the
 *   Anthropic tool array under its 128-entry cap.
 *
 * Toolkits that have not yet declared any `tools[].commandId` can be
 * found via `getUnmigratedToolkitsForAgentTools()` for migration guidance.
 */
function directToolCommandIds(toolkitId: string): string[] {
  const tk = TOOLKITS.find((t) => t.id === toolkitId);
  if (!tk) return [];
  return (tk.tools || [])
    .map((t) => t.commandId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Lists toolkit IDs that have commands registered but have not declared
 * any `tools[].commandId` curated subset. Useful for migration tooling /
 * developer warnings; not used at runtime.
 */
export function getUnmigratedToolkitsForAgentTools(): string[] {
  return TOOLKITS.filter(
    (t) =>
      t.commands.length > 0 &&
      (t.tools || []).every(
        (tool) => typeof tool.commandId !== "string" || tool.commandId.length === 0,
      ),
  ).map((t) => t.id);
}

/**
 * Get tools restricted to the union of the given toolkit IDs' curated
 * direct tools, plus the curated default tool surface (create_job,
 * discovery, inspectors, toolkit management). Used by the workspace chat
 * to scope the AI's tool surface to whatever the active chat agent
 * declares it needs.
 *
 * If `toolkitIds` is empty/undefined, returns just the curated default set
 * via `getAllTools()`.
 */
export function getToolsByToolkitIds(toolkitIds: string[] | undefined): AnthropicTool[] {
  if (!toolkitIds || toolkitIds.length === 0) return getAllTools();

  const allowed = new Set<string>(DEFAULT_AGENT_TOOL_IDS);
  for (const id of toolkitIds) {
    for (const cmdId of directToolCommandIds(id)) allowed.add(cmdId);
  }

  const cmds = registry
    .getAll()
    .filter(cmd =>
      !EXCLUDED_COMMANDS.has(cmd.id) &&
      !cmd.hidden &&
      allowed.has(cmd.id),
    );
  return capForAnthropic(prioritizeToolCommands(cmds)).map(commandToTool);
}

/**
 * Get tools filtered by an agent's enabled toolkit bindings.
 *
 * Behavior:
 * - If the agent has NO toolkit bindings (toolkits is empty or undefined),
 *   returns only the curated default tool surface (create_job, discovery,
 *   inspectors, toolkit management). The agent uses `list_available_commands`
 *   + `create_job` to execute anything else.
 * - If the agent HAS toolkit bindings, returns the curated default surface
 *   PLUS each toolkit's curated direct-tool subset (see
 *   `directToolCommandIds`).
 *
 * This allows fine-grained per-agent command scoping for autonomous tasks
 * while always giving the model a working orchestration tool.
 */
export function getToolsForAgent(agent: Agent): AnthropicTool[] {
  const bindings = agent.toolkits;

  // No bindings → curated default tool surface only.
  if (!bindings || bindings.length === 0) {
    return getAllTools();
  }

  // Build set of allowed command IDs: curated defaults + each bound
  // toolkit's direct-tool subset (curated tools[] if declared, else all
  // toolkit.commands as a fallback).
  const allowedCommands = new Set<string>(DEFAULT_AGENT_TOOL_IDS);

  for (const binding of bindings) {
    for (const cmdId of directToolCommandIds(binding.toolkitId)) {
      allowedCommands.add(cmdId);
    }
  }

  const cmds = registry
    .getAll()
    .filter(cmd =>
      !EXCLUDED_COMMANDS.has(cmd.id) &&
      !cmd.hidden &&
      allowedCommands.has(cmd.id),
    );
  return capForAnthropic(prioritizeToolCommands(cmds)).map(commandToTool);
}

/**
 * Get the set of allowed command IDs for an agent based on toolkit bindings.
 * Returns null if the agent has no bindings (meaning all commands are allowed).
 *
 * Note: this returns the FULL union of every command in every bound toolkit
 * (not just the curated direct-tool subset), because it gates command
 * execution (e.g. via `create_job`), not the direct LLM tool surface.
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
      const result = jobId ? await watchChildJob(jobId, resolveToolTimeout(toolName)) : queued;
      const duration_ms = Math.round(performance.now() - start);
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
      const { jobId, result } = await queueJobAndWait(
        toolName,
        jobRequest,
        context,
        resolveToolTimeout(toolName),
      );
      const duration_ms = Math.round(performance.now() - start);
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
      return {
        tool_use_id: toolUseId,
        name: toolName,
        input: toolInput,
        result: result ?? { success: true },
        duration_ms,
      };
    }

    // Wait for the job executor to complete this job
    const result = await new Promise<unknown>((resolve, reject) => {
      pendingToolJobs.set(jobId, { resolve, reject });

      // Timeout safety — don't block the tool loop forever.
      // Per-command `timeoutMs` / `spawnsChildJobs` on the CommandDefinition
      // override the default. See `resolveToolTimeout`.
      const timeout = resolveToolTimeout(toolName);
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

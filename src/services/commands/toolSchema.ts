/**
 * Anthropic tool-schema conversion + the 128-tool cap and priority helpers.
 *
 * §3.6 of MVP_AUDIT_AND_REFACTOR_PLAN.md — extracted from tools.ts.
 *
 * Consumers: toolSurface.ts (agent-scoped selectors) and tools.ts
 * (executeToolCall). Re-exported from tools.ts for back-compat with
 * external callers.
 */
import type { CommandDefinition, CommandArg, CommandArgType } from "./types";

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

// ── Commands excluded from AI tool use ─────────────
// System/security commands the model must not call autonomously.
export const EXCLUDED_COMMANDS = new Set([
  "set_api_key",       // Security: don't let AI set API keys
  "select_ai_model",   // System: model selection is user-only
  "reset_workspace",   // Danger: full workspace wipe
]);

// Anthropic's tools API caps the array at 128 entries. We must keep the
// exposed surface under that ceiling or every chat call rejects with
// `Invalid 'tools': array too long`.
const MAX_ANTHROPIC_TOOLS = 128;

export const TOOL_PRIORITY_ORDER = [
  "create_job",
  "list_available_commands",
  "get_command_schema",
  "list_toolkits",
  "query_workspace",
  "queue_new_job",
  "list_queued_jobs",
  "delete_queued_job",
  "studio_create_job",
  "studio_run_job",
];

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
export function capForAnthropic(cmds: CommandDefinition[]): CommandDefinition[] {
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

export function prioritizeToolCommands(cmds: CommandDefinition[]): CommandDefinition[] {
  return [...cmds].sort((a, b) => {
    const aIndex = TOOL_PRIORITY_ORDER.indexOf(a.id);
    const bIndex = TOOL_PRIORITY_ORDER.indexOf(b.id);
    const aPriority = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bPriority = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.id.localeCompare(b.id);
  });
}

export function isReadOnlyToolCommand(cmd: CommandDefinition): boolean {
  const tags = new Set(cmd.tags || []);
  return tags.has("query") || tags.has("read") || tags.has("inspect");
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

/**
 * Agent-scoped tool surface selectors.
 *
 * Decides which curated tools each agent or toolkit exposes to the LLM,
 * respecting:
 *   - the global DEFAULT_AGENT_TOOL_IDS curated default set
 *   - per-toolkit `tools[].commandId` curated subsets
 *   - dark-agent suppression of collective-memory tools
 *   - Anthropic's 128-tool cap (via toolSchema.capForAnthropic)
 *
 * §3.6 of MVP_AUDIT_AND_REFACTOR_PLAN.md — extracted from tools.ts.
 */
import type { Agent } from "@/types";
import { TOOLKITS } from "@/services/toolkits";
import { registry } from "./registry";
import { COLLECTIVE_MEMORY_COMMAND_IDS } from "@/services/commands/definitions/collective-memory";
import {
  type AnthropicTool,
  EXCLUDED_COMMANDS,
  capForAnthropic,
  prioritizeToolCommands,
  commandToTool,
} from "./toolSchema";

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
  "query_workspace",
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
  // Collective memory (default-on for every non-dark agent)
  ...COLLECTIVE_MEMORY_COMMAND_IDS,
]);

const COLLECTIVE_MEMORY_TOOLKIT_ID = "collective-memory";
const COLLECTIVE_MEMORY_COMMAND_ID_SET = new Set<string>(COLLECTIVE_MEMORY_COMMAND_IDS);

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
  for (const cmdId of directToolCommandIds(COLLECTIVE_MEMORY_TOOLKIT_ID)) {
    allowed.add(cmdId);
  }
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
  const isDarkAgent = agent.isDarkAgent === true;

  const defaultIds = new Set<string>(DEFAULT_AGENT_TOOL_IDS);
  if (isDarkAgent) {
    for (const cmdId of COLLECTIVE_MEMORY_COMMAND_ID_SET) defaultIds.delete(cmdId);
  }

  // No bindings → curated default tool surface only.
  if (!bindings || bindings.length === 0) {
    const cmds = registry
      .getAll()
      .filter(cmd =>
        !EXCLUDED_COMMANDS.has(cmd.id) &&
        !cmd.hidden &&
        defaultIds.has(cmd.id),
      );
    return capForAnthropic(prioritizeToolCommands(cmds)).map(commandToTool);
  }

  // Build set of allowed command IDs: curated defaults + each bound
  // toolkit's direct-tool subset (curated tools[] if declared, else all
  // toolkit.commands as a fallback).
  const allowedCommands = new Set<string>(defaultIds);

  for (const binding of bindings) {
    if (isDarkAgent && binding.toolkitId === COLLECTIVE_MEMORY_TOOLKIT_ID) continue;
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
  const isDarkAgent = agent.isDarkAgent === true;

  if (!bindings || bindings.length === 0) {
    if (!isDarkAgent) return null;
    const all = new Set<string>();
    for (const cmd of registry.getAll()) {
      if (!COLLECTIVE_MEMORY_COMMAND_ID_SET.has(cmd.id)) all.add(cmd.id);
    }
    return all;
  }

  const restrictiveBindings = bindings.filter(b => b.toolkitId !== COLLECTIVE_MEMORY_TOOLKIT_ID);
  if (restrictiveBindings.length === 0 && !isDarkAgent) {
    return null;
  }

  const allowed = new Set<string>();
  for (const binding of bindings) {
    if (isDarkAgent && binding.toolkitId === COLLECTIVE_MEMORY_TOOLKIT_ID) continue;
    const toolkit = TOOLKITS.find(t => t.id === binding.toolkitId);
    if (toolkit) {
      for (const cmdId of toolkit.commands) {
        allowed.add(cmdId);
      }
    }
  }
  if (!isDarkAgent) {
    for (const cmdId of COLLECTIVE_MEMORY_COMMAND_ID_SET) allowed.add(cmdId);
  }
  return allowed;
}

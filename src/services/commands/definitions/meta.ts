/**
 * Meta commands — universal, always-available agent tools.
 *
 * These commands form the curated default tool surface exposed to AI agents.
 * Instead of registering every workspace command as a directly-callable tool
 * (which blows past Anthropic's 128-tool cap), agents discover capabilities
 * with `list_available_commands` / `get_command_schema` and execute them via
 * the `create_job` meta-tool.
 *
 *   create_job              — queue any command as a job
 *   list_available_commands — discover commands the agent may run
 *   get_command_schema      — inspect a single command's args
 *   list_toolkits           — enumerate toolkits in the workspace
 */

import { CommandDefinition } from "@/services/commands/types";
import { TOOLKITS } from "@/services/toolkits";
import { registry } from "@/services/commands/registry";

/** Commands that must never be invoked via create_job (system / security). */
const SYSTEM_RESERVED = new Set<string>([
  "set_api_key",
  "select_ai_model",
  "reset_workspace",
  "create_job", // no recursion
]);

export const createJobCommand: CommandDefinition = {
  id: "create_job",
  description:
    "Queue any registered workspace command as a job. This is the primary way to take action — first discover commands with list_available_commands (optionally inspect with get_command_schema), then call create_job with the chosen commandId and its args. Returns the queued jobId; the tool call waits for the spawned job to complete and returns its result.",
  tags: ["job", "system", "meta"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    commandId: {
      name: "commandId",
      type: "string",
      description:
        "ID of the command to run as a job. Must be a registered command (use list_available_commands to discover).",
      required: true,
    },
    args: {
      name: "args",
      type: "object",
      description:
        "Arguments for the command, matching its declared schema (use get_command_schema to inspect).",
      required: false,
      defaultValue: {},
    },
    description: {
      name: "description",
      type: "string",
      description: "Optional human-readable label for the job.",
      required: false,
    },
  },
  output: "The queued job ID and metadata.",
  outputSchema: { type: "object", additionalProperties: true },
  spawnsChildJobs: true,
  execute: async (args, context) => {
    const commandId = String(args.commandId ?? "").trim();
    if (!commandId) {
      throw new Error("create_job requires a commandId.");
    }
    if (SYSTEM_RESERVED.has(commandId)) {
      throw new Error(`Command "${commandId}" is not allowed via create_job.`);
    }
    const def = registry.get(commandId);
    if (!def) {
      throw new Error(
        `Unknown commandId "${commandId}". Call list_available_commands to discover available commands.`,
      );
    }
    if (def.hidden) {
      throw new Error(`Command "${commandId}" is hidden and cannot be invoked via create_job.`);
    }
    const jobArgs =
      (args.args as Record<string, unknown> | undefined) ??
      ({} as Record<string, unknown>);
    const queued = context.jobs.addJob({
      type: commandId,
      request: jobArgs,
    });
    return {
      jobId: queued.id,
      type: queued.type,
      queued: true,
      description:
        (args.description as string | undefined) ?? def.description,
    };
  },
};

export const listAvailableCommandsCommand: CommandDefinition = {
  id: "list_available_commands",
  description:
    "List commands the agent can execute via create_job. Optionally filter by toolkitId or a search substring. Returns id, description, toolkit, and a short arg summary for each.",
  tags: ["meta", "discovery", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    toolkitId: {
      name: "toolkitId",
      type: "string",
      description: "Optional toolkit ID to filter by.",
      required: false,
    },
    search: {
      name: "search",
      type: "string",
      description:
        "Optional case-insensitive substring filter on command id or description.",
      required: false,
    },
  },
  output: "Array of command summaries.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const toolkitId = args.toolkitId as string | undefined;
    const search = (args.search as string | undefined)?.toLowerCase();

    let allowed: Set<string> | null = null;
    if (toolkitId) {
      const tk = TOOLKITS.find((t) => t.id === toolkitId);
      if (!tk) throw new Error(`Unknown toolkitId "${toolkitId}".`);
      allowed = new Set(tk.commands);
    }

    const toolkitByCmd = new Map<string, string>();
    for (const tk of TOOLKITS) {
      for (const cmd of tk.commands) {
        if (!toolkitByCmd.has(cmd)) toolkitByCmd.set(cmd, tk.id);
      }
    }

    const commands = registry
      .getAll()
      .filter((c) => !c.hidden && !SYSTEM_RESERVED.has(c.id))
      .filter((c) => (allowed ? allowed.has(c.id) : true))
      .filter(
        (c) =>
          !search ||
          c.id.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search),
      )
      .map((c) => ({
        id: c.id,
        description: c.description,
        toolkit: toolkitByCmd.get(c.id) ?? null,
        argsSummary: Object.values(c.args).map((a) => ({
          name: a.name,
          type: a.type,
          required: a.required ?? true,
        })),
      }));

    return { count: commands.length, commands };
  },
};

export const getCommandSchemaCommand: CommandDefinition = {
  id: "get_command_schema",
  description:
    "Return the full argument schema for one command (use after list_available_commands when you need types, defaults, or enum values to build create_job args).",
  tags: ["meta", "discovery", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    commandId: {
      name: "commandId",
      type: "string",
      description: "The command ID to inspect.",
      required: true,
    },
  },
  output: "Full schema for the named command.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const commandId = String(args.commandId ?? "").trim();
    const def = registry.get(commandId);
    if (!def) throw new Error(`Unknown commandId "${commandId}".`);
    return {
      id: def.id,
      description: def.description,
      tags: def.tags,
      output: def.output,
      args: Object.values(def.args).map((a) => ({
        name: a.name,
        type: a.type,
        required: a.required ?? true,
        description: a.description,
        defaultValue: a.defaultValue,
        enum: a.enum,
      })),
    };
  },
};

export const listToolkitsCommand: CommandDefinition = {
  id: "list_toolkits",
  description:
    "List all registered toolkits with id, name, description, category, status, and command count. Use this to discover which toolkits are available to enable on an agent.",
  tags: ["meta", "toolkit", "discovery", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {},
  output: "Array of toolkit summaries.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    return {
      count: TOOLKITS.length,
      toolkits: TOOLKITS.map((tk) => ({
        id: tk.id,
        name: tk.name,
        description: tk.description,
        category: tk.category,
        status: tk.status,
        commandCount: tk.commands.length,
      })),
    };
  },
};

/** Convenience export — the four meta commands as an array. */
export const metaCommands: CommandDefinition[] = [
  createJobCommand,
  listAvailableCommandsCommand,
  getCommandSchemaCommand,
  listToolkitsCommand,
];

/**
 * Toolkit management commands — enable, disable, and list toolkits per agent.
 * These commands allow the AI bot and users to fine-tune which capabilities
 * each agent has access to for autonomous task execution and sub-agent creation.
 */

import { CommandDefinition } from "@/services/commands/types";
import { TOOLKITS } from "@/constants";
import type { Agent, ToolkitId, AgentToolkitBinding } from "@/types";

export const enableToolkitCommand: CommandDefinition = {
  id: "enable_toolkit",
  description: "Enable a toolkit for a specific agent, granting it access to that toolkit's commands and capabilities.",
  tags: ["toolkit", "agent", "configuration"],
  rbac: ["orchestrator", "builder"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "The agent to enable the toolkit for",
      required: true,
    },
    toolkitId: {
      name: "toolkitId",
      type: "string",
      description: "The toolkit ID to enable (validated at runtime against registered toolkits)",
      required: true,
    },
    config: {
      name: "config",
      type: "object",
      description: "Optional toolkit-specific configuration",
      required: false,
    },
  },
  output: "Confirmation of toolkit enablement with agent and toolkit details.",
  execute: async (args, context) => {
    const { agentId, toolkitId, config } = args;
    const { workspace } = context;

    const agent = workspace.agents.find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const toolkit = TOOLKITS.find(t => t.id === toolkitId);
    if (!toolkit) throw new Error(`Toolkit "${toolkitId}" not found`);
    if (toolkit.status !== "available") throw new Error(`Toolkit "${toolkit.name}" is not yet available (status: ${toolkit.status})`);

    // Check if already enabled
    const existing = agent.toolkits?.find((b: AgentToolkitBinding) => b.toolkitId === toolkitId);
    if (existing) {
      return {
        status: "already_enabled",
        agentId: agent.id,
        agentName: agent.name,
        toolkitId: toolkit.id,
        toolkitName: toolkit.name,
        enabledAt: existing.enabledAt,
      };
    }

    const binding: AgentToolkitBinding = {
      toolkitId: toolkitId as ToolkitId,
      enabledAt: new Date().toISOString(),
      ...(config ? { config } : {}),
    };

    // Update agent
    workspace.setAgents((prev: Agent[]) =>
      prev.map((a: Agent) =>
        a.id === agentId
          ? { ...a, toolkits: [...(a.toolkits || []), binding] }
          : a,
      ),
    );

    workspace.addLog(`Enabled toolkit "${toolkit.name}" for agent "${agent.name}"`);

    // Write to storage for downstream steps
    context.storage[`toolkit_${agent.name}_${toolkitId}`] = "enabled";

    return {
      status: "enabled",
      agentId: agent.id,
      agentName: agent.name,
      toolkitId: toolkit.id,
      toolkitName: toolkit.name,
      commands: toolkit.commands,
      enabledAt: binding.enabledAt,
    };
  },
};

export const disableToolkitCommand: CommandDefinition = {
  id: "disable_toolkit",
  description: "Disable a toolkit for a specific agent, revoking access to that toolkit's commands and capabilities.",
  tags: ["toolkit", "agent", "configuration"],
  rbac: ["orchestrator", "builder"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "The agent to disable the toolkit for",
      required: true,
    },
    toolkitId: {
      name: "toolkitId",
      type: "string",
      description: "The toolkit ID to disable (validated at runtime against registered toolkits)",
      required: true,
    },
  },
  output: "Confirmation of toolkit disablement.",
  execute: async (args, context) => {
    const { agentId, toolkitId } = args;
    const { workspace } = context;

    const agent = workspace.agents.find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const toolkit = TOOLKITS.find(t => t.id === toolkitId);
    if (!toolkit) throw new Error(`Toolkit "${toolkitId}" not found`);

    const existing = agent.toolkits?.find((b: AgentToolkitBinding) => b.toolkitId === toolkitId);
    if (!existing) {
      return {
        status: "not_enabled",
        agentId: agent.id,
        agentName: agent.name,
        toolkitId: toolkit.id,
        toolkitName: toolkit.name,
      };
    }

    // Remove binding
    workspace.setAgents((prev: Agent[]) =>
      prev.map((a: Agent) =>
        a.id === agentId
          ? { ...a, toolkits: (a.toolkits || []).filter((b: AgentToolkitBinding) => b.toolkitId !== toolkitId) }
          : a,
      ),
    );

    workspace.addLog(`Disabled toolkit "${toolkit.name}" for agent "${agent.name}"`);

    context.storage[`toolkit_${agent.name}_${toolkitId}`] = "disabled";

    return {
      status: "disabled",
      agentId: agent.id,
      agentName: agent.name,
      toolkitId: toolkit.id,
      toolkitName: toolkit.name,
      revokedCommands: toolkit.commands,
    };
  },
};

export const listAgentToolkitsCommand: CommandDefinition = {
  id: "list_agent_toolkits",
  description: "List all toolkits and their enable/disable status for a specific agent. Shows which commands the agent can access.",
  tags: ["toolkit", "agent", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "The agent to list toolkits for",
      required: true,
    },
  },
  output: "List of all toolkits with their enabled/disabled status for the agent.",
  execute: async (args, context) => {
    const { agentId } = args;
    const agent = context.workspace.agents.find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const enabledIds = new Set((agent.toolkits || []).map((b: AgentToolkitBinding) => b.toolkitId));

    const toolkitSummary = TOOLKITS
      .filter(t => t.status === "available")
      .map(t => {
        const binding = (agent.toolkits || []).find((b: AgentToolkitBinding) => b.toolkitId === t.id);
        return {
          toolkitId: t.id,
          name: t.name,
          category: t.category,
          enabled: enabledIds.has(t.id),
          enabledAt: binding?.enabledAt || null,
          commandCount: t.commands.length,
          commands: t.commands,
        };
      });

    const enabledCount = toolkitSummary.filter(t => t.enabled).length;
    const totalCommands = toolkitSummary.filter(t => t.enabled).reduce((sum, t) => sum + t.commandCount, 0);

    // Write to storage
    context.storage[`toolkits_${agent.name}`] = toolkitSummary;

    return {
      agentId: agent.id,
      agentName: agent.name,
      hasToolkitBindings: enabledCount > 0,
      summary: enabledCount > 0
        ? `${enabledCount} toolkit(s) enabled with ${totalCommands} total commands`
        : "No toolkits enabled — agent has access to all commands allowed by its RBAC role",
      enabledCount,
      totalAvailable: toolkitSummary.length,
      totalCommands,
      toolkits: toolkitSummary,
    };
  },
};

export const setAgentToolkitsCommand: CommandDefinition = {
  id: "set_agent_toolkits",
  description: "Set the complete list of enabled toolkits for an agent at once. Replaces all existing toolkit bindings.",
  tags: ["toolkit", "agent", "configuration"],
  rbac: ["orchestrator", "builder"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "The agent to configure toolkits for",
      required: true,
    },
    toolkitIds: {
      name: "toolkitIds",
      type: "array",
      description: "Array of toolkit IDs to enable. Pass empty array to clear all and revert to RBAC-only access.",
      required: true,
    },
  },
  output: "Confirmation with the new toolkit configuration.",
  execute: async (args, context) => {
    const { agentId, toolkitIds } = args;
    const { workspace } = context;

    const agent = workspace.agents.find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Validate all toolkit IDs
    const validIds: ToolkitId[] = [];
    for (const id of toolkitIds) {
      const toolkit = TOOLKITS.find(t => t.id === id);
      if (!toolkit) throw new Error(`Toolkit "${id}" not found`);
      if (toolkit.status !== "available") throw new Error(`Toolkit "${toolkit.name}" is not yet available`);
      validIds.push(id as ToolkitId);
    }

    const now = new Date().toISOString();
    const bindings: AgentToolkitBinding[] = validIds.map(id => {
      // Preserve existing enabledAt timestamps
      const existing = agent.toolkits?.find((b: AgentToolkitBinding) => b.toolkitId === id);
      return {
        toolkitId: id,
        enabledAt: existing?.enabledAt || now,
        ...(existing?.config ? { config: existing.config } : {}),
      };
    });

    workspace.setAgents((prev: Agent[]) =>
      prev.map((a: Agent) =>
        a.id === agentId ? { ...a, toolkits: bindings } : a,
      ),
    );

    const toolkitNames = validIds.map(id => TOOLKITS.find(t => t.id === id)?.name || id);
    workspace.addLog(`Set ${validIds.length} toolkit(s) for agent "${agent.name}": ${toolkitNames.join(", ")}`);

    const totalCommands = validIds.reduce((sum, id) => {
      const tk = TOOLKITS.find(t => t.id === id);
      return sum + (tk?.commands.length || 0);
    }, 0);

    return {
      agentId: agent.id,
      agentName: agent.name,
      toolkits: bindings.map(b => ({
        toolkitId: b.toolkitId,
        name: TOOLKITS.find(t => t.id === b.toolkitId)?.name,
      })),
      totalToolkits: bindings.length,
      totalCommands,
    };
  },
};

export const toolkitCommands = [
  enableToolkitCommand,
  disableToolkitCommand,
  listAgentToolkitsCommand,
  setAgentToolkitsCommand,
];

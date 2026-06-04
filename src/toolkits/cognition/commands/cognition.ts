import type { CommandDefinition } from "@/services/commands/types";
import type { Agent, AgentToolkitBinding, ToolkitId } from "@/types";
import { agentCognitionService } from "../service";
import type { AgentCognitionProfileManifest } from "../types";

export const cognitionListProfilesCommand: CommandDefinition = {
  id: "cognition_list_profiles",
  description: "List available agent cognition mind-map profiles.",
  tags: ["cognition", "profile", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {},
  output: "Array of cognition profiles with ids, names, mode, and version.",
  outputSchema: {
    type: "object",
    properties: {
      count: { type: "number" },
      profiles: { type: "array" },
    },
    required: ["count", "profiles"],
  },
  execute: async () => {
    const profiles = agentCognitionService.listProfiles().map((p) => ({
      profileId: p.spec.profileId,
      name: p.metadata.name,
      mode: p.metadata.labels.mode,
      version: p.spec.version,
      strictLoop: p.spec.strictLoop,
      nodeCount: p.spec.nodes.length,
      edgeCount: p.spec.edges.length,
      description: p.metadata.annotations.description,
      updatedAt: p.metadata.timestamps.updatedAt,
    }));
    return { count: profiles.length, profiles };
  },
};

export const cognitionGetProfileCommand: CommandDefinition = {
  id: "cognition_get_profile",
  description: "Get one cognition profile manifest by profileId.",
  tags: ["cognition", "profile", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    profileId: {
      name: "profileId",
      type: "string",
      description: "Cognition profile id (example: linear-v1).",
      required: true,
    },
  },
  output: "Cognition profile manifest.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const profileId = String(args.profileId);
    const profile = agentCognitionService.getProfile(profileId);
    if (!profile) throw new Error(`Unknown cognition profile: ${profileId}`);
    return profile;
  },
};

export const cognitionUpsertProfileCommand: CommandDefinition = {
  id: "cognition_upsert_profile",
  description: "Create or update a cognition profile manifest (kubernetes-style v0 envelope).",
  tags: ["cognition", "profile", "manifest", "write"],
  rbac: ["orchestrator", "builder"],
  args: {
    manifest: {
      name: "manifest",
      type: "object",
      description: "Agent cognition profile manifest: { kind:'v0', schema:'agent-cognition-profile', metadata, spec }.",
      required: true,
    },
  },
  output: "The normalized upserted manifest.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const manifest = args.manifest as AgentCognitionProfileManifest;
    const saved = agentCognitionService.upsertProfile(manifest);
    context.workspace.addLog(`Cognition: upserted profile ${saved.spec.profileId}`);
    return saved;
  },
};

export const cognitionDeleteProfileCommand: CommandDefinition = {
  id: "cognition_delete_profile",
  description: "Delete a cognition profile by profileId (built-in defaults cannot be deleted).",
  tags: ["cognition", "profile", "delete"],
  rbac: ["orchestrator", "builder"],
  args: {
    profileId: {
      name: "profileId",
      type: "string",
      description: "Cognition profile id.",
      required: true,
    },
  },
  output: "Deletion status for the profile.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const profileId = String(args.profileId);
    const deleted = agentCognitionService.deleteProfile(profileId);
    if (!deleted) {
      return {
        deleted: false,
        profileId,
        reason: "Profile not found or profile is protected default",
      };
    }
    context.workspace.addLog(`Cognition: deleted profile ${profileId}`);
    return { deleted: true, profileId };
  },
};

export const cognitionSetAgentProfileCommand: CommandDefinition = {
  id: "cognition_set_agent_profile",
  description: "Bind an agent to a cognition profile and store it in toolkit config.",
  tags: ["cognition", "agent", "profile", "configuration"],
  rbac: ["orchestrator", "builder"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "Target agent id.",
      required: true,
    },
    profileId: {
      name: "profileId",
      type: "string",
      description: "Cognition profile id.",
      required: true,
    },
  },
  output: "Confirmation with selected profile and toolkit binding state.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const agentId = String(args.agentId);
    const profileId = String(args.profileId);
    const profile = agentCognitionService.getProfile(profileId);
    if (!profile) throw new Error(`Unknown cognition profile: ${profileId}`);

    const liveAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
    const agent = liveAgents.find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    context.workspace.setAgents((prev: Agent[]) => {
      return prev.map((a) => {
        if (a.id !== agentId) return a;
        const currentBindings = a.toolkits || [];
        const existing = currentBindings.find((b) => b.toolkitId === "agent-cognition");
        const updatedBinding: AgentToolkitBinding = {
          toolkitId: "agent-cognition" as ToolkitId,
          enabledAt: existing?.enabledAt || new Date().toISOString(),
          config: {
            ...(existing?.config || {}),
            profileId,
          },
        };
        return {
          ...a,
          toolkits: [...currentBindings.filter((b) => b.toolkitId !== "agent-cognition"), updatedBinding],
        };
      });
    });

    context.workspace.addLog(`Cognition: set profile ${profileId} for agent ${agent.name}`);
    context.storage[`cognition_profile_${agentId}`] = profileId;

    return {
      agentId,
      agentName: agent.name,
      toolkitId: "agent-cognition",
      profileId,
      profileName: profile.metadata.name,
      strictLoop: profile.spec.strictLoop,
      nodeCount: profile.spec.nodes.length,
    };
  },
};

export const cognitionClearAgentProfileCommand: CommandDefinition = {
  id: "cognition_clear_agent_profile",
  description: "Remove an agent-specific cognition profile binding while keeping toolkit enabled.",
  tags: ["cognition", "agent", "profile", "configuration"],
  rbac: ["orchestrator", "builder"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "Target agent id.",
      required: true,
    },
  },
  output: "Confirmation of cleared profile binding.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const agentId = String(args.agentId);
    const liveAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
    const agent = liveAgents.find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    context.workspace.setAgents((prev: Agent[]) => {
      return prev.map((a) => {
        if (a.id !== agentId) return a;
        const nextBindings = (a.toolkits || []).map((binding) => {
          if (binding.toolkitId !== "agent-cognition") return binding;
          const cfg = { ...(binding.config || {}) } as Record<string, unknown>;
          delete cfg.profileId;
          return { ...binding, config: cfg };
        });
        return { ...a, toolkits: nextBindings };
      });
    });

    context.workspace.addLog(`Cognition: cleared profile binding for agent ${agent.name}`);
    delete context.storage[`cognition_profile_${agentId}`];

    return {
      agentId,
      agentName: agent.name,
      profileId: "linear-v1",
      source: "default",
    };
  },
};

export const cognitionRenderProtocolCommand: CommandDefinition = {
  id: "cognition_render_protocol",
  description: "Render a profile (or agent-selected profile) as concrete cognition loop instructions.",
  tags: ["cognition", "prompt", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    profileId: {
      name: "profileId",
      type: "string",
      description: "Optional profile id; if omitted and agentId provided, use agent-bound profile.",
      required: false,
    },
    agentId: {
      name: "agentId",
      type: "agent",
      description: "Optional agent id to render the currently assigned profile.",
      required: false,
    },
  },
  output: "Rendered cognition protocol text block.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    if (typeof args.profileId === "string") {
      return agentCognitionService.renderProtocolForProfile(args.profileId);
    }

    if (typeof args.agentId === "string") {
      const liveAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
      const agent = liveAgents.find((a: Agent) => a.id === args.agentId);
      if (!agent) throw new Error(`Agent ${args.agentId} not found`);
      return agentCognitionService.renderProtocolForAgent(agent);
    }

    return agentCognitionService.renderProtocolForProfile("linear-v1");
  },
};

export const cognitionCommands: CommandDefinition[] = [
  cognitionListProfilesCommand,
  cognitionGetProfileCommand,
  cognitionUpsertProfileCommand,
  cognitionDeleteProfileCommand,
  cognitionSetAgentProfileCommand,
  cognitionClearAgentProfileCommand,
  cognitionRenderProtocolCommand,
];

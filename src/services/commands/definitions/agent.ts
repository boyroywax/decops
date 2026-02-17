
import { CommandDefinition } from "../types";
import { generateDID, generateKeyPair } from "../../../utils/identity";
import { ROLES } from "../../../constants";

export const createAgentCommand: CommandDefinition = {
    id: "create_agent",
    description: "Creates a new AI agent in the workspace",
    tags: ["agent", "workspace"],
    rbac: ["orchestrator", "builder"], // Example roles
    args: {
        name: {
            name: "name",
            type: "string",
            description: "The name of the agent",
            required: true,
            validation: (val) => val.length >= 3 || "Name must be at least 3 characters",
        },
        role: {
            name: "role",
            type: "string",
            description: "The role of the agent (researcher, builder, etc.)",
            required: true,
            validation: (val) => ROLES.some(r => r.id === val) || "Invalid role",
        },
        prompt: {
            name: "prompt",
            type: "string",
            description: "Getting started prompt for the agent",
            required: true,
            defaultValue: 0
        }
    },
    output: "JSON object containing the created agent's ID and details.",
    outputSchema: {
        type: "object",
        properties: {
            agent: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    role: { type: "string" },
                    did: { type: "string" }
                }
            }
        }
    },
    execute: async (args, context) => {
        const { name, role, prompt } = args;
        const { workspace } = context;

        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        const newAgent = {
            id: crypto.randomUUID(),
            name,
            role,
            prompt,
            did: generateDID(),
            keys: generateKeyPair(),
            createdAt: new Date().toISOString(),
            status: "active" as const,
            networkId: context.ecosystem?.activeNetworkId || undefined,
        };

        workspace.setAgents((prev: any[]) => [...prev, newAgent]);
        workspace.addLog(`Created agent: ${name} (${role})`);

        return { agentId: newAgent.id, did: newAgent.did };
    },
};

export const pingAgentCommand: CommandDefinition = {
    id: "ping_agent",
    description: "Ping an agent to check if they are responsive.",
    tags: ["agent", "system", "health"],
    rbac: ["orchestrator"],
    args: {
        agentId: {
            name: "agentId",
            type: "string",
            description: "Target Agent ID",
            required: true
        }
    },
    output: "Pong response with latency and status.",
    execute: async (args, context) => {
        const { agentId } = args;
        const agent = context.workspace.agents.find(a => a.id === agentId);

        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // Simulate network latency and response
        const latency = Math.floor(Math.random() * 200) + 50; // 50-250ms
        await new Promise(resolve => setTimeout(resolve, latency));

        // Simulate occasional failure (5% chance)
        const isHealthy = Math.random() > 0.05;

        if (!isHealthy) {
            throw new Error(`Agent ${agent.name} is unresponsive (timeout)`);
        }

        return {
            agentId,
            name: agent.name,
            status: "online",
            latency: `${latency}ms`,
            timestamp: new Date().toISOString()
        };
    }
};

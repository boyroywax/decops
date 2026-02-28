
import { CommandDefinition } from "../types";
import { generateDID, generateKeyPair } from "../../../utils/identity";
import { createAieosEntity } from "../../../utils/aieos";
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
            description: "The role of the agent",
            required: true,
            enum: ["researcher", "builder", "curator", "validator", "orchestrator"],
            validation: (val) => ROLES.some(r => r.id === val) || "Invalid role. Must be one of: researcher, builder, curator, validator, orchestrator",
        },
        prompt: {
            name: "prompt",
            type: "string",
            description: "Getting started prompt for the agent",
            required: true,
            defaultValue: 0
        },
        networkId: {
            name: "networkId",
            type: "network",
            description: "ID of the network this agent belongs to",
            required: false,
        },
        items: {
            name: "items",
            type: "array",
            description: "Batch mode: array of {name, role, prompt, networkId?} specs. Overrides individual args.",
            required: false,
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
        const { workspace } = context;

        // Normalize: batch items or single spec
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ name: args.name, role: args.role, prompt: args.prompt, networkId: args.networkId }];

        const created: any[] = [];
        for (const spec of specs) {
            const { name, role, prompt, networkId } = spec;

            await new Promise(resolve => setTimeout(resolve, 300));

            const newAgent = {
                id: crypto.randomUUID(),
                name,
                role,
                prompt,
                did: generateDID(),
                keys: generateKeyPair(),
                createdAt: new Date().toISOString(),
                status: "active" as const,
                networkId: networkId || context.ecosystem?.activeNetworkId || undefined,
                aieos: createAieosEntity(name, role, prompt),
            };

            created.push(newAgent);

            // Write to shared storage for downstream steps
            context.storage.lastAgentId = newAgent.id;
            context.storage.lastAgentName = newAgent.name;
            context.storage[`agent_${name}`] = newAgent.id;
        }

        workspace.setAgents((prev: any[]) => [...prev, ...created]);
        workspace.addLog(`Created ${created.length} agent(s): ${created.map(a => a.name).join(", ")}`);

        // Accumulate in storage so downstream steps (channels, groups) can look up
        // agents even when React state hasn't re-rendered yet
        context.storage._agents = [...(context.storage._agents || []), ...created];

        // Single mode: backwards-compatible return shape
        if (!args.items) {
            return { agentId: created[0].id, did: created[0].did };
        }
        // Batch mode
        return { results: created.map(a => ({ agentId: a.id, name: a.name, did: a.did })) };
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
            type: "agent",
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

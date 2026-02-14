
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
            required: false,
            defaultValue: "",
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
        };

        workspace.setAgents((prev: any[]) => [...prev, newAgent]);
        workspace.addLog(`Created agent: ${name} (${role})`);

        return { agentId: newAgent.id, did: newAgent.did };
    },
};

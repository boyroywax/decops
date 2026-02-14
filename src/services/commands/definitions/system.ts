
import type { CommandDefinition, CommandContext } from "../types";

export const setApiKeyCommand: CommandDefinition = {
    id: "set_api_key",
    description: "Configure the API key for AI services (Anthropic).",
    tags: ["system", "config", "security"],
    rbac: ["orchestrator", "curator"], // Only admins/owners should do this
    args: {
        key: {
            name: "key",
            type: "string",
            description: "The API key string (starts with sk-ant...)",
            required: true,
            validation: (val) => val.startsWith("sk-") ? true : "Invalid key format (must start with sk-)"
        }
    },
    output: "Confirmation of API key update.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        context.system.setApiKey(args.key);
        context.workspace.addLog("API Key updated successfully.");
        return { success: true };
    }
};

export const selectAiModelCommand: CommandDefinition = {
    id: "select_ai_model",
    description: "Select the AI model used for agent intelligence.",
    tags: ["system", "config", "ai"],
    rbac: ["orchestrator", "curator"],
    args: {
        model: {
            name: "model",
            type: "string",
            description: "Model ID (e.g., claude-3-5-sonnet-20240620)",
            required: true,
            defaultValue: "claude-3-5-sonnet-20240620"
        }
    },
    output: "Confirmation of model selection.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, model: { type: "string" } } },
    execute: async (args, context: CommandContext) => {
        context.system.setModel(args.model);
        context.workspace.addLog(`AI Model switched to: ${args.model}`);
        return { success: true, model: args.model };
    }
};

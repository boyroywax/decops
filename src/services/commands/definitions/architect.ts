
import type { CommandDefinition, CommandContext } from "../types";

export const promptArchitectCommand: CommandDefinition = {
    id: "prompt_architect",
    description: "Generate a new network design using the AI Architect.",
    tags: ["architect", "create", "ai"],
    rbac: ["builder", "orchestrator"],
    args: {
        prompt: {
            name: "prompt",
            type: "string",
            description: "Description of the network to build",
            required: true
        }
    },
    output: "Confirmation that generation has started.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } },
    execute: async (args, context: CommandContext) => {
        // Trigger the architect generation
        // Note: generateNetwork might be async but in the hook it might just trigger state changes.
        // If it returns a promise, we await it. If it's void (triggers state), we just call it.
        // Based on typical hook usage, it likely triggers a process.

        context.workspace.addLog(`Architect triggered with prompt: ${args.prompt}`);

        // We'll assume generateNetwork is available on context.architect
        await context.architect.generateNetwork(args.prompt);

        return { success: true, message: "Architect generation started." };
    }
};

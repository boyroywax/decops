/**
 * Studio Step Commands — CRUD for steps, parallel groups, conditions,
 * input bindings, and output mappings.
 */

import { CommandDefinition } from "@/services/commands/types";
import { registry } from "@/services/commands/registry";

// ────────────────────────────────────────────────────
// Step Operations
// ────────────────────────────────────────────────────

export const studioAddStepCommand: CommandDefinition = {
    id: "studio_add_step",
    description: "Adds a new step to the Studio canvas using a registered command ID. Optionally provide initial arg values. Returns the new step ID.",
    tags: ["studio", "edit", "step"],
    rbac: ["orchestrator", "builder"],
    args: {
        commandId: { name: "commandId", type: "string", description: "Command ID to use for this step (e.g. create_agent, send_message)", required: true },
        args: { name: "args", type: "object", description: "Initial argument values for the step (key-value pairs matching the command's args)", required: false, defaultValue: {} },
    },
    output: "The ID of the newly created step",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        const cmd = registry.get(args.commandId);
        if (!cmd) return { error: `Command "${args.commandId}" not found in registry.` };
        const stepId = studio.addStep(args.commandId);
        if (args.args && typeof args.args === "object") {
            for (const [key, value] of Object.entries(args.args)) {
                studio.updateStepArg(stepId, key, value);
            }
        }
        return { stepId, commandId: args.commandId };
    },
};

export const studioRemoveStepCommand: CommandDefinition = {
    id: "studio_remove_step",
    description: "Removes a step from the Studio canvas by step ID. Children are reparented to the removed step's parent.",
    tags: ["studio", "edit", "step"],
    rbac: ["orchestrator", "builder"],
    args: {
        stepId: { name: "stepId", type: "string", description: "ID of the step to remove", required: true },
    },
    output: "Confirmation message",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.removeStep(args.stepId);
        return { removed: args.stepId };
    },
};

export const studioSetStepArgsCommand: CommandDefinition = {
    id: "studio_set_step_args",
    description: "Sets one or more argument values on an existing Studio step.",
    tags: ["studio", "edit", "step"],
    rbac: ["orchestrator", "builder"],
    args: {
        stepId: { name: "stepId", type: "string", description: "Target step ID", required: true },
        args: { name: "args", type: "object", description: "Key-value pairs of argument values to set", required: true },
    },
    output: "Updated args",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        for (const [key, value] of Object.entries(args.args)) {
            studio.updateStepArg(args.stepId, key, value);
        }
        return { stepId: args.stepId, updatedArgs: args.args };
    },
};

export const studioAddParallelGroupCommand: CommandDefinition = {
    id: "studio_add_parallel_group",
    description: "Adds a parallel container node to the Studio canvas. Steps added as children of this group will run concurrently.",
    tags: ["studio", "edit", "step", "parallel"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "New parallel group step ID",
    execute: async (_args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        const id = studio.addParallelGroup();
        return { groupId: id };
    },
};

export const studioSetStepConditionCommand: CommandDefinition = {
    id: "studio_set_step_condition",
    description: "Sets a pre-condition (JS expression) on a Studio step. The step will only execute if this expression returns truthy.",
    tags: ["studio", "edit", "step"],
    rbac: ["orchestrator", "builder"],
    args: {
        stepId: { name: "stepId", type: "string", description: "Target step ID", required: true },
        condition: { name: "condition", type: "string", description: "JavaScript expression (evaluated at runtime with storage/deliverables in scope)", required: true },
    },
    output: "Updated condition",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.updateStepPreCondition(args.stepId, args.condition);
        return { stepId: args.stepId, condition: args.condition };
    },
};

// ────────────────────────────────────────────────────
// Input Bindings & Output Mappings
// ────────────────────────────────────────────────────

export const studioSetInputBindingsCommand: CommandDefinition = {
    id: "studio_set_input_bindings",
    description: "Sets input bindings on a Studio step. Bindings connect step arguments to data from shared storage or deliverables. Each binding maps an argument name to a source (storage or deliverable) and a key.",
    tags: ["studio", "edit", "step", "binding"],
    rbac: ["orchestrator", "builder"],
    args: {
        stepId: { name: "stepId", type: "string", description: "Target step ID", required: true },
        bindings: {
            name: "bindings",
            type: "object",
            description: 'Input bindings object: { argName: { source: "storage"|"deliverable", sourceKey: "keyName" }, ... }',
            required: true,
        },
    },
    output: "Updated input bindings",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.updateStepInputBindings(args.stepId, args.bindings);
        return { stepId: args.stepId, bindings: args.bindings };
    },
};

export const studioSetOutputMappingsCommand: CommandDefinition = {
    id: "studio_set_output_mappings",
    description: 'Sets output mappings on a Studio step. Mappings route command output keys to shared storage or deliverables. Use outputKey "*" to capture the entire output.',
    tags: ["studio", "edit", "step", "mapping"],
    rbac: ["orchestrator", "builder"],
    args: {
        stepId: { name: "stepId", type: "string", description: "Target step ID", required: true },
        mappings: {
            name: "mappings",
            type: "array",
            description: 'Array of output mappings: [{ outputKey: string, target: "storage"|"deliverable", targetKey: string }]',
            required: true,
        },
    },
    output: "Updated output mappings",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.updateStepOutputMappings(args.stepId, args.mappings);
        return { stepId: args.stepId, mappings: args.mappings };
    },
};

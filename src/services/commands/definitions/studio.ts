/**
 * Studio Commands — AI-accessible operations for the visual Job Studio.
 *
 * These let the AI chatbot create, edit, and manage jobs in the Studio's
 * visual canvas, including steps, deliverables, storage, input bindings,
 * and output mappings.
 */

import { CommandDefinition } from "../types";
import { registry } from "../registry";

// ────────────────────────────────────────────────────
// Studio State Queries
// ────────────────────────────────────────────────────

export const studioGetStateCommand: CommandDefinition = {
    id: "studio_get_state",
    description: "Gets the current Studio state: job name, description, all steps (with args, bindings, output mappings), deliverables, storage entries, and execution mode.",
    tags: ["studio", "query"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {},
    output: "Full Studio state object",
    outputSchema: {
        name: "string",
        description: "string",
        mode: "string",
        stepCount: "number",
        steps: "array",
        deliverables: "array",
        storageEntries: "array",
    },
    execute: async (_args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available. Navigate to the Studio tab first." };
        return studio.getState();
    },
};

// ────────────────────────────────────────────────────
// Job Metadata
// ────────────────────────────────────────────────────

export const studioSetJobMetaCommand: CommandDefinition = {
    id: "studio_set_job_meta",
    description: "Sets the Studio job's name and/or description.",
    tags: ["studio", "edit"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: { name: "name", type: "string", description: "Job name", required: false },
        description: { name: "description", type: "string", description: "Job description", required: false },
    },
    output: "Updated job metadata",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        if (args.name !== undefined) studio.setName(args.name);
        if (args.description !== undefined) studio.setDescription(args.description);
        return { name: args.name ?? studio.getState().name, description: args.description ?? studio.getState().description };
    },
};

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
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        // Validate command exists
        const cmd = registry.get(args.commandId);
        if (!cmd) return { error: `Command "${args.commandId}" not found in registry.` };
        const stepId = studio.addStep(args.commandId);
        // Apply initial args if provided
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
        const studio = context.studio;
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
        const studio = context.studio;
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
        const studio = context.studio;
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
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.updateStepPreCondition(args.stepId, args.condition);
        return { stepId: args.stepId, condition: args.condition };
    },
};

// ────────────────────────────────────────────────────
// Input Bindings
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
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.updateStepInputBindings(args.stepId, args.bindings);
        return { stepId: args.stepId, bindings: args.bindings };
    },
};

// ────────────────────────────────────────────────────
// Output Mappings
// ────────────────────────────────────────────────────

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
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.updateStepOutputMappings(args.stepId, args.mappings);
        return { stepId: args.stepId, mappings: args.mappings };
    },
};

// ────────────────────────────────────────────────────
// Deliverables
// ────────────────────────────────────────────────────

export const studioAddDeliverableCommand: CommandDefinition = {
    id: "studio_add_deliverable",
    description: "Adds a deliverable declaration to the Studio job. Deliverables are declared outputs the job is expected to produce.",
    tags: ["studio", "edit", "deliverable"],
    rbac: ["orchestrator", "builder"],
    args: {
        key: { name: "key", type: "string", description: "Unique key for the deliverable (used in output mappings and bindings)", required: true },
        label: { name: "label", type: "string", description: "Display label", required: true },
        type: { name: "type", type: "string", description: "Artifact type: markdown | json | yaml | csv | image | code", required: false, defaultValue: "json" },
        description: { name: "description", type: "string", description: "Description of what this deliverable contains", required: false },
    },
    output: "Added deliverable info",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.addDeliverableEntry({ key: args.key, label: args.label, type: args.type, description: args.description });
        return { key: args.key, label: args.label, type: args.type };
    },
};

export const studioRemoveDeliverableCommand: CommandDefinition = {
    id: "studio_remove_deliverable",
    description: "Removes a deliverable from the Studio job by its index (0-based).",
    tags: ["studio", "edit", "deliverable"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the deliverable to remove (0-based)", required: true },
    },
    output: "Removal confirmation",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.removeDeliverableEntry(args.index);
        return { removed: args.index };
    },
};

// ────────────────────────────────────────────────────
// Storage Defaults
// ────────────────────────────────────────────────────

export const studioAddStorageCommand: CommandDefinition = {
    id: "studio_add_storage",
    description: "Adds a default storage key-value pair to the Studio job. Storage provides inter-step shared state.",
    tags: ["studio", "edit", "storage"],
    rbac: ["orchestrator", "builder"],
    args: {
        key: { name: "key", type: "string", description: "Storage key name", required: true },
        value: { name: "value", type: "string", description: "Default value (string or JSON)", required: false, defaultValue: "" },
    },
    output: "Added storage entry",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.addStorageEntryWithValues(args.key, args.value);
        return { key: args.key, value: args.value };
    },
};

export const studioRemoveStorageCommand: CommandDefinition = {
    id: "studio_remove_storage",
    description: "Removes a storage entry from the Studio job by its index (0-based).",
    tags: ["studio", "edit", "storage"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the storage entry to remove (0-based)", required: true },
    },
    output: "Removal confirmation",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.removeStorageEntry(args.index);
        return { removed: args.index };
    },
};

// ────────────────────────────────────────────────────
// Job Lifecycle (Save / Run / Load / Clear)
// ────────────────────────────────────────────────────

// ────────────────────────────────────────────────────
// Entity Inputs
// ────────────────────────────────────────────────────

export const studioAddInputCommand: CommandDefinition = {
    id: "studio_add_input",
    description: "Adds an entity input reference to the Studio job. Inputs map friendly names to entity IDs (agents, channels, groups, networks) and are resolved via $input.name in step args at runtime.",
    tags: ["studio", "edit", "input"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: { name: "name", type: "string", description: "Friendly name for the entity input (used as $input.name)", required: true },
        type: { name: "type", type: "string", description: "Input type — workspace entity or value type", required: true, enum: ["agent", "channel", "group", "network", "text", "number_range", "list"] },
        entityId: { name: "entityId", type: "string", description: "The entity ID to map to", required: false, defaultValue: "" },
    },
    output: "Added entity input",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.addInput({ name: args.name, type: args.type, entityId: args.entityId || "" });
        return { name: args.name, type: args.type, entityId: args.entityId };
    },
};

export const studioRemoveInputCommand: CommandDefinition = {
    id: "studio_remove_input",
    description: "Removes an entity input from the Studio job by its index (0-based).",
    tags: ["studio", "edit", "input"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the input to remove (0-based)", required: true },
    },
    output: "Removal confirmation",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.removeInput(args.index);
        return { removed: args.index };
    },
};

export const studioUpdateInputCommand: CommandDefinition = {
    id: "studio_update_input",
    description: "Updates a field on an entity input in the Studio job.",
    tags: ["studio", "edit", "input"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the input to update (0-based)", required: true },
        field: { name: "field", type: "string", description: "Field to update", required: true, enum: ["name", "type", "entityId", "placeholder", "min", "max", "step", "options", "multiSelect"] },
        value: { name: "value", type: "string", description: "New value for the field", required: true },
    },
    output: "Updated input",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.updateInput(args.index, args.field as any, args.value);
        return { index: args.index, field: args.field, value: args.value };
    },
};

export const studioSaveJobCommand: CommandDefinition = {
    id: "studio_save_job",
    description: "Saves the current Studio job to the catalog. The job must have a name and at least one step.",
    tags: ["studio", "job", "save"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "Saved job definition ID",
    execute: async (_args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        const result = studio.saveJob();
        return result;
    },
};

export const studioRunJobCommand: CommandDefinition = {
    id: "studio_run_job",
    description: "Builds the current Studio job definition and submits it for execution. The job must have a name and at least one step.",
    tags: ["studio", "job", "run"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "Run status message",
    execute: async (_args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        const result = studio.runJob();
        return result;
    },
};

export const studioLoadJobCommand: CommandDefinition = {
    id: "studio_load_job",
    description: "Loads a saved job definition from the catalog into the Studio canvas by its ID.",
    tags: ["studio", "job", "load"],
    rbac: ["orchestrator", "builder"],
    args: {
        jobId: { name: "jobId", type: "string", description: "The job definition ID to load from the catalog", required: true },
    },
    output: "Loaded job info",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        const result = studio.loadJobById(args.jobId);
        return result;
    },
};

export const studioClearCanvasCommand: CommandDefinition = {
    id: "studio_clear_canvas",
    description: "Clears the Studio canvas — removes all steps, deliverables, storage, and resets the job name/description.",
    tags: ["studio", "edit"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "Confirmation message",
    execute: async (_args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        studio.clearCanvas();
        return { cleared: true };
    },
};

// ────────────────────────────────────────────────────
// Compound: Build full job in one call
// ────────────────────────────────────────────────────

export const studioCreateJobCommand: CommandDefinition = {
    id: "studio_create_job",
    description: "Creates a complete job in the Studio in one call. Clears the canvas first, then sets name, description, steps (with args, bindings, output mappings), parallel groups, deliverables, storage defaults, entity inputs, and triggers. Optionally saves and/or runs it immediately.",
    tags: ["studio", "job", "create"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: { name: "name", type: "string", description: "Job name", required: true },
        description: { name: "description", type: "string", description: "Job description", required: false, defaultValue: "" },
        steps: {
            name: "steps",
            type: "array",
            description: "Array of step objects: [{ commandId, args?, inputBindings?, outputMappings?, condition?, parallelGroup?: number }]. Use parallelGroup index to assign steps into a parallel group (0-based index into the parallelGroups array).",
            required: true,
        },
        parallelGroups: {
            name: "parallelGroups",
            type: "array",
            description: "Array of parallel group labels: ['Research Tasks', 'Data Collection']. Steps reference these by index via the parallelGroup field.",
            required: false,
        },
        deliverables: {
            name: "deliverables",
            type: "array",
            description: "Array of deliverable objects: [{ key, label, type?, description? }]",
            required: false,
        },
        storageDefaults: {
            name: "storageDefaults",
            type: "object",
            description: "Default storage key-value pairs: { key: value, ... }",
            required: false,
        },
        inputs: {
            name: "inputs",
            type: "array",
            description: "Entity inputs: [{ name, type: 'agent'|'channel'|'group'|'network', entityId }]",
            required: false,
        },
        triggers: {
            name: "triggers",
            type: "array",
            description: "Trigger rules: [{ event, filter?, label?, cron? }]. Events: artifact:created, artifact:updated, artifact:deleted, agent:created, agent:updated, group:created, group:updated, channel:created, channel:updated, network:created, network:updated, job:completed, job:failed, schedule:cron.",
            required: false,
        },
        save: { name: "save", type: "boolean", description: "Save the job to catalog after creation", required: false, defaultValue: false },
        run: { name: "run", type: "boolean", description: "Run the job immediately after creation", required: false, defaultValue: false },
    },
    output: "Created job info with optional save/run results",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };

        // 1. Clear canvas
        studio.clearCanvas();

        // 2. Set metadata
        studio.setName(args.name);
        studio.setDescription(args.description || "");

        // 3. Create parallel groups first (we need their IDs for child assignment)
        const groupIds: string[] = [];
        if (args.parallelGroups && Array.isArray(args.parallelGroups)) {
            for (const _label of args.parallelGroups) {
                const gid = studio.addParallelGroup();
                groupIds.push(gid);
            }
        }

        // 4. Add steps
        const stepIds: string[] = [];
        for (const stepDef of args.steps) {
            const stepId = studio.addStep(stepDef.commandId);
            stepIds.push(stepId);

            // Set args
            if (stepDef.args && typeof stepDef.args === "object") {
                for (const [key, value] of Object.entries(stepDef.args)) {
                    studio.updateStepArg(stepId, key, value);
                }
            }

            // Set condition
            if (stepDef.condition) {
                studio.updateStepPreCondition(stepId, stepDef.condition);
            }

            // Set input bindings
            if (stepDef.inputBindings) {
                studio.updateStepInputBindings(stepId, stepDef.inputBindings);
            }

            // Set output mappings
            if (stepDef.outputMappings) {
                studio.updateStepOutputMappings(stepId, stepDef.outputMappings);
            }

            // Assign to parallel group if specified
            if (stepDef.parallelGroup !== undefined && typeof stepDef.parallelGroup === "number") {
                const gid = groupIds[stepDef.parallelGroup];
                if (gid) {
                    studio.reparentStep(stepId, gid, true);
                }
            }
        }

        // 5. Add deliverables
        if (args.deliverables) {
            for (const d of args.deliverables) {
                studio.addDeliverableEntry({
                    key: d.key,
                    label: d.label,
                    type: d.type || "json",
                    description: d.description || "",
                });
            }
        }

        // 6. Add storage defaults
        if (args.storageDefaults) {
            for (const [key, value] of Object.entries(args.storageDefaults)) {
                studio.addStorageEntryWithValues(key, typeof value === "string" ? value : JSON.stringify(value));
            }
        }

        // 7. Add entity inputs
        if (args.inputs) {
            for (const inp of args.inputs) {
                studio.addInput({ name: inp.name, type: inp.type || "agent", entityId: inp.entityId || "" });
            }
        }

        // 8. Add triggers
        if (args.triggers && Array.isArray(args.triggers) && (studio as any).addTrigger) {
            for (const t of args.triggers) {
                const id = `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                let filter: any = undefined;
                if (t.filter) {
                    const val = t.filter;
                    const isId = /^[a-z0-9-]{8,}$/i.test(val);
                    const isTag = val.includes(":");
                    filter = {
                        entityId: isId ? val : undefined,
                        tag: isTag ? val : undefined,
                        name: (!isId && !isTag) ? val : undefined,
                    };
                }
                (studio as any).addTrigger(t.event, id, filter, t.label, t.cron);
            }
        }

        // 9. Optionally save and/or run
        const result: any = { name: args.name, stepCount: stepIds.length, stepIds, groupCount: groupIds.length, groupIds };

        if (args.save) {
            result.saved = studio.saveJob();
        }

        if (args.run) {
            result.ran = studio.runJob();
        }

        return result;
    },
};

// ────────────────────────────────────────────────────
// TRIGGER COMMANDS
// ────────────────────────────────────────────────────

export const studioAddTriggerCommand: CommandDefinition = {
    id: "studio_add_trigger",
    description: "Add an automated trigger rule to the current Studio job. The job will fire automatically when the specified workspace event occurs.",
    tags: ["studio", "trigger", "automation"],
    rbac: ["orchestrator", "builder"],
    args: {
        event: {
            name: "event", type: "string",
            description: "Trigger event: artifact:created, artifact:updated, artifact:deleted, agent:created, agent:updated, group:created, group:updated, channel:created, channel:updated, network:created, network:updated, job:completed, job:failed, schedule:cron",
            required: true,
        },
        filter: { name: "filter", type: "string", description: "Optional filter string (entity ID, tag, or name pattern)", required: false },
        label: { name: "label", type: "string", description: "Human-readable label for the trigger", required: false },
        cron: { name: "cron", type: "string", description: "Cron expression (only for schedule:cron events)", required: false },
    },
    output: "Created trigger ID",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        const state = studio.getState();
        const id = `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        // Build filter object from filter string
        let filter: any = undefined;
        if (args.filter) {
            const val = args.filter;
            const isId = /^[a-z0-9-]{8,}$/i.test(val);
            const isTag = val.includes(":");
            filter = {
                entityId: isId ? val : undefined,
                tag: isTag ? val : undefined,
                name: (!isId && !isTag) ? val : undefined,
            };
        }
        // We need to update triggers via the API — for now, use addTrigger if available
        if ((studio as any).addTrigger) {
            (studio as any).addTrigger(args.event, id, filter, args.label, args.cron);
        }
        return { triggerId: id, event: args.event, filter, label: args.label };
    },
};

export const studioRemoveTriggerCommand: CommandDefinition = {
    id: "studio_remove_trigger",
    description: "Remove an automated trigger from the current Studio job by ID.",
    tags: ["studio", "trigger", "automation"],
    rbac: ["orchestrator", "builder"],
    args: {
        triggerId: { name: "triggerId", type: "string", description: "ID of the trigger to remove", required: true },
    },
    output: "Removed trigger confirmation",
    execute: async (args, context) => {
        const studio = context.studio;
        if (!studio) return { error: "Studio is not available." };
        if ((studio as any).removeTrigger) {
            (studio as any).removeTrigger(args.triggerId);
        }
        return { removed: args.triggerId };
    },
};

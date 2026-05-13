/**
 * Studio Lifecycle Commands — State queries, metadata, save/run/load/clear,
 * compound job creation, and trigger management.
 */

import { CommandDefinition } from "@/services/commands/types";
import { watchChildJob } from "@/services/commands/tools";

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
        type: "object",
        properties: {
            name: { type: "string" },
            description: { type: "string" },
            mode: { type: "string" },
            stepCount: { type: "number" },
            steps: { type: "array" },
            deliverables: { type: "array" },
            storageEntries: { type: "array" },
        },
    },
    execute: async (_args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
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
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        if (args.name !== undefined) studio.setName(args.name);
        if (args.description !== undefined) studio.setDescription(args.description);
        return { name: args.name ?? studio.getState().name, description: args.description ?? studio.getState().description };
    },
};

// ────────────────────────────────────────────────────
// Job Lifecycle (Save / Run / Load / Clear)
// ────────────────────────────────────────────────────

export const studioSaveJobCommand: CommandDefinition = {
    id: "studio_save_job",
    description: "Saves the current Studio job to the catalog. The job must have a name and at least one step.",
    tags: ["studio", "job", "save"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "Saved job definition ID",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (_args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        const result = studio.saveJob();
        return result;
    },
};

export const studioRunJobCommand: CommandDefinition = {
    id: "studio_run_job",
    description: "Builds the current Studio job definition, submits it for execution, and monitors it until completion. The job must have a name and at least one step. Returns the final job result or error.",
    tags: ["studio", "job", "run"],
    rbac: ["orchestrator", "builder"],
    spawnsChildJobs: true,
    args: {},
    output: "Run status with final job result",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (_args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        const result = studio.runJob();
        if ("error" in result) return result;

        // If we got a runtimeJobId, wait for the spawned job to finish
        if (result.runtimeJobId) {
            try {
                const childResult = await watchChildJob(result.runtimeJobId);
                const timedOut = !!(childResult && typeof childResult === "object" && "_childTimeout" in childResult && (childResult as { _childTimeout?: boolean })._childTimeout);
                return {
                    ...result,
                    completed: !timedOut,
                    jobResult: childResult,
                };
            } catch (err: any) {
                return {
                    ...result,
                    completed: false,
                    jobError: err.message || "Job failed",
                };
            }
        }

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
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
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
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (_args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.clearCanvas();
        return { cleared: true };
    },
};

// ────────────────────────────────────────────────────
// Compound: Build full job in one call
// ────────────────────────────────────────────────────

/** Parse a filter string into a structured filter object. */
function parseTriggerFilter(val: string): { entityId?: string; tag?: string; name?: string } | undefined {
    const isId = /^[a-z0-9-]{8,}$/i.test(val);
    const isTag = val.includes(":");
    return {
        entityId: isId ? val : undefined,
        tag: isTag ? val : undefined,
        name: (!isId && !isTag) ? val : undefined,
    };
}

export const studioCreateJobCommand: CommandDefinition = {
    id: "studio_create_job",
    description: "Creates a complete job in the Studio in one call. Clears the canvas first, then sets name, description, steps (with args, bindings, output mappings), parallel groups, deliverables, storage defaults, entity inputs, and triggers. Optionally saves and/or runs it immediately.",
    tags: ["studio", "job", "create"],
    rbac: ["orchestrator", "builder"],
    spawnsChildJobs: true,
    args: {
        name: { name: "name", type: "string", description: "Job name", required: true },
        description: { name: "description", type: "string", description: "Job description", required: false, defaultValue: "" },
        steps: {
            name: "steps",
            type: "array",
            description: "Array of step objects: [{ commandId, args?, inputBindings?, outputMappings?, condition?, parallelGroup?: number, modelId?: string, onSuccess?: { commandId?, args?, setStorage?, log?, haltAfterSuccess? }, onFailure?: { commandId?, args?, setStorage?, log?, continueOnFailure? } }]. Use parallelGroup index to assign steps into a parallel group (0-based index into the parallelGroups array). onSuccess/onFailure are action hooks that fire after step completion/failure — they can run follow-up commands, write to storage, log messages, and control execution flow.",
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
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
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

            if (stepDef.args && typeof stepDef.args === "object") {
                for (const [key, value] of Object.entries(stepDef.args)) {
                    studio.updateStepArg(stepId, key, value);
                }
            }
            if (stepDef.condition) {
                studio.updateStepPreCondition(stepId, stepDef.condition);
            }
            if (stepDef.inputBindings) {
                studio.updateStepInputBindings(stepId, stepDef.inputBindings);
            }
            if (stepDef.outputMappings) {
                studio.updateStepOutputMappings(stepId, stepDef.outputMappings);
            }
            if (stepDef.modelId) {
                studio.updateStepModel(stepId, stepDef.modelId);
            }
            if (stepDef.onSuccess && (studio as any).updateStepOnSuccess) {
                (studio as any).updateStepOnSuccess(stepId, stepDef.onSuccess);
            }
            if (stepDef.onFailure && (studio as any).updateStepOnFailure) {
                (studio as any).updateStepOnFailure(stepId, stepDef.onFailure);
            }
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
                const filter = t.filter ? parseTriggerFilter(t.filter) : undefined;
                (studio as any).addTrigger(t.event, id, filter, t.label, t.cron);
            }
        }

        // 9. Optionally save and/or run
        const result: any = { name: args.name, stepCount: stepIds.length, stepIds, groupCount: groupIds.length, groupIds };

        // 9a. Auto-layout the canvas so steps don't stack on top of each other
        if (studio.autoLayout) {
            studio.autoLayout();
        }

        if (args.save) {
            result.saved = studio.saveJob();
        }

        if (args.run) {
            const runResult = studio.runJob();
            result.ran = runResult;

            // If the spawned job has a runtime ID, wait for it to finish
            if (runResult && !("error" in runResult) && runResult.runtimeJobId) {
                try {
                    const childResult = await watchChildJob(runResult.runtimeJobId);
                    const timedOut = !!(childResult && typeof childResult === "object" && "_childTimeout" in childResult && (childResult as { _childTimeout?: boolean })._childTimeout);
                    result.ranCompleted = !timedOut;
                    result.jobResult = childResult;
                } catch (err: any) {
                    result.ranCompleted = false;
                    result.jobError = err.message || "Job failed";
                }
            }
        }

        return result;
    },
};

// ────────────────────────────────────────────────────
// Trigger Commands
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
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        const id = `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const filter = args.filter ? parseTriggerFilter(args.filter) : undefined;
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
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        if ((studio as any).removeTrigger) {
            (studio as any).removeTrigger(args.triggerId);
        }
        return { removed: args.triggerId };
    },
};

// ────────────────────────────────────────────────────
// Layout Commands
// ────────────────────────────────────────────────────

export const studioAutoLayoutCommand: CommandDefinition = {
    id: "studio_auto_layout",
    description: "Recompute all step positions on the Studio canvas based on the parent-child graph. Fixes overlapping, stacking, and cramped layout issues. Should be called after building or modifying a job to ensure clean visual layout.",
    tags: ["studio", "layout"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "Layout result",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (_args, context) => {
        const studio = context.extensions?.studio as import("@/toolkits/studio/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        if (studio.autoLayout) {
            studio.autoLayout();
            const state = studio.getState();
            return {
                layoutApplied: true,
                stepCount: state.steps.length,
                message: `Auto-layout applied to ${state.steps.length} step(s).`,
            };
        }
        return { error: "Auto-layout is not available." };
    },
};

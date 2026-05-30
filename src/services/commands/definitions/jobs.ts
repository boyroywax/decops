import { CommandDefinition } from "@/services/commands/types";
import type { JobDeliverable, JobRequest, JobStep } from "@/types";

// --- Queue Management ---

export const queueNewJobCommand: CommandDefinition = {
    id: "queue_new_job",
    description: "Adds a new job to the execution queue. Supports single-command or multi-step jobs with deliverables and shared storage.",
    tags: ["job", "system"],
    rbac: ["orchestrator", "builder", "researcher"],
    spawnsChildJobs: true,
    args: {
        type: { name: "type", type: "string", description: "Command ID to run (or job name for multi-step)", required: true },
        request: { name: "request", type: "object", description: "Arguments for the command", required: true, defaultValue: {} },
        steps: { name: "steps", type: "array", description: "Optional list of JobSteps for multi-step jobs. Each step supports: { commandId, args, condition?, modelId?, onSuccess?: { commandId?, args?, setStorage?, log?, haltAfterSuccess? }, onFailure?: { commandId?, args?, setStorage?, log?, continueOnFailure? }, outputMappings?, inputBindings? }", required: false },
        mode: { name: "mode", type: "string", description: "Execution mode: serial | parallel (default: serial)", required: false, defaultValue: "serial" },
        deliverables: { name: "deliverables", type: "array", description: "Declared outputs: [{key, label, type, description?}]", required: false },
        storageDefaults: { name: "storageDefaults", type: "object", description: "Initial shared storage key-value pairs for inter-step data", required: false },
        parallelGroups: { name: "parallelGroups", type: "array", description: "Parallel group metadata: [{ id, label, stepIds[] }]", required: false },
    },
    output: "The ID of the queued job.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { type, request, steps, mode, deliverables, storageDefaults, parallelGroups } = args;
        const jobPayload = {
            type: type as string,
            request: request as Record<string, unknown>,
        } as JobRequest & {
            steps?: JobStep[];
            mode?: "serial" | "parallel" | "mixed";
            deliverables?: JobDeliverable[];
            storageDefaults?: Record<string, unknown>;
            parallelGroups?: Array<{ id: string; label: string; stepIds: string[] }>;
        };
        if (steps) jobPayload.steps = steps as JobStep[];
        if (mode) jobPayload.mode = mode as "serial" | "parallel" | "mixed";
        if (deliverables) jobPayload.deliverables = deliverables as JobDeliverable[];
        if (storageDefaults) jobPayload.storageDefaults = storageDefaults as Record<string, unknown>;
        if (parallelGroups) jobPayload.parallelGroups = parallelGroups as Array<{ id: string; label: string; stepIds: string[] }>;
        const queuedJob = context.jobs.addJob(jobPayload);
        return {
            jobId: queuedJob.id,
            type: queuedJob.type,
            queued: true,
        };
    }
};

export const pauseQueueCommand: CommandDefinition = {
    id: "pause_queue",
    description: "Pauses the job execution queue.",
    tags: ["job", "system"],
    rbac: ["orchestrator"],
    args: {},
    output: "Status message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        context.jobs.pauseQueue();
        return "Queue paused";
    }
};

export const resumeQueueCommand: CommandDefinition = {
    id: "resume_queue",
    description: "Resumes the job execution queue.",
    tags: ["job", "system"],
    rbac: ["orchestrator"],
    args: {},
    output: "Status message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        context.jobs.resumeQueue();
        return "Queue resumed";
    }
};

export const deleteQueuedJobCommand: CommandDefinition = {
    id: "delete_queued_job",
    description: "Removes a job from the queue (cancel).",
    tags: ["job", "system"],
    rbac: ["orchestrator"],
    args: {
        id: { name: "id", type: "string", description: "Job ID to remove", required: true }
    },
    output: "Status message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        context.jobs.removeJob(args.id);
        return `Job ${args.id} removed`;
    }
};

export const listQueueCommand: CommandDefinition = {
    id: "list_queued_jobs",
    description: "Lists all jobs currently in the queue.",
    tags: ["job", "query"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {},
    output: "List of queued jobs",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        return context.jobs.getQueue();
    }
};

// --- Catalog Management ---

export const listCatalogJobsCommand: CommandDefinition = {
    id: "list_catalog_jobs",
    description: "Lists all saved job definitions in the catalog.",
    tags: ["job", "catalog", "query"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {},
    output: "List of job definitions",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        return context.jobs.getCatalog();
    }
};

export const saveJobDefinitionCommand: CommandDefinition = {
    id: "save_job_definition",
    description: "Saves a job definition to the catalog. Supports deliverables (declared outputs) and storageDefaults (inter-step shared state).",
    tags: ["job", "catalog"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: { name: "name", type: "string", description: "Job Name", required: true },
        description: { name: "description", type: "string", description: "Job Description", required: false, defaultValue: "" },
        mode: { name: "mode", type: "string", description: "serial | parallel | mixed", required: false, defaultValue: "serial" },
        steps: { name: "steps", type: "array", description: "List of JobSteps. Each step: { commandId, args, condition?, modelId?, onSuccess?: { commandId?, args?, setStorage?, log?, haltAfterSuccess? }, onFailure?: { commandId?, args?, setStorage?, log?, continueOnFailure? }, outputMappings?: [{ outputKey, target, targetKey }], inputBindings?: { argName: { source, sourceKey } } }", required: true },
        deliverables: { name: "deliverables", type: "array", description: "Declared outputs: [{key, label, type (markdown|json|yaml|csv|image|code), description?}]", required: false },
        storageDefaults: { name: "storageDefaults", type: "object", description: "Default inter-step shared storage key-value pairs", required: false },
        parallelGroups: { name: "parallelGroups", type: "array", description: "Parallel group metadata: [{ id, label, stepIds[] }]", required: false },
        inputDefaults: { name: "inputDefaults", type: "array", description: "Default entity inputs: [{ name, type, entityId }]", required: false },
        triggers: { name: "triggers", type: "array", description: "Trigger rules: [{ event, filter?, label?, cron? }]", required: false },
    },
    output: "ID of saved definition",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const id = `job-def-${Date.now()}`;
        const now = Date.now();
        const def = {
            id,
            name: args.name,
            description: args.description,
            mode: args.mode,
            steps: args.steps,
            deliverables: args.deliverables || undefined,
            storageDefaults: args.storageDefaults || undefined,
            parallelGroups: args.parallelGroups || undefined,
            inputDefaults: args.inputDefaults || undefined,
            triggers: args.triggers || undefined,
            createdAt: now,
            updatedAt: now,
        };
        context.jobs.saveDefinition(def);
        return id;
    }
};

export const deleteJobDefinitionCommand: CommandDefinition = {
    id: "delete_job_definition",
    description: "Deletes a job definition from the catalog.",
    tags: ["job", "catalog"],
    rbac: ["orchestrator"],
    args: {
        id: { name: "id", type: "string", description: "Definition ID", required: true }
    },
    output: "Status message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        context.jobs.deleteDefinition(args.id);
        return `Definition ${args.id} deleted`;
    }
};

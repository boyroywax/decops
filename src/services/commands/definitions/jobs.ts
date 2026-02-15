import { CommandDefinition } from "../types";

// --- Queue Management ---

export const queueNewJobCommand: CommandDefinition = {
    id: "queue_new_job",
    description: "Adds a new job to the execution queue.",
    tags: ["job", "system"],
    rbac: ["orchestrator", "builder", "researcher"], // Open to most
    args: {
        type: { name: "type", type: "string", description: "Command ID to run", required: true },
        request: { name: "request", type: "object", description: "Arguments for the command", required: true, defaultValue: {} },
        // Optional multi-step support args could go here but keeping simple for now
    },
    output: "The ID of the queued job.",
    execute: async (args, context) => {
        const { type, request } = args;
        context.jobs.addJob({ type, request });
        // We don't get the ID back synchronously from addJob easily unless we change the hook signature, 
        // but for now we trust it's added.
        return "Job queued";
    }
};

export const pauseQueueCommand: CommandDefinition = {
    id: "pause_queue",
    description: "Pauses the job execution queue.",
    tags: ["job", "system"],
    rbac: ["orchestrator"],
    args: {},
    output: "Status message",
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
    execute: async (args, context) => {
        return context.jobs.getCatalog();
    }
};

export const saveJobDefinitionCommand: CommandDefinition = {
    id: "save_job_definition",
    description: "Saves a job definition to the catalog.",
    tags: ["job", "catalog"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: { name: "name", type: "string", description: "Job Name", required: true },
        description: { name: "description", type: "string", description: "Job Description", required: false, defaultValue: "" },
        mode: { name: "mode", type: "string", description: "serial | parallel", required: false, defaultValue: "serial" },
        steps: { name: "steps", type: "array", description: "List of JobSteps", required: true }
    },
    output: "ID of saved definition",
    execute: async (args, context) => {
        const id = `job-def-${Date.now()}`;
        const def = {
            id,
            name: args.name,
            description: args.description,
            mode: args.mode,
            steps: args.steps,
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
    execute: async (args, context) => {
        context.jobs.deleteDefinition(args.id);
        return `Definition ${args.id} deleted`;
    }
};

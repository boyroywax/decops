/**
 * Built-in (seeded) job definitions that ship with the app.
 * These appear in the Job Catalog alongside user-created definitions.
 * They cannot be deleted (the UI will re-seed them on next load).
 */
import type { JobDefinition } from "../../types";

export const SEED_JOB_PREFIX = "seed-";

export const seedCatalogJobs: JobDefinition[] = [
    {
        id: "seed-deploy-network",
        name: "Deploy Network",
        description:
            "Generate and deploy a full agent mesh network from a natural-language prompt. " +
            "The deploy_network command uses the AI Architect to produce a MeshConfig, then " +
            "decomposes it into atomic create_network / create_agent / create_channel / " +
            "create_group / create_bridge / send_message steps and queues them as a tracked " +
            "deployment job. Edit the prompt in Studio before running.",
        mode: "serial",
        steps: [
            {
                id: "step-0",
                commandId: "deploy_network",
                name: "Generate & Deploy Network",
                args: {
                    prompt: "Design a research team with 3 agents: a lead researcher who coordinates work, a data analyst who processes information, and a technical writer who produces reports. Connect them with data channels for collaboration.",
                },
                outputMappings: [
                    { outputKey: "*", target: "storage" as const, targetKey: "deployResult" },
                    { outputKey: "*", target: "deliverable" as const, targetKey: "deploy-summary" },
                ],
            },
        ],
        deliverables: [
            {
                key: "mesh-config",
                label: "Network Config",
                type: "json",
                description: "The AI-generated MeshConfig JSON (produced by deploy_network)",
            },
            {
                key: "deploy-summary",
                label: "Deployment Summary",
                type: "json",
                description: "Summary of the deployment job with step list",
            },
            {
                key: "topology",
                label: "Network Topology",
                type: "json",
                description: "Final topology snapshot after deployment (produced by child job)",
            },
        ],
        storageDefaults: {
            deployResult: null,
        },
        inputDefaults: [],
        createdAt: 0, // Epoch 0 marks built-in
        updatedAt: 0,
    },
];

/** Check whether a job definition ID is a built-in seed */
export function isSeedJob(id: string): boolean {
    return id.startsWith(SEED_JOB_PREFIX);
}

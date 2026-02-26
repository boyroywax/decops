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
            "Step 1 uses the AI Architect to produce a MeshConfig, then Step 2 decomposes it " +
            "into atomic create_network / create_agent / create_channel / create_group / " +
            "create_bridge / send_message steps and queues them as a tracked deployment job.",
        mode: "serial",
        steps: [
            {
                id: "step-0",
                commandId: "prompt_architect",
                name: "Generate Network Config",
                args: { prompt: "" }, // User fills in before running
            },
            {
                id: "step-1",
                commandId: "deploy_network",
                name: "Deploy Generated Config",
                args: {}, // Reads $storage.lastConfig automatically
            },
        ],
        deliverables: [
            {
                key: "mesh-config",
                label: "Network Config",
                type: "json",
                description: "The AI-generated MeshConfig JSON",
            },
            {
                key: "topology",
                label: "Network Topology",
                type: "json",
                description: "Final topology snapshot after deployment",
            },
        ],
        storageDefaults: {},
        createdAt: 0, // Epoch 0 marks built-in
        updatedAt: 0,
    },
];

/** Check whether a job definition ID is a built-in seed */
export function isSeedJob(id: string): boolean {
    return id.startsWith(SEED_JOB_PREFIX);
}

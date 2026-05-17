/**
 * Orchestrator toolkit commands.
 *
 * Thin wrappers around {@link orchestratorService}. Node-scoped commands
 * accept an optional `nodeId`; when omitted they target the currently
 * active orchestrator node.
 */

import type { CommandDefinition } from "@/services/commands/types";
import type { JobArtifact } from "@/types";
import { orchestratorService } from "../service";
import type { OrchestratorManifest } from "../types/orchestrator";

const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local orchestrator node id. Defaults to the currently-active node.",
    required: false,
};

const ROLES_RW = ["orchestrator", "builder"] as const;
const ROLES_RO = ["orchestrator", "builder", "researcher"] as const;

// ── Node management ──

export const orchestratorAddNodeCommand: CommandDefinition = {
    id: "orchestrator_add_node",
    description: "Add a new orchestrator profile (a named stack with its own manifest selection).",
    tags: ["orchestrator", "manifest"],
    rbac: [...ROLES_RW],
    args: {
        label: { name: "label", type: "string", description: "Human label.", required: false },
    },
    output: "JSON with the created node id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const id = orchestratorService.addNode(typeof args.label === "string" ? args.label : undefined);
        context.workspace.addLog(`orchestrator: added stack ${id}`);
        return { nodeId: id };
    },
};

export const orchestratorRemoveNodeCommand: CommandDefinition = {
    id: "orchestrator_remove_node",
    description: "Remove an orchestrator profile.",
    tags: ["orchestrator"],
    rbac: [...ROLES_RW],
    args: { nodeId: { ...NODE_ID_ARG, required: true } },
    output: "{ ok: true }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await orchestratorService.removeNode(String(args.nodeId));
        context.workspace.addLog(`orchestrator: removed stack ${args.nodeId}`);
        return { ok: true };
    },
};

export const orchestratorSetActiveNodeCommand: CommandDefinition = {
    id: "orchestrator_set_active_node",
    description: "Set the active orchestrator profile.",
    tags: ["orchestrator"],
    rbac: [...ROLES_RW],
    args: { nodeId: { ...NODE_ID_ARG, required: true } },
    output: "{ activeId }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orchestratorService.setActive(String(args.nodeId));
        return { activeId: orchestratorService.getActiveId() };
    },
};

export const orchestratorRenameNodeCommand: CommandDefinition = {
    id: "orchestrator_rename_node",
    description: "Rename an orchestrator profile.",
    tags: ["orchestrator"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true },
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "{ nodeId, label }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orchestratorService.setLabel(String(args.nodeId), String(args.label));
        return { nodeId: args.nodeId, label: args.label };
    },
};

// ── Manifest selection ──

export const orchestratorSetManifestCommand: CommandDefinition = {
    id: "orchestrator_set_manifest",
    description:
        "Link a manifest artifact (by artifact id) to the active orchestrator profile.",
    tags: ["orchestrator", "manifest"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        artifactId: { name: "artifactId", type: "string", description: "Artifact id of a JSON manifest.", required: true },
    },
    output: "{ nodeId, manifestArtifactId }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, artifactId } = args;
        orchestratorService.setManifestArtifact(nodeId, String(artifactId));
        const snap = orchestratorService.getNode(nodeId).snapshot();
        return { nodeId: snap.nodeId, manifestArtifactId: snap.manifestArtifactId };
    },
};

// ── Apply / Reconcile / Export ──

export const orchestratorApplyManifestCommand: CommandDefinition = {
    id: "orchestrator_apply_manifest",
    description:
        "Apply the active node's manifest: create missing sub-nodes (libp2p / helia / orbitdb / kubo) and start them where requested.",
    tags: ["orchestrator", "manifest", "apply"],
    rbac: [...ROLES_RW],
    args: { nodeId: NODE_ID_ARG },
    output: "{ results: OperationResult[] }",
    outputSchema: { type: "object", additionalProperties: true },
    spawnsChildJobs: true,
    execute: async (args, context) => {
        const results = await orchestratorService.applyManifest(args.nodeId);
        const snap = orchestratorService.getNode(args.nodeId).snapshot();
        context.workspace.addLog(`orchestrator[${snap.label}]: applied manifest — ${results.length} operation(s)`);
        return { results, status: snap.status };
    },
};

export const orchestratorReconcileCommand: CommandDefinition = {
    id: "orchestrator_reconcile",
    description:
        "Compare current state against the manifest and report drift. Does NOT mutate sub-toolkits.",
    tags: ["orchestrator", "manifest", "reconcile"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "{ results: OperationResult[] }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const results = await orchestratorService.reconcile(args.nodeId);
        const snap = orchestratorService.getNode(args.nodeId).snapshot();
        context.workspace.addLog(`orchestrator[${snap.label}]: reconciled — status ${snap.status}`);
        return { results, status: snap.status };
    },
};

export const orchestratorExportManifestCommand: CommandDefinition = {
    id: "orchestrator_export_manifest",
    description:
        "Snapshot the current live state of all four L.O.H.K toolkits into a manifest object (does NOT save).",
    tags: ["orchestrator", "manifest", "export"],
    rbac: [...ROLES_RO],
    args: {
        name: { name: "name", type: "string", description: "Manifest name.", required: false, defaultValue: "Exported Stack" },
    },
    output: "OrchestratorManifest JSON",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const manifest = orchestratorService.exportManifest(
            typeof args.name === "string" ? args.name : undefined,
        );
        return manifest as unknown as Record<string, unknown>;
    },
};

export const orchestratorSaveManifestToArtifactCommand: CommandDefinition = {
    id: "orchestrator_save_manifest_to_artifact",
    description:
        "Export the current live state and save it as a JSON manifest artifact, then link it to the active profile.",
    tags: ["orchestrator", "manifest", "artifact"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        name: { name: "name", type: "string", description: "Manifest name.", required: false, defaultValue: "Exported Stack" },
    },
    output: "{ artifactId, manifest }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const manifest = orchestratorService.exportManifest(
            typeof args.name === "string" ? args.name : undefined,
        );
        const artifactId = orchestratorService.saveManifestToArtifact(manifest, args.nodeId);
        context.workspace.addLog(`orchestrator: saved manifest "${manifest.metadata.name}" as artifact ${artifactId}`);
        return { artifactId, manifest } as unknown as Record<string, unknown>;
    },
};

export const orchestratorLoadManifestCommand: CommandDefinition = {
    id: "orchestrator_load_manifest",
    description: "Read and parse the manifest currently linked to the active profile.",
    tags: ["orchestrator", "manifest"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "OrchestratorManifest JSON",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const manifest = orchestratorService.readManifest(args.nodeId);
        return manifest as unknown as Record<string, unknown>;
    },
};

export const orchestratorStatusCommand: CommandDefinition = {
    id: "orchestrator_status",
    description: "Report the orchestrator's status and last apply/reconcile results.",
    tags: ["orchestrator"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "OrchestratorSnapshot",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const snap = orchestratorService.getNode(args.nodeId).snapshot();
        return snap as unknown as Record<string, unknown>;
    },
};

export const orchestratorClearResultsCommand: CommandDefinition = {
    id: "orchestrator_clear_results",
    description: "Clear the rolling operation log for the active profile.",
    tags: ["orchestrator"],
    rbac: [...ROLES_RW],
    args: { nodeId: NODE_ID_ARG },
    output: "{ ok: true }",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orchestratorService.clearResults(args.nodeId);
        return { ok: true };
    },
};

export const orchestratorCommands: CommandDefinition[] = [
    orchestratorAddNodeCommand,
    orchestratorRemoveNodeCommand,
    orchestratorSetActiveNodeCommand,
    orchestratorRenameNodeCommand,
    orchestratorSetManifestCommand,
    orchestratorApplyManifestCommand,
    orchestratorReconcileCommand,
    orchestratorExportManifestCommand,
    orchestratorSaveManifestToArtifactCommand,
    orchestratorLoadManifestCommand,
    orchestratorStatusCommand,
    orchestratorClearResultsCommand,
];

// Re-export types for downstream tooling.
export type { JobArtifact, OrchestratorManifest };

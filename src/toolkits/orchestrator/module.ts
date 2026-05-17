/**
 * Orchestrator toolkit module — manifest, commands, agents, configuration.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import { orchestratorCommands } from "./commands";

export const orchestratorModule: ToolkitModule = {
    manifest: {
        id: "orchestrator",
        name: "Orchestrator",
        description:
            "Drive the four L.O.H.K toolkits (libp2p, helia, orbitdb, kubo) toward a declared desired state. " +
            "Manifests are stored as JSON artifacts in the workspace and applied / reconciled on demand.",
        icon: "Workflow",
        color: "#10b981",
        gradient: ["#10b981", "#059669"],
        category: "infrastructure",
        status: "available",
        builtIn: true,
        tags: ["orchestrator", "manifest", "lohk", "apply", "reconcile", "stack"],
        labels: { tier: "core", domain: "control-plane" },
        version: "0.1.0",
        author: { name: "decops", url: "https://decops.io" },
        license: "MIT",
        createdAt: "2026-05-22T00:00:00Z",
        updatedAt: "2026-05-22T00:00:00Z",
        dependencies: [],
    },

    commands: orchestratorCommands,
    tools: [],

    agents: [
        {
            id: "orchestrator-bot",
            name: "Orchestrator Bot",
            description:
                "Specialised AI sub-agent that drives the four L.O.H.K toolkits via manifest artifacts.",
            capabilities: [
                "Apply manifest artifacts across libp2p / helia / orbitdb / kubo",
                "Reconcile current state against a manifest and report drift",
                "Export the live state into a new manifest artifact",
                "Manage multiple orchestrator profiles (stacks)",
                "Coordinate sub-node bindings (helia→libp2p, orbitdb→helia)",
            ],
            status: "active",
        },
    ],

    configuration: {
        fields: [
            {
                key: "reconcileAfterApply",
                label: "Reconcile after apply",
                description: "Automatically reconcile after every apply to surface immediate drift.",
                type: "boolean",
                defaultValue: true,
            },
            {
                key: "allowExportToArtifact",
                label: "Allow exporting manifests",
                description: "Permit the orchestrator bot to create new manifest artifacts from current state.",
                type: "boolean",
                defaultValue: true,
            },
            {
                key: "defaultManifestArtifactId",
                label: "Default manifest artifact",
                description: "Optional artifact id loaded automatically for new orchestrator profiles.",
                type: "string",
                defaultValue: "",
            },
        ],
    },

    logging: {
        config: { minLevel: "info", maxEntries: 200 },
        channels: [
            { id: "orchestrator.apply", name: "Apply", description: "Manifest apply events" },
            { id: "orchestrator.reconcile", name: "Reconcile", description: "Reconcile / drift events" },
            { id: "orchestrator.manifest", name: "Manifest", description: "Manifest selection / export / save events" },
        ],
    },

    metrics: {
        definitions: [
            { name: "toolkit.orchestrator.stacks", description: "Total orchestrator profiles", type: "gauge" },
            { name: "toolkit.orchestrator.healthy", description: "Profiles reporting healthy", type: "gauge" },
            { name: "toolkit.orchestrator.drifted", description: "Profiles reporting drift", type: "gauge" },
        ],
        collect: () => ({
            "toolkit.orchestrator.stacks": 0,
            "toolkit.orchestrator.healthy": 0,
            "toolkit.orchestrator.drifted": 0,
        }),
    },

    rbac: {
        permissions: [
            { id: "orchestrator.apply", name: "Apply Manifest", description: "Apply manifests across L.O.H.K", resource: "manifest", actions: ["create", "update"] },
            { id: "orchestrator.reconcile", name: "Reconcile", description: "Read drift status", resource: "manifest", actions: ["read"] },
            { id: "orchestrator.export", name: "Export Manifest", description: "Snapshot live state", resource: "manifest", actions: ["create"] },
        ],
        roles: [
            { id: "orchestrator-viewer", name: "Orchestrator Viewer", description: "Read-only", permissions: ["orchestrator.reconcile"] },
            { id: "orchestrator-operator", name: "Orchestrator Operator", description: "Full orchestrator access", permissions: ["orchestrator.apply", "orchestrator.reconcile", "orchestrator.export"] },
        ],
        defaultRole: "orchestrator-operator",
    },

    docs: { documents: [] },
};

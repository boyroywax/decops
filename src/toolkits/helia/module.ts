/**
 * Helia Toolkit module — manifest, commands, configuration.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import { heliaCommands } from "./commands";

export const heliaModule: ToolkitModule = {
    manifest: {
        id: "helia",
        name: "Helia (IPFS)",
        description:
            "Run an in-browser IPFS node using Helia, composing on top of a libp2p instance. " +
            "Add and fetch content by CID, pin blocks, and reuse identities across toolkits.",
        icon: "Boxes",
        color: "#f59e0b",
        gradient: ["#f59e0b", "#fb923c"],
        category: "infrastructure",
        status: "available",
        builtIn: true,
        tags: ["helia", "ipfs", "p2p", "storage", "content-addressed"],
        labels: { tier: "core", domain: "storage" },
        version: "0.1.0",
        author: { name: "decops", url: "https://decops.io" },
        license: "MIT",
        createdAt: "2026-05-15T00:00:00Z",
        updatedAt: "2026-05-15T00:00:00Z",
        dependencies: [
            { id: "libp2p", version: "^0.1.0", minimumVersion: "0.1.0" },
        ],
    },

    commands: heliaCommands,
    tools: [],

    agents: [
        {
            id: "helia-bot",
            name: "Helia Bot",
            description:
                "Specialized AI sub-agent for IPFS content — add/fetch CIDs, pin management, libp2p binding.",
            capabilities: [
                "Start/stop helia nodes",
                "Bind to a libp2p instance (or auto-create one)",
                "Add text/JSON to IPFS",
                "Fetch CIDs (cat)",
                "Pin / unpin blocks",
            ],
            status: "active",
        },
    ],

    configuration: {
        fields: [
            {
                key: "autoStart",
                label: "Auto-start node",
                description: "Start the Helia node automatically when the toolkit loads.",
                type: "boolean",
                defaultValue: false,
            },
            {
                key: "autoCreateLibp2p",
                label: "Auto-create libp2p",
                description: "When no libp2p instance is selected, create a fresh one on start.",
                type: "boolean",
                defaultValue: true,
            },
        ],
    },

    logging: {
        config: { minLevel: "info", maxEntries: 200 },
        channels: [
            { id: "helia.node", name: "Node lifecycle", description: "Helia node start / stop events" },
            { id: "helia.content", name: "Content", description: "Add / fetch / pin events" },
        ],
    },

    metrics: {
        definitions: [
            { name: "toolkit.helia.nodes_running", description: "Currently running Helia nodes", type: "gauge" },
            { name: "toolkit.helia.entries_total", description: "Known content entries across nodes", type: "gauge" },
            { name: "toolkit.helia.pinned_total", description: "Total pinned CIDs across nodes", type: "gauge" },
        ],
        collect: () => ({
            "toolkit.helia.nodes_running": 0,
            "toolkit.helia.entries_total": 0,
            "toolkit.helia.pinned_total": 0,
        }),
    },

    rbac: {
        permissions: [
            { id: "helia.node", name: "Manage Node", description: "Start/stop helia nodes", resource: "node", actions: ["create", "delete"] },
            { id: "helia.content", name: "Manage Content", description: "Add, fetch and pin CIDs", resource: "content", actions: ["create", "read", "delete"] },
        ],
        roles: [
            { id: "helia-user", name: "Helia User", description: "Read-only IPFS access", permissions: ["helia.content"] },
            { id: "helia-admin", name: "Helia Admin", description: "Full helia access", permissions: ["helia.node", "helia.content"] },
        ],
        defaultRole: "helia-user",
    },

    docs: {
        documents: [],
    },
};

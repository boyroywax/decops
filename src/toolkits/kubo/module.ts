/**
 * Kubo IPFS Connector toolkit module — manifest, commands, agents, configuration.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import { kuboCommands } from "./commands";

export const kuboModule: ToolkitModule = {
    manifest: {
        id: "kubo",
        name: "Kubo IPFS Connector",
        description:
            "Connect to a remote Kubo (go-ipfs) daemon over its HTTP RPC API. Add, fetch and pin CIDs " +
            "against production IPFS infrastructure — including pinning services that speak the Kubo API.",
        icon: "Server",
        color: "#06b6d4",
        gradient: ["#06b6d4", "#0e7490"],
        category: "infrastructure",
        status: "available",
        builtIn: true,
        tags: ["kubo", "ipfs", "remote", "pin", "rpc"],
        labels: { tier: "core", domain: "storage" },
        version: "0.1.0",
        author: { name: "decops", url: "https://decops.io" },
        license: "MIT",
        createdAt: "2026-05-22T00:00:00Z",
        updatedAt: "2026-05-22T00:00:00Z",
        dependencies: [],
    },

    commands: kuboCommands,
    tools: [],

    agents: [
        {
            id: "kubo-bot",
            name: "Kubo Bot",
            description:
                "Specialised AI sub-agent for remote IPFS — connect to a Kubo daemon, add files, pin CIDs, fetch content.",
            capabilities: [
                "Connect / disconnect Kubo endpoints",
                "Add text, JSON and binary content via the remote daemon",
                "Pin / unpin CIDs remotely",
                "Fetch content by CID (cat / ls)",
                "Inspect remote peer identity and swarm",
            ],
            status: "active",
        },
    ],

    configuration: {
        fields: [
            {
                key: "defaultUrl",
                label: "Default API URL",
                description: "Default Kubo HTTP RPC URL for newly-added nodes.",
                type: "string",
                defaultValue: "http://127.0.0.1:5001",
            },
            {
                key: "autoPinOnAdd",
                label: "Pin on add",
                description: "Pin CIDs by default when adding content.",
                type: "boolean",
                defaultValue: true,
            },
            {
                key: "timeoutMs",
                label: "Request timeout (ms)",
                description: "Default per-request timeout for RPC calls.",
                type: "number",
                defaultValue: 20000,
            },
        ],
    },

    logging: {
        config: { minLevel: "info", maxEntries: 200 },
        channels: [
            { id: "kubo.connection", name: "Connection", description: "Connect / disconnect / handshake events" },
            { id: "kubo.content", name: "Content", description: "Add / cat / pin events" },
            { id: "kubo.swarm", name: "Swarm", description: "Remote swarm activity" },
        ],
    },

    metrics: {
        definitions: [
            { name: "toolkit.kubo.connected", description: "Currently-connected Kubo endpoints", type: "gauge" },
            { name: "toolkit.kubo.entries_total", description: "Local activity-log entries across nodes", type: "gauge" },
            { name: "toolkit.kubo.pinned_total", description: "Tracked pinned CIDs across nodes", type: "gauge" },
        ],
        collect: () => ({
            "toolkit.kubo.connected": 0,
            "toolkit.kubo.entries_total": 0,
            "toolkit.kubo.pinned_total": 0,
        }),
    },

    rbac: {
        permissions: [
            { id: "kubo.connection", name: "Manage Connection", description: "Connect/disconnect to Kubo endpoints", resource: "connection", actions: ["create", "delete"] },
            { id: "kubo.content", name: "Manage Content", description: "Add, fetch and pin CIDs remotely", resource: "content", actions: ["create", "read", "delete"] },
            { id: "kubo.swarm", name: "Manage Swarm", description: "Inspect / dial peers on the remote daemon", resource: "swarm", actions: ["read", "create"] },
        ],
        roles: [
            { id: "kubo-user", name: "Kubo User", description: "Read-only Kubo access", permissions: ["kubo.content"] },
            { id: "kubo-admin", name: "Kubo Admin", description: "Full Kubo access", permissions: ["kubo.connection", "kubo.content", "kubo.swarm"] },
        ],
        defaultRole: "kubo-user",
    },

    docs: { documents: [] },
};

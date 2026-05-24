/**
 * OrbitDB Server Connector toolkit module — manifest, commands, agents, configuration.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import { orbitdbServerCommands } from "./commands";

export const orbitdbServerModule: ToolkitModule = {
    manifest: {
        id: "orbitdb-server",
        name: "Lagrange",
        description:
            "Connect to a remote orbitdb-server (OrbitDB v2 HTTP RPC API). Open databases, write / query " +
            "entries, append events, manage the libp2p swarm and the private-network (pnet) configuration.",
        icon: "HardDrive",
        color: "#ec4899",
        gradient: ["#ec4899", "#a855f7"],
        category: "infrastructure",
        status: "available",
        builtIn: true,
        tags: ["orbitdb", "remote", "rpc", "libp2p", "pnet", "did"],
        labels: { tier: "core", domain: "storage" },
        version: "0.1.0",
        author: { name: "decops", url: "https://decops.io" },
        license: "MIT",
        createdAt: "2026-05-23T00:00:00Z",
        updatedAt: "2026-05-23T00:00:00Z",
        dependencies: [],
    },

    commands: orbitdbServerCommands,
    tools: [],

    agents: [
        {
            id: "orbitdb-server-bot",
            name: "Lagrange Bot",
            description:
                "Specialised AI sub-agent for remote orbitdb-server — open databases, write entries, query documents, manage pnet.",
            capabilities: [
                "Connect / disconnect orbitdb-server endpoints",
                "Open and drop databases (events / documents / keyvalue / keyvalue-indexed)",
                "Put / get / delete entries and query documents",
                "Append to event logs",
                "Inspect remote peer identity, DID and pnet status",
                "Manage libp2p swarm peers",
            ],
            status: "active",
        },
    ],

    configuration: {
        fields: [
            {
                key: "defaultUrl",
                label: "Default API URL",
                description: "Default orbitdb-server base URL for newly-added nodes.",
                type: "string",
                defaultValue: "http://127.0.0.1:3000",
            },
            {
                key: "autoCreateMissingDb",
                label: "Auto-create missing databases",
                description: "When the bot is asked to put/get against a db it hasn't opened, create it automatically.",
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
            { id: "orbitdb-server.connection", name: "Connection", description: "Connect / disconnect / handshake events" },
            { id: "orbitdb-server.databases", name: "Databases", description: "Create / drop / put / get / del / query" },
            { id: "orbitdb-server.swarm", name: "Swarm", description: "Remote libp2p swarm activity" },
            { id: "orbitdb-server.pnet", name: "Pnet", description: "Private network mode + swarm key events" },
        ],
    },

    metrics: {
        definitions: [
            { name: "toolkit.orbitdb_server.connected", description: "Currently-connected orbitdb-server endpoints", type: "gauge" },
            { name: "toolkit.orbitdb_server.databases_total", description: "Open databases across nodes", type: "gauge" },
            { name: "toolkit.orbitdb_server.swarm_peers", description: "Swarm peers observed across nodes", type: "gauge" },
            { name: "toolkit.orbitdb_server.private_nodes", description: "Nodes running in pnet=private mode", type: "gauge" },
        ],
        collect: () => ({
            "toolkit.orbitdb_server.connected": 0,
            "toolkit.orbitdb_server.databases_total": 0,
            "toolkit.orbitdb_server.swarm_peers": 0,
            "toolkit.orbitdb_server.private_nodes": 0,
        }),
    },

    rbac: {
        permissions: [
            { id: "orbitdb-server.connection", name: "Manage Connection", description: "Connect/disconnect orbitdb-server endpoints", resource: "connection", actions: ["create", "delete"] },
            { id: "orbitdb-server.databases", name: "Manage Databases", description: "Open / drop / read / write databases", resource: "databases", actions: ["create", "read", "update", "delete"] },
            { id: "orbitdb-server.swarm", name: "Manage Swarm", description: "Inspect / dial peers", resource: "swarm", actions: ["read", "create"] },
            { id: "orbitdb-server.pnet", name: "Manage Pnet", description: "View / generate pnet swarm keys", resource: "pnet", actions: ["read", "create"] },
        ],
        roles: [
            { id: "orbitdb-server-user", name: "OrbitDB Server User", description: "Read-only access", permissions: ["orbitdb-server.databases"] },
            { id: "orbitdb-server-admin", name: "OrbitDB Server Admin", description: "Full access", permissions: ["orbitdb-server.connection", "orbitdb-server.databases", "orbitdb-server.swarm", "orbitdb-server.pnet"] },
        ],
        defaultRole: "orbitdb-server-user",
    },

    docs: { documents: [] },
};

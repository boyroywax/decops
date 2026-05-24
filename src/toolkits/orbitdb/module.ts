/**
 * OrbitDB Toolkit module — manifest, commands, configuration.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import { orbitdbCommands } from "./commands";

export const orbitdbModule: ToolkitModule = {
    manifest: {
        id: "orbitdb",
        name: "OrbitDB",
        description:
            "Run decentralized databases (event log, key-value, documents) directly in the browser. " +
            "OrbitDB composes on top of Helia (IPFS) which itself sits on libp2p, giving you " +
            "peer-to-peer, conflict-free, append-only data with content-addressed identity.",
        icon: "Database",
        color: "#a855f7",
        gradient: ["#a855f7", "#c084fc"],
        category: "infrastructure",
        status: "available",
        builtIn: true,
        tags: ["orbitdb", "database", "p2p", "crdt", "decentralized"],
        labels: { tier: "core", domain: "database" },
        version: "0.1.0",
        author: { name: "decops", url: "https://decops.io" },
        license: "MIT",
        createdAt: "2026-05-15T00:00:00Z",
        updatedAt: "2026-05-15T00:00:00Z",
        dependencies: [
            { id: "helia", version: "^0.1.0", minimumVersion: "0.1.0" },
            { id: "libp2p", version: "^0.1.0", minimumVersion: "0.1.0" },
        ],
    },

    commands: orbitdbCommands,
    // Curated direct LLM tools — database hot path. Node lifecycle, identity
    // management, drop/close and helia binding stay registry-only.
    tools: [
        {
            id: "orbitdb.start",
            name: "Start OrbitDB Node",
            description: "Start the active OrbitDB node.",
            commandId: "orbitdb_start",
        },
        {
            id: "orbitdb.open",
            name: "Open Database",
            description: "Open an OrbitDB database by name (events, keyvalue, or documents).",
            commandId: "orbitdb_open",
        },
        {
            id: "orbitdb.listDbs",
            name: "List Databases",
            description: "List databases currently opened on the active node.",
            commandId: "orbitdb_list_dbs",
        },
        {
            id: "orbitdb.put",
            name: "Put Document",
            description: "Insert/replace a document in a documents-type database.",
            commandId: "orbitdb_put",
        },
        {
            id: "orbitdb.kvPut",
            name: "KV Put",
            description: "Set a key in a keyvalue-type database.",
            commandId: "orbitdb_kv_put",
        },
        {
            id: "orbitdb.kvGet",
            name: "KV Get",
            description: "Read a key from a keyvalue-type database.",
            commandId: "orbitdb_kv_get",
        },
        {
            id: "orbitdb.logAdd",
            name: "Log Add",
            description: "Append an entry to an events-type log database.",
            commandId: "orbitdb_log_add",
        },
    ],

    agents: [
        {
            id: "orbitdb-bot",
            name: "OrbitDB Bot",
            description:
                "Specialized AI sub-agent for OrbitDB — open databases, write/read entries, query documents.",
            capabilities: [
                "Start/stop OrbitDB nodes",
                "Open events / keyvalue / documents databases",
                "Append events / put kv / put documents",
                "Query and iterate entries",
                "Manage identities and helia binding",
            ],
            status: "active",
        },
    ],

    configuration: {
        fields: [
            {
                key: "autoStart",
                label: "Auto-start node",
                description: "Start the OrbitDB node automatically when the toolkit loads.",
                type: "boolean",
                defaultValue: false,
            },
            {
                key: "autoStartHelia",
                label: "Auto-start Helia",
                description: "When no helia node is running, start the active one before orbitdb_start.",
                type: "boolean",
                defaultValue: true,
            },
        ],
    },

    logging: {
        config: { minLevel: "info", maxEntries: 200 },
        channels: [
            { id: "orbitdb.node", name: "Node lifecycle", description: "OrbitDB node start / stop events" },
            { id: "orbitdb.db", name: "Database", description: "Open / close / drop database events" },
            { id: "orbitdb.write", name: "Writes", description: "Put / add / del events" },
        ],
    },

    metrics: {
        definitions: [
            { name: "toolkit.orbitdb.nodes_running", description: "Currently running OrbitDB nodes", type: "gauge" },
            { name: "toolkit.orbitdb.databases_open", description: "Currently open databases", type: "gauge" },
            { name: "toolkit.orbitdb.entries_total", description: "Total entries across all databases", type: "gauge" },
        ],
        collect: () => ({
            "toolkit.orbitdb.nodes_running": 0,
            "toolkit.orbitdb.databases_open": 0,
            "toolkit.orbitdb.entries_total": 0,
        }),
    },

    rbac: {
        permissions: [
            { id: "orbitdb.node", name: "Manage Node", description: "Start/stop orbitdb nodes", resource: "node", actions: ["create", "delete"] },
            { id: "orbitdb.db", name: "Manage Databases", description: "Open / close / drop databases", resource: "database", actions: ["create", "read", "delete"] },
            { id: "orbitdb.write", name: "Write Data", description: "Put / add / del entries", resource: "data", actions: ["create", "update", "delete"] },
        ],
        roles: [
            { id: "orbitdb-reader", name: "OrbitDB Reader", description: "Read-only", permissions: ["orbitdb.db"] },
            { id: "orbitdb-writer", name: "OrbitDB Writer", description: "Read + write", permissions: ["orbitdb.db", "orbitdb.write"] },
            { id: "orbitdb-admin", name: "OrbitDB Admin", description: "Full access", permissions: ["orbitdb.node", "orbitdb.db", "orbitdb.write"] },
        ],
        defaultRole: "orbitdb-reader",
    },

    docs: { documents: [] },
};

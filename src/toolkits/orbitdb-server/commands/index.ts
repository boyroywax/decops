/**
 * OrbitDB Server toolkit commands.
 *
 * Thin wrappers around {@link orbitdbServerService} so each capability is
 * invokable from chat, jobs, or the React UI. Node-scoped commands accept
 * an optional `nodeId`; when omitted they target the currently-active node.
 */

import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbServerService } from "../service";
import { ORBITDB_SERVER_STORE_TYPES, type OrbitdbServerStoreType } from "../types/orbitdbServer";

const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local node id. Defaults to the currently-active orbitdb-server node.",
    required: false,
};

const ROLES_RW = ["orchestrator", "builder"] as const;
const ROLES_RO = ["orchestrator", "builder", "researcher"] as const;

function asStoreType(value: unknown): OrbitdbServerStoreType {
    if (typeof value === "string" && (ORBITDB_SERVER_STORE_TYPES as string[]).includes(value)) {
        return value as OrbitdbServerStoreType;
    }
    return "keyvalue";
}

// ── Lifecycle ──

export const orbitdbServerConnectCommand: CommandDefinition = {
    id: "orbitdb_server_connect",
    description:
        "Connect to a remote orbitdb-server (OrbitDB v2 HTTP RPC API). " +
        "Probes `/health`, then `/id` to fetch the remote peer / DID / pnet status.",
    tags: ["orbitdb", "orbitdb-server", "connect"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        url: { name: "url", type: "string", description: "Override the configured API URL.", required: false },
        authorization: { name: "authorization", type: "string", description: "Authorization header value (e.g. 'Bearer …').", required: false },
        timeoutMs: { name: "timeoutMs", type: "number", description: "Per-request timeout in ms.", required: false },
    },
    output: "JSON object with the remote peer identity.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, url, authorization, timeoutMs } = args;
        await orbitdbServerService.connect({
            url: typeof url === "string" && url.trim() ? url.trim() : undefined,
            authorization: typeof authorization === "string" ? authorization : undefined,
            timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
        }, nodeId);
        const snap = orbitdbServerService.getNode(nodeId).snapshot();
        context.workspace.addLog(`orbitdb-server[${snap.label}] connected → ${snap.peer?.peerId?.slice(0, 16) ?? "?"}…`);
        return { nodeId: snap.nodeId, label: snap.label, endpoint: snap.endpoint, peer: snap.peer };
    },
};

export const orbitdbServerDisconnectCommand: CommandDefinition = {
    id: "orbitdb_server_disconnect",
    description: "Drop the local connection state. The remote server keeps running.",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RW],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the final status.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        orbitdbServerService.disconnect(args.nodeId);
        const snap = orbitdbServerService.getNode(args.nodeId).snapshot();
        context.workspace.addLog(`orbitdb-server[${snap.label}] disconnected`);
        return { nodeId: snap.nodeId, status: snap.status };
    },
};

export const orbitdbServerAddNodeCommand: CommandDefinition = {
    id: "orbitdb_server_add_node",
    description: "Register a new orbitdb-server endpoint (does not connect).",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RW],
    args: {
        label: { name: "label", type: "string", description: "Human label.", required: false },
        url: { name: "url", type: "string", description: "Base URL (default: http://127.0.0.1:3000).", required: false },
    },
    output: "Created node id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const id = orbitdbServerService.addNode(
            typeof args.label === "string" ? args.label : undefined,
            typeof args.url === "string" && args.url.trim() ? args.url.trim() : undefined,
        );
        context.workspace.addLog(`orbitdb-server: added node ${id}`);
        return { nodeId: id };
    },
};

export const orbitdbServerRemoveNodeCommand: CommandDefinition = {
    id: "orbitdb_server_remove_node",
    description: "Remove an orbitdb-server node from the local registry.",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RW],
    args: { nodeId: { name: "nodeId", type: "string", description: "Node id to remove.", required: true } },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await orbitdbServerService.removeNode(String(args.nodeId));
        context.workspace.addLog(`orbitdb-server: removed node ${args.nodeId}`);
        return { ok: true };
    },
};

export const orbitdbServerSetActiveNodeCommand: CommandDefinition = {
    id: "orbitdb_server_set_active_node",
    description: "Set the active orbitdb-server node — subsequent commands default to it.",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RW],
    args: { nodeId: { name: "nodeId", type: "string", description: "Node id.", required: true } },
    output: "JSON object with the new active id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orbitdbServerService.setActive(String(args.nodeId));
        return { activeId: orbitdbServerService.getActiveId() };
    },
};

export const orbitdbServerRenameNodeCommand: CommandDefinition = {
    id: "orbitdb_server_rename_node",
    description: "Rename an orbitdb-server node.",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: { name: "nodeId", type: "string", description: "Node id.", required: true },
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "JSON object with the updated label.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orbitdbServerService.setLabel(String(args.nodeId), String(args.label));
        return { nodeId: args.nodeId, label: args.label };
    },
};

export const orbitdbServerSetEndpointCommand: CommandDefinition = {
    id: "orbitdb_server_set_endpoint",
    description: "Update endpoint URL / auth / timeout. Node must be disconnected first.",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        url: { name: "url", type: "string", description: "Base URL.", required: false },
        authorization: { name: "authorization", type: "string", description: "Auth header value. Empty string clears.", required: false },
        timeoutMs: { name: "timeoutMs", type: "number", description: "Request timeout in ms.", required: false },
    },
    output: "JSON object with the updated config.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orbitdbServerService.setConfig(args.nodeId, {
            endpoint: typeof args.url === "string" ? args.url : undefined,
            authorization: typeof args.authorization === "string" ? args.authorization : undefined,
            timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
        });
        const snap = orbitdbServerService.getNode(args.nodeId).snapshot();
        return { nodeId: snap.nodeId, endpoint: snap.endpoint };
    },
};

// ── Identity / status ──

export const orbitdbServerIdCommand: CommandDefinition = {
    id: "orbitdb_server_id",
    description: "Re-issue the `/id` call — returns the remote peer id, DID, and pnet status.",
    tags: ["orbitdb-server", "identity"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with peerId / did / addresses / pnetMode.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const peer = await orbitdbServerService.refresh(args.nodeId);
        return peer ?? {};
    },
};

export const orbitdbServerHealthCommand: CommandDefinition = {
    id: "orbitdb_server_health",
    description: "Hit `/health` — liveness probe (no auth required).",
    tags: ["orbitdb-server"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with ok flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => orbitdbServerService.health(args.nodeId),
};

// ── Database lifecycle ──

export const orbitdbServerCreateDbCommand: CommandDefinition = {
    id: "orbitdb_server_create_db",
    description:
        "Create / open a database on the server. Types: events, documents, keyvalue, keyvalue-indexed.",
    tags: ["orbitdb-server", "db", "create"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        name: { name: "name", type: "string", description: "Database name.", required: true },
        type: { name: "type", type: "string", description: "Store type (default: keyvalue).", required: false },
    },
    output: "JSON object describing the open database.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const name = String(args.name);
        const type = asStoreType(args.type);
        const entry = await orbitdbServerService.createDatabase(name, type, args.nodeId);
        context.workspace.addLog(`orbitdb-server: opened ${type} db "${name}"`);
        return entry;
    },
};

export const orbitdbServerDropDbCommand: CommandDefinition = {
    id: "orbitdb_server_drop_db",
    description: "Drop a database on the server. Irreversible.",
    tags: ["orbitdb-server", "db"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        name: { name: "name", type: "string", description: "Database name.", required: true },
    },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await orbitdbServerService.dropDatabase(String(args.name), args.nodeId);
        context.workspace.addLog(`orbitdb-server: dropped db "${args.name}"`);
        return { name: args.name, ok: true };
    },
};

export const orbitdbServerListDbsCommand: CommandDefinition = {
    id: "orbitdb_server_list_dbs",
    description: "List databases the server currently has open.",
    tags: ["orbitdb-server", "db"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the database list.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const dbs = await orbitdbServerService.listDatabases(args.nodeId);
        return { count: dbs.length, databases: dbs };
    },
};

// ── Data operations ──

export const orbitdbServerPutCommand: CommandDefinition = {
    id: "orbitdb_server_put",
    description: "Put a value into a keyvalue / documents store (body is the JSON value).",
    tags: ["orbitdb-server", "db", "put"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        db: { name: "db", type: "string", description: "Database name.", required: true },
        key: { name: "key", type: "string", description: "Key (omit for documents stores using _id in the value).", required: false },
        value: { name: "value", type: "object", description: "JSON-serialisable value.", required: true },
    },
    output: "JSON object with the entry hash.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const r = await orbitdbServerService.put(
            String(args.db),
            typeof args.key === "string" ? args.key : undefined,
            args.value,
            args.nodeId,
        );
        context.workspace.addLog(`orbitdb-server: put → ${r.hash?.slice(0, 12) ?? "?"}…`);
        return r;
    },
};

export const orbitdbServerGetCommand: CommandDefinition = {
    id: "orbitdb_server_get",
    description: "Get a value by key from a keyvalue / documents store.",
    tags: ["orbitdb-server", "db", "get"],
    rbac: [...ROLES_RO],
    args: {
        nodeId: NODE_ID_ARG,
        db: { name: "db", type: "string", description: "Database name.", required: true },
        key: { name: "key", type: "string", description: "Key / document id.", required: true },
    },
    output: "JSON object with the retrieved value.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const v = await orbitdbServerService.get(String(args.db), String(args.key), args.nodeId);
        return { db: args.db, key: args.key, value: v };
    },
};

export const orbitdbServerDelCommand: CommandDefinition = {
    id: "orbitdb_server_del",
    description: "Delete an entry by key from a keyvalue / documents store.",
    tags: ["orbitdb-server", "db"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        db: { name: "db", type: "string", description: "Database name.", required: true },
        key: { name: "key", type: "string", description: "Key / document id.", required: true },
    },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await orbitdbServerService.del(String(args.db), String(args.key), args.nodeId);
        context.workspace.addLog(`orbitdb-server: del ${args.db}/${args.key}`);
        return { ok: true };
    },
};

export const orbitdbServerAllCommand: CommandDefinition = {
    id: "orbitdb_server_all",
    description: "Return all entries from a database.",
    tags: ["orbitdb-server", "db", "read"],
    rbac: [...ROLES_RO],
    args: {
        nodeId: NODE_ID_ARG,
        db: { name: "db", type: "string", description: "Database name.", required: true },
    },
    output: "JSON object with all rows.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const rows = await orbitdbServerService.all(String(args.db), args.nodeId);
        return { db: args.db, count: rows.length, rows };
    },
};

export const orbitdbServerQueryCommand: CommandDefinition = {
    id: "orbitdb_server_query",
    description: "Query a documents store with a filter object (server-side equality match).",
    tags: ["orbitdb-server", "db", "query"],
    rbac: [...ROLES_RO],
    args: {
        nodeId: NODE_ID_ARG,
        db: { name: "db", type: "string", description: "Database name.", required: true },
        filter: { name: "filter", type: "object", description: "Filter object, e.g. { role: 'admin' }.", required: true },
    },
    output: "JSON object with matching rows.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const filter = (args.filter && typeof args.filter === "object" ? args.filter : {}) as Record<string, unknown>;
        const rows = await orbitdbServerService.query(String(args.db), filter, args.nodeId);
        return { db: args.db, count: rows.length, rows };
    },
};

export const orbitdbServerAddEventCommand: CommandDefinition = {
    id: "orbitdb_server_add_event",
    description: "Append an event to an `events` log database.",
    tags: ["orbitdb-server", "db", "event"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        db: { name: "db", type: "string", description: "Events log database name.", required: true },
        value: { name: "value", type: "object", description: "Event payload.", required: true },
    },
    output: "JSON object with the entry hash.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const r = await orbitdbServerService.add(String(args.db), args.value, args.nodeId);
        context.workspace.addLog(`orbitdb-server: appended event → ${r.hash?.slice(0, 12) ?? "?"}…`);
        return r;
    },
};

// ── Swarm ──

export const orbitdbServerSwarmPeersCommand: CommandDefinition = {
    id: "orbitdb_server_swarm_peers",
    description: "List libp2p peers currently connected to the remote server.",
    tags: ["orbitdb-server", "swarm", "p2p"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with connected peers.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const peers = await orbitdbServerService.swarmListPeers(args.nodeId);
        return { count: peers.length, peers };
    },
};

export const orbitdbServerSwarmConnectCommand: CommandDefinition = {
    id: "orbitdb_server_swarm_connect",
    description: "Tell the server to dial a multiaddr.",
    tags: ["orbitdb-server", "swarm"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        multiaddr: { name: "multiaddr", type: "string", description: "e.g. /ip4/1.2.3.4/tcp/4001/p2p/12D3…", required: true },
    },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await orbitdbServerService.swarmConnect(String(args.multiaddr), args.nodeId);
        context.workspace.addLog(`orbitdb-server: swarm.connect → ${String(args.multiaddr).slice(0, 32)}…`);
        return { multiaddr: args.multiaddr, ok: true };
    },
};

// ── Pnet ──

export const orbitdbServerPnetStatusCommand: CommandDefinition = {
    id: "orbitdb_server_pnet_status",
    description: "Report the private-network mode and (truncated) swarm key fingerprint.",
    tags: ["orbitdb-server", "pnet"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with mode + fingerprint.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => orbitdbServerService.pnetStatus(args.nodeId),
};

export const orbitdbServerPnetGenerateCommand: CommandDefinition = {
    id: "orbitdb_server_pnet_generate",
    description:
        "Ask the server to generate a fresh pnet swarm key. NOTE: the server does not auto-apply it — copy to config/swarm.key and restart.",
    tags: ["orbitdb-server", "pnet"],
    rbac: [...ROLES_RW],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the swarm key contents.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const r = await orbitdbServerService.pnetGenerate(args.nodeId);
        context.workspace.addLog("orbitdb-server: generated new pnet swarm key");
        return r;
    },
};

// ── Bundle ──

export const orbitdbServerCommands: CommandDefinition[] = [
    orbitdbServerConnectCommand,
    orbitdbServerDisconnectCommand,
    orbitdbServerAddNodeCommand,
    orbitdbServerRemoveNodeCommand,
    orbitdbServerSetActiveNodeCommand,
    orbitdbServerRenameNodeCommand,
    orbitdbServerSetEndpointCommand,
    orbitdbServerIdCommand,
    orbitdbServerHealthCommand,
    orbitdbServerCreateDbCommand,
    orbitdbServerDropDbCommand,
    orbitdbServerListDbsCommand,
    orbitdbServerPutCommand,
    orbitdbServerGetCommand,
    orbitdbServerDelCommand,
    orbitdbServerAllCommand,
    orbitdbServerQueryCommand,
    orbitdbServerAddEventCommand,
    orbitdbServerSwarmPeersCommand,
    orbitdbServerSwarmConnectCommand,
    orbitdbServerPnetStatusCommand,
    orbitdbServerPnetGenerateCommand,
];

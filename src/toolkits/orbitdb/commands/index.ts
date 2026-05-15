/**
 * OrbitDB toolkit commands.
 *
 * Commands wrap the orbitdbService manager so they can be invoked from
 * chat / job pipelines as well as from the UI. Every node-scoped command
 * accepts an optional `nodeId` arg defaulting to the active orbitdb node.
 */

import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbService } from "../service";
import { heliaService } from "@/toolkits/helia/service";
import type { OrbitdbDbType } from "../types/orbitdb";

const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local orbitdb node id. Defaults to the currently-active node.",
    required: false,
};

const ADDRESS_ARG = {
    name: "address",
    type: "string" as const,
    description: "OrbitDB database address (`/orbitdb/<hash>`) or local name passed to `orbitdb_open`.",
    required: true,
};

const VALID_TYPES: OrbitdbDbType[] = ["events", "keyvalue", "keyvalue-indexed", "documents"];

function parseValue(raw: unknown): unknown {
    if (typeof raw !== "string") return raw;
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (
        trimmed.startsWith("{") || trimmed.startsWith("[") ||
        trimmed === "true" || trimmed === "false" || trimmed === "null" ||
        /^-?\d/.test(trimmed)
    ) {
        try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    return raw;
}

// ── Lifecycle ─────────────────────────────────────────────────────

export const orbitdbStartCommand: CommandDefinition = {
    id: "orbitdb_start",
    description:
        "Start an OrbitDB node, binding it to a Helia (IPFS) instance. " +
        "When `heliaNodeId` is omitted, the active helia node is used (and started if needed).",
    tags: ["orbitdb", "ipfs", "database"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        heliaNodeId: {
            name: "heliaNodeId",
            type: "string",
            description: "Local helia node id to attach to. Auto-started if not running.",
            required: false,
        },
        identityId: {
            name: "identityId",
            type: "string",
            description: "Optional identity id (deterministic across restarts).",
            required: false,
        },
    },
    output: "JSON snapshot of the started orbitdb node.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, heliaNodeId, identityId } = args;
        await orbitdbService.start({
            heliaNodeId: typeof heliaNodeId === "string" && heliaNodeId.trim() ? heliaNodeId : undefined,
            identityId: typeof identityId === "string" && identityId.trim() ? identityId : undefined,
        }, nodeId);
        const snap = orbitdbService.getNode(nodeId).snapshot();
        context.workspace.addLog(
            `orbitdb[${snap.label}] started — helia ${snap.heliaNodeId ?? "(none)"}, identity ${snap.identityId?.slice(0, 16) ?? "?"}…`,
        );
        return snap;
    },
};

export const orbitdbStopCommand: CommandDefinition = {
    id: "orbitdb_stop",
    description: "Stop a running OrbitDB node, closing all open databases.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the final status.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId } = args;
        await orbitdbService.stop(nodeId);
        const snap = orbitdbService.getNode(nodeId).snapshot();
        context.workspace.addLog(`orbitdb[${snap.label}] stopped`);
        return { nodeId: snap.nodeId, status: snap.status };
    },
};

export const orbitdbAddNodeCommand: CommandDefinition = {
    id: "orbitdb_add_node",
    description: "Create a new (stopped) OrbitDB node. Optionally pre-bind it to a helia node.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: { name: "label", type: "string", description: "Display label.", required: false },
        heliaNodeId: {
            name: "heliaNodeId",
            type: "string",
            description: "Optional helia node id to pre-bind.",
            required: false,
        },
    },
    output: "JSON object { nodeId }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { label, heliaNodeId } = args;
        const id = orbitdbService.addNode(
            typeof label === "string" ? label : undefined,
            typeof heliaNodeId === "string" && heliaNodeId.trim() ? heliaNodeId : null,
        );
        return { nodeId: id };
    },
};

export const orbitdbRemoveNodeCommand: CommandDefinition = {
    id: "orbitdb_remove_node",
    description: "Stop and remove an OrbitDB node.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: { ...NODE_ID_ARG, required: true } },
    output: "JSON object { removed: boolean }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        await orbitdbService.removeNode(String(args.nodeId));
        return { removed: true };
    },
};

export const orbitdbSetActiveNodeCommand: CommandDefinition = {
    id: "orbitdb_set_active_node",
    description: "Set the active OrbitDB node used by other commands when nodeId is omitted.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: { ...NODE_ID_ARG, required: true } },
    output: "JSON object { activeId }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orbitdbService.setActive(String(args.nodeId));
        return { activeId: orbitdbService.getActiveId() };
    },
};

export const orbitdbRenameNodeCommand: CommandDefinition = {
    id: "orbitdb_rename_node",
    description: "Rename an OrbitDB node.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true },
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "JSON object { nodeId, label }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        orbitdbService.setLabel(String(args.nodeId), String(args.label));
        return { nodeId: args.nodeId, label: args.label };
    },
};

export const orbitdbSetHeliaCommand: CommandDefinition = {
    id: "orbitdb_set_helia",
    description: "Bind an OrbitDB node to a (different) helia node id. Node must be stopped.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        heliaNodeId: {
            name: "heliaNodeId",
            type: "string",
            description: "Helia node id to bind to. Use empty string to clear (use active on next start).",
            required: true,
        },
    },
    output: "JSON object { nodeId, heliaNodeId }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const helia = String(args.heliaNodeId).trim();
        orbitdbService.setHeliaBinding(args.nodeId as string | undefined, helia ? helia : null);
        return { nodeId: args.nodeId, heliaNodeId: helia || null };
    },
};

export const orbitdbListNodesCommand: CommandDefinition = {
    id: "orbitdb_list_nodes",
    description: "List all OrbitDB nodes managed locally.",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {},
    output: "JSON manager snapshot.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async () => orbitdbService.snapshot(),
};

export const orbitdbListHeliaNodesCommand: CommandDefinition = {
    id: "orbitdb_list_helia_nodes",
    description: "List the helia nodes available to bind to.",
    tags: ["orbitdb", "helia"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {},
    output: "JSON array of helia snapshots.",
    outputSchema: { type: "array" },
    execute: async () => heliaService.snapshot().nodes,
};

// ── Database management ───────────────────────────────────────────

export const orbitdbOpenCommand: CommandDefinition = {
    id: "orbitdb_open",
    description:
        "Open (or create) a database. Pass a friendly local name to create a new one, or a full " +
        "`/orbitdb/...` address to attach to an existing one.",
    tags: ["orbitdb", "database"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        addressOrName: {
            name: "addressOrName",
            type: "string",
            description: "Local name (creates a new db) or `/orbitdb/...` address.",
            required: true,
        },
        type: {
            name: "type",
            type: "string",
            description: `Database type — one of: ${VALID_TYPES.join(", ")}.`,
            required: false,
        },
        indexBy: {
            name: "indexBy",
            type: "string",
            description: "documents-only: field name used as the primary key (default: `_id`).",
            required: false,
        },
        meta: {
            name: "meta",
            type: "object",
            description: "Optional manifest meta (sealed into the database manifest).",
            required: false,
        },
        sync: {
            name: "sync",
            type: "boolean",
            description: "Eagerly sync from peers when opening (default: orbitdb default).",
            required: false,
        },
    },
    output: "JSON describing the opened database.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, addressOrName, type, indexBy, meta, sync } = args;
        const t = typeof type === "string" && (VALID_TYPES as string[]).includes(type)
            ? (type as OrbitdbDbType) : "events";
        const info = await orbitdbService.openDatabase(String(addressOrName), {
            type: t,
            indexBy: typeof indexBy === "string" && indexBy.trim() ? indexBy : undefined,
            meta: meta && typeof meta === "object" ? meta as Record<string, unknown> : undefined,
            sync: typeof sync === "boolean" ? sync : undefined,
        }, nodeId);
        context.workspace.addLog(`orbitdb opened ${info.type} db "${info.name}" (${info.address})`);
        return info;
    },
};

export const orbitdbCloseCommand: CommandDefinition = {
    id: "orbitdb_close",
    description: "Close an open database (does not delete data).",
    tags: ["orbitdb", "database"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG, address: ADDRESS_ARG },
    output: "JSON object { closed: true }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        await orbitdbService.closeDatabase(String(args.address), args.nodeId as string | undefined);
        return { closed: true };
    },
};

export const orbitdbDropCommand: CommandDefinition = {
    id: "orbitdb_drop",
    description: "Drop a database — DELETES all local data on disk.",
    tags: ["orbitdb", "database"],
    rbac: ["orchestrator"],
    args: { nodeId: NODE_ID_ARG, address: ADDRESS_ARG },
    output: "JSON object { dropped: true }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        await orbitdbService.dropDatabase(String(args.address), args.nodeId as string | undefined);
        return { dropped: true };
    },
};

export const orbitdbListDbsCommand: CommandDefinition = {
    id: "orbitdb_list_dbs",
    description: "List databases known to an OrbitDB node (open or remembered).",
    tags: ["orbitdb"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON array of database descriptors.",
    outputSchema: { type: "array" },
    execute: async (args) => orbitdbService.listDatabases(args.nodeId as string | undefined),
};

// ── Identity / address ────────────────────────────────────────────

export const orbitdbGetIdentityCommand: CommandDefinition = {
    id: "orbitdb_get_identity",
    description: "Get the OrbitDB identity, peer id and address summary for a node.",
    tags: ["orbitdb", "identity"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object describing identity.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const snap = orbitdbService.getNode(args.nodeId as string | undefined).snapshot();
        return {
            nodeId: snap.nodeId,
            identityId: snap.identityId,
            peerId: snap.peerId,
            heliaNodeId: snap.heliaNodeId,
            status: snap.status,
        };
    },
};

// ── Generic write (dispatches by db type) ─────────────────────────

export const orbitdbPutCommand: CommandDefinition = {
    id: "orbitdb_put",
    description:
        "Generic write — dispatches by database type. " +
        "events: pass `value`. keyvalue: pass `key` + `value`. documents: pass `value` (a JSON object).",
    tags: ["orbitdb", "write"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        key: { name: "key", type: "string", description: "Required for keyvalue.", required: false },
        value: {
            name: "value",
            type: "string",
            description: "Value to write. Strings beginning with `{`, `[`, a digit, or `true/false/null` are JSON-parsed.",
            required: true,
        },
    },
    output: "JSON object { hash } — the entry hash.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, address, key, value } = args;
        const parsed = parseValue(value);
        const dbs = orbitdbService.listDatabases(nodeId as string | undefined);
        const info = dbs.find((d) => d.address === address);
        const type = info?.type ?? "events";
        let hash: string;
        if (type === "keyvalue" || type === "keyvalue-indexed") {
            if (typeof key !== "string" || !key) throw new Error("`key` is required for keyvalue databases");
            hash = await orbitdbService.kvPut(String(address), key, parsed, nodeId as string | undefined);
        } else if (type === "documents") {
            if (typeof parsed !== "object" || parsed === null) throw new Error("documents put requires an object value");
            hash = await orbitdbService.docPut(String(address), parsed as Record<string, unknown>, nodeId as string | undefined);
        } else {
            hash = await orbitdbService.eventAdd(String(address), parsed, nodeId as string | undefined);
        }
        return { hash };
    },
};

// ── KV ────────────────────────────────────────────────────────────

export const orbitdbKvPutCommand: CommandDefinition = {
    id: "orbitdb_kv_put",
    description: "KeyValue: write a value at `key`.",
    tags: ["orbitdb", "kv"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        key: { name: "key", type: "string", description: "Key.", required: true },
        value: { name: "value", type: "string", description: "Value (JSON-parsed if applicable).", required: true },
    },
    output: "JSON object { hash }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => ({
        hash: await orbitdbService.kvPut(
            String(args.address), String(args.key), parseValue(args.value), args.nodeId as string | undefined,
        ),
    }),
};

export const orbitdbKvGetCommand: CommandDefinition = {
    id: "orbitdb_kv_get",
    description: "KeyValue: read the value at `key`.",
    tags: ["orbitdb", "kv"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        key: { name: "key", type: "string", description: "Key.", required: true },
    },
    output: "JSON object { key, value }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => ({
        key: args.key,
        value: await orbitdbService.kvGet(String(args.address), String(args.key), args.nodeId as string | undefined),
    }),
};

export const orbitdbKvDelCommand: CommandDefinition = {
    id: "orbitdb_kv_del",
    description: "KeyValue: delete the value at `key`.",
    tags: ["orbitdb", "kv"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        key: { name: "key", type: "string", description: "Key.", required: true },
    },
    output: "JSON object { hash }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => ({
        hash: await orbitdbService.kvDel(String(args.address), String(args.key), args.nodeId as string | undefined),
    }),
};

export const orbitdbKvAllCommand: CommandDefinition = {
    id: "orbitdb_kv_all",
    description: "KeyValue: list all entries.",
    tags: ["orbitdb", "kv"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: { nodeId: NODE_ID_ARG, address: ADDRESS_ARG },
    output: "JSON array of { key, value }.",
    outputSchema: { type: "array" },
    execute: async (args) => orbitdbService.all(String(args.address), args.nodeId as string | undefined),
};

// ── Events log ────────────────────────────────────────────────────

export const orbitdbLogAddCommand: CommandDefinition = {
    id: "orbitdb_log_add",
    description: "Events log: append a value (returns its entry hash).",
    tags: ["orbitdb", "log", "events"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        value: { name: "value", type: "string", description: "Value (JSON-parsed if applicable).", required: true },
    },
    output: "JSON object { hash }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => ({
        hash: await orbitdbService.eventAdd(String(args.address), parseValue(args.value), args.nodeId as string | undefined),
    }),
};

export const orbitdbLogIteratorCommand: CommandDefinition = {
    id: "orbitdb_log_iterator",
    description: "Events log: read entries with optional bounds (gt/gte/lt/lte) and `amount`.",
    tags: ["orbitdb", "log", "events"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        amount: { name: "amount", type: "number", description: "Max entries to return.", required: false },
        gt: { name: "gt", type: "string", description: "Hash exclusive lower bound.", required: false },
        gte: { name: "gte", type: "string", description: "Hash inclusive lower bound.", required: false },
        lt: { name: "lt", type: "string", description: "Hash exclusive upper bound.", required: false },
        lte: { name: "lte", type: "string", description: "Hash inclusive upper bound.", required: false },
    },
    output: "JSON array of { hash, value }.",
    outputSchema: { type: "array" },
    execute: async (args) => orbitdbService.iterate(
        String(args.address),
        {
            amount: typeof args.amount === "number" ? args.amount : undefined,
        },
        args.nodeId as string | undefined,
    ),
};

export const orbitdbLogAllCommand: CommandDefinition = {
    id: "orbitdb_log_all",
    description: "Events log: list all entries.",
    tags: ["orbitdb", "log", "events"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: { nodeId: NODE_ID_ARG, address: ADDRESS_ARG },
    output: "JSON array.",
    outputSchema: { type: "array" },
    execute: async (args) => orbitdbService.all(String(args.address), args.nodeId as string | undefined),
};

// ── Documents ─────────────────────────────────────────────────────

export const orbitdbDocPutCommand: CommandDefinition = {
    id: "orbitdb_doc_put",
    description:
        "Documents: insert/update a document. The document must include the indexBy field " +
        "(default `_id`) used as the primary key.",
    tags: ["orbitdb", "documents"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        doc: { name: "doc", type: "object", description: "Document object.", required: true },
    },
    output: "JSON object { hash }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const docRaw = args.doc;
        const doc = typeof docRaw === "string" ? parseValue(docRaw) : docRaw;
        if (typeof doc !== "object" || doc === null) throw new Error("`doc` must be an object");
        return {
            hash: await orbitdbService.docPut(
                String(args.address), doc as Record<string, unknown>, args.nodeId as string | undefined,
            ),
        };
    },
};

export const orbitdbDocGetCommand: CommandDefinition = {
    id: "orbitdb_doc_get",
    description: "Documents: get a document by primary key.",
    tags: ["orbitdb", "documents"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        key: { name: "key", type: "string", description: "Primary key (indexBy field value).", required: true },
    },
    output: "JSON document or null.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => orbitdbService.docGet(
        String(args.address), String(args.key), args.nodeId as string | undefined,
    ),
};

export const orbitdbDocDelCommand: CommandDefinition = {
    id: "orbitdb_doc_del",
    description: "Documents: delete a document by primary key.",
    tags: ["orbitdb", "documents"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        key: { name: "key", type: "string", description: "Primary key.", required: true },
    },
    output: "JSON object { hash }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => ({
        hash: await orbitdbService.docDel(String(args.address), String(args.key), args.nodeId as string | undefined),
    }),
};

export const orbitdbDocQueryCommand: CommandDefinition = {
    id: "orbitdb_doc_query",
    description:
        "Documents: query with a JS predicate body. Pass a function expression like " +
        "`(doc) => doc.status === 'active'`. The expression is evaluated in a sandbox.",
    tags: ["orbitdb", "documents", "query"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        nodeId: NODE_ID_ARG,
        address: ADDRESS_ARG,
        find: {
            name: "find",
            type: "string",
            description: "Function source returning boolean, e.g. `(doc) => doc.qty > 10`.",
            required: true,
        },
    },
    output: "JSON array of matching documents.",
    outputSchema: { type: "array" },
    execute: async (args) => orbitdbService.docQuery(
        String(args.address), String(args.find), args.nodeId as string | undefined,
    ),
};

export const orbitdbDocAllCommand: CommandDefinition = {
    id: "orbitdb_doc_all",
    description: "Documents: list all documents.",
    tags: ["orbitdb", "documents"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: { nodeId: NODE_ID_ARG, address: ADDRESS_ARG },
    output: "JSON array.",
    outputSchema: { type: "array" },
    execute: async (args) => orbitdbService.all(String(args.address), args.nodeId as string | undefined),
};

// ── List ──────────────────────────────────────────────────────────

export const orbitdbCommands: CommandDefinition[] = [
    orbitdbStartCommand,
    orbitdbStopCommand,
    orbitdbAddNodeCommand,
    orbitdbRemoveNodeCommand,
    orbitdbSetActiveNodeCommand,
    orbitdbRenameNodeCommand,
    orbitdbSetHeliaCommand,
    orbitdbListNodesCommand,
    orbitdbListHeliaNodesCommand,
    orbitdbOpenCommand,
    orbitdbCloseCommand,
    orbitdbDropCommand,
    orbitdbListDbsCommand,
    orbitdbGetIdentityCommand,
    orbitdbPutCommand,
    orbitdbKvPutCommand,
    orbitdbKvGetCommand,
    orbitdbKvDelCommand,
    orbitdbKvAllCommand,
    orbitdbLogAddCommand,
    orbitdbLogIteratorCommand,
    orbitdbLogAllCommand,
    orbitdbDocPutCommand,
    orbitdbDocGetCommand,
    orbitdbDocDelCommand,
    orbitdbDocQueryCommand,
    orbitdbDocAllCommand,
];

/**
 * OrbitDB database-lifecycle + identity commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbService } from "../service";
import type { OrbitdbDbType } from "../types/orbitdb";
import { NODE_ID_ARG, ADDRESS_ARG, VALID_TYPES } from "./shared";

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

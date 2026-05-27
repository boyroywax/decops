/**
 * OrbitDB key-value commands (plus the generic orbitdb_put dispatcher).
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbService } from "../service";
import { NODE_ID_ARG, ADDRESS_ARG, parseValue } from "./shared";

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

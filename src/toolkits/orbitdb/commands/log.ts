/**
 * OrbitDB events-log commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbService } from "../service";
import { NODE_ID_ARG, ADDRESS_ARG, parseValue } from "./shared";

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

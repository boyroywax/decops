/**
 * Shared types / helpers used by every orbitdb command file.
 *
 * Extracted from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { OrbitdbDbType } from "../types/orbitdb";

export const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local orbitdb node id. Defaults to the currently-active node.",
    required: false,
};

export const ADDRESS_ARG = {
    name: "address",
    type: "string" as const,
    description: "OrbitDB database address (`/orbitdb/<hash>`) or local name passed to `orbitdb_open`.",
    required: true,
};

export const VALID_TYPES: OrbitdbDbType[] = ["events", "keyvalue", "keyvalue-indexed", "documents"];

export function parseValue(raw: unknown): unknown {
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

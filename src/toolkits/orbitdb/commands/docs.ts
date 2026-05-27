/**
 * OrbitDB documents commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbService } from "../service";
import { NODE_ID_ARG, ADDRESS_ARG, parseValue } from "./shared";

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

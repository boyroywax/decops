/**
 * OrbitDB lifecycle + node-management commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { orbitdbService } from "../service";
import { heliaService } from "@/toolkits/helia/service";
import { NODE_ID_ARG } from "./shared";

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

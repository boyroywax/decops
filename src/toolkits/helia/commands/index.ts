/**
 * Helia toolkit commands.
 *
 * Each command thinly wraps the heliaService manager so it can be invoked
 * from chat / job pipelines as well as from the UI. Every node-scoped
 * command accepts an optional `nodeId` arg; when omitted, the command
 * targets the currently-active helia node.
 */

import type { CommandDefinition } from "@/services/commands/types";
import { heliaService } from "../service";
import { libp2pService } from "@/toolkits/libp2p/service";

const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local helia node id. Defaults to the currently-active node.",
    required: false,
};

// ── helia_start ──

export const heliaStartCommand: CommandDefinition = {
    id: "helia_start",
    description:
        "Start a Helia (in-browser IPFS) node, binding it to a libp2p instance. " +
        "When `libp2pNodeId` is omitted and the helia node has no binding, a fresh libp2p node is auto-created.",
    tags: ["helia", "ipfs", "storage", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        libp2pNodeId: {
            name: "libp2pNodeId",
            type: "string",
            description:
                "Local id of a libp2p node to attach to. The libp2p node will be started if it isn't already running. " +
                "Leave empty to auto-create a new libp2p node.",
            required: false,
        },
        newLibp2pLabel: {
            name: "newLibp2pLabel",
            type: "string",
            description: "Label for the auto-created libp2p node (only used when libp2pNodeId is omitted).",
            required: false,
        },
    },
    output: "JSON object describing the started Helia node.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, libp2pNodeId, newLibp2pLabel } = args;
        await heliaService.start({
            libp2pNodeId: typeof libp2pNodeId === "string" && libp2pNodeId.trim() ? libp2pNodeId : undefined,
            newLibp2pLabel: typeof newLibp2pLabel === "string" && newLibp2pLabel.trim() ? newLibp2pLabel : undefined,
        }, nodeId);
        const snap = heliaService.getNode(nodeId).snapshot();
        context.workspace.addLog(
            `helia[${snap.label}] started — libp2p ${snap.libp2pNodeId ?? "(none)"}, peer ${snap.peerId?.slice(0, 16) ?? "?"}…`,
        );
        return {
            nodeId: snap.nodeId,
            label: snap.label,
            status: snap.status,
            libp2pNodeId: snap.libp2pNodeId,
            peerId: snap.peerId,
        };
    },
};

// ── helia_stop ──

export const heliaStopCommand: CommandDefinition = {
    id: "helia_stop",
    description: "Stop a running Helia node. The underlying libp2p node is left untouched.",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the final status.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId } = args;
        await heliaService.stop(nodeId);
        const snap = heliaService.getNode(nodeId).snapshot();
        context.workspace.addLog(`helia[${snap.label}] stopped`);
        return { nodeId: snap.nodeId, status: snap.status };
    },
};

// ── helia_add_node ──

export const heliaAddNodeCommand: CommandDefinition = {
    id: "helia_add_node",
    description: "Add a new (stopped) Helia node. Optionally pre-bind it to a libp2p node id.",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: { name: "label", type: "string", description: "Display label for the new node.", required: false },
        libp2pNodeId: {
            name: "libp2pNodeId",
            type: "string",
            description: "Optional libp2p node id to pre-bind. May be changed before start.",
            required: false,
        },
    },
    output: "JSON object { nodeId }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { label, libp2pNodeId } = args;
        const id = heliaService.addNode(
            typeof label === "string" ? label : undefined,
            typeof libp2pNodeId === "string" && libp2pNodeId.trim() ? libp2pNodeId : null,
        );
        return { nodeId: id };
    },
};

export const heliaRemoveNodeCommand: CommandDefinition = {
    id: "helia_remove_node",
    description: "Stop and remove a Helia node.",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true },
    },
    output: "JSON { removed: true }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId } = args;
        if (typeof nodeId !== "string" || !nodeId) throw new Error("nodeId is required");
        await heliaService.removeNode(nodeId);
        return { removed: true, nodeId };
    },
};

export const heliaSetActiveNodeCommand: CommandDefinition = {
    id: "helia_set_active_node",
    description: "Switch the active Helia node.",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true },
    },
    output: "JSON { activeId }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId } = args;
        if (typeof nodeId !== "string" || !nodeId) throw new Error("nodeId is required");
        heliaService.setActive(nodeId);
        return { activeId: heliaService.getActiveId() };
    },
};

export const heliaRenameNodeCommand: CommandDefinition = {
    id: "helia_rename_node",
    description: "Rename a Helia node.",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "JSON { nodeId, label }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, label } = args;
        if (typeof label !== "string" || !label.trim()) throw new Error("label is required");
        const target = nodeId ?? heliaService.getActiveId();
        if (!target) throw new Error("No active helia node");
        heliaService.setLabel(target, label);
        return { nodeId: target, label };
    },
};

// ── helia_set_libp2p ──

export const heliaSetLibp2pCommand: CommandDefinition = {
    id: "helia_set_libp2p",
    description:
        "Bind this Helia node to a libp2p node id (must be stopped first). " +
        "Pass an empty string or omit `libp2pNodeId` to clear the binding (helia_start will then auto-create a new libp2p node).",
    tags: ["helia", "ipfs", "libp2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        libp2pNodeId: {
            name: "libp2pNodeId",
            type: "string",
            description: "libp2p node id to bind to. Empty to clear.",
            required: false,
        },
    },
    output: "JSON { nodeId, libp2pNodeId }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, libp2pNodeId } = args;
        const target = (typeof libp2pNodeId === "string" && libp2pNodeId.trim()) ? libp2pNodeId : null;
        if (target) {
            // Validate existence early.
            libp2pService.getNode(target);
        }
        heliaService.setLibp2pBinding(nodeId, target);
        return { nodeId: heliaService.getNode(nodeId).id, libp2pNodeId: target };
    },
};

// ── helia_add_text ──

export const heliaAddTextCommand: CommandDefinition = {
    id: "helia_add_text",
    description: "Add a UTF-8 string to IPFS via Helia. Returns the resulting CID.",
    tags: ["helia", "ipfs", "add"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        text: { name: "text", type: "string", description: "UTF-8 content to add.", required: true },
        label: { name: "label", type: "string", description: "Optional label for the entry.", required: false },
    },
    output: "JSON object { cid, bytes, label? }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, text, label } = args;
        if (typeof text !== "string") throw new Error("text must be a string");
        const entry = await heliaService.addString(text, typeof label === "string" ? label : undefined, nodeId);
        context.workspace.addLog(`helia added text → ${entry.cid}`);
        return { cid: entry.cid, bytes: entry.bytes, label: entry.label };
    },
};

// ── helia_add_json ──

export const heliaAddJsonCommand: CommandDefinition = {
    id: "helia_add_json",
    description: "Add a JSON-serialisable value to IPFS via Helia (dag-json). Returns the resulting CID.",
    tags: ["helia", "ipfs", "add"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        value: { name: "value", type: "object", description: "Value to encode and add.", required: true },
        label: { name: "label", type: "string", description: "Optional label.", required: false },
    },
    output: "JSON object { cid, bytes, label? }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, value, label } = args;
        const entry = await heliaService.addJson(value, typeof label === "string" ? label : undefined, nodeId);
        context.workspace.addLog(`helia added json → ${entry.cid}`);
        return { cid: entry.cid, bytes: entry.bytes, label: entry.label };
    },
};

// ── helia_cat ──

export const heliaCatCommand: CommandDefinition = {
    id: "helia_cat",
    description: "Fetch a CID via Helia and return its content as a UTF-8 string.",
    tags: ["helia", "ipfs", "cat"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID to fetch.", required: true },
    },
    output: "JSON object { cid, text, bytes }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, cid } = args;
        if (typeof cid !== "string" || !cid.trim()) throw new Error("cid is required");
        const text = await heliaService.catString(cid, nodeId);
        const bytes = new TextEncoder().encode(text).byteLength;
        context.workspace.addLog(`helia cat ${cid.slice(0, 12)}… (${bytes} bytes)`);
        return { cid, text, bytes };
    },
};

// ── helia_pin / unpin / list ──

export const heliaPinCommand: CommandDefinition = {
    id: "helia_pin",
    description: "Pin a CID so it is held against garbage collection.",
    tags: ["helia", "ipfs", "pin"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID to pin.", required: true },
    },
    output: "JSON { cid, pinned: true }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, cid } = args;
        if (typeof cid !== "string" || !cid.trim()) throw new Error("cid is required");
        await heliaService.pin(cid, nodeId);
        return { cid, pinned: true };
    },
};

export const heliaUnpinCommand: CommandDefinition = {
    id: "helia_unpin",
    description: "Remove a pin from a CID.",
    tags: ["helia", "ipfs", "pin"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID to unpin.", required: true },
    },
    output: "JSON { cid, pinned: false }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, cid } = args;
        if (typeof cid !== "string" || !cid.trim()) throw new Error("cid is required");
        await heliaService.unpin(cid, nodeId);
        return { cid, pinned: false };
    },
};

export const heliaListEntriesCommand: CommandDefinition = {
    id: "helia_list_entries",
    description: "List content entries known to this Helia node (added or fetched).",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON array of entries.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId } = args;
        return { entries: heliaService.listEntries(nodeId) };
    },
};

export const heliaClearEntriesCommand: CommandDefinition = {
    id: "helia_clear_entries",
    description: "Clear the local entries list (does not remove blocks from the store).",
    tags: ["helia", "ipfs"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON { cleared: true }.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId } = args;
        heliaService.clearEntries(nodeId);
        return { cleared: true };
    },
};

// ── List ──

export const heliaCommands: CommandDefinition[] = [
    heliaStartCommand,
    heliaStopCommand,
    heliaAddNodeCommand,
    heliaRemoveNodeCommand,
    heliaSetActiveNodeCommand,
    heliaRenameNodeCommand,
    heliaSetLibp2pCommand,
    heliaAddTextCommand,
    heliaAddJsonCommand,
    heliaCatCommand,
    heliaPinCommand,
    heliaUnpinCommand,
    heliaListEntriesCommand,
    heliaClearEntriesCommand,
];

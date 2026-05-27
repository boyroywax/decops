/**
 * libp2p node lifecycle + multi-node management commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import { NODE_ID_ARG } from "./shared";

export const libp2pStartCommand: CommandDefinition = {
    id: "libp2p_start",
    description: "Start the in-browser libp2p node. Connects to public bootstrap peers, enables WebRTC + circuit relay, and begins peer discovery.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        bootstrap: {
            name: "bootstrap",
            type: "array",
            description: "Optional list of bootstrap multiaddrs. Defaults to the public js-libp2p bootstrappers.",
            required: false,
        },
        disabledBootstrap: {
            name: "disabledBootstrap",
            type: "array",
            description: "Bootstrap multiaddrs to omit from the default (or supplied) list.",
            required: false,
        },
        services: {
            name: "services",
            type: "object",
            description: "Per-service toggles: { identify?, ping?, dcutr?, pubsub?, kadDht? }.",
            required: false,
        },
        discovery: {
            name: "discovery",
            type: "object",
            description: "Per-discovery toggles: { bootstrap?, pubsubPeerDiscovery? }.",
            required: false,
        },
        transports: {
            name: "transports",
            type: "object",
            description: "Per-transport toggles: { webSockets?, webRTC?, circuitRelay? }.",
            required: false,
        },
        enableWebRTC: {
            name: "enableWebRTC",
            type: "boolean",
            description: "Legacy alias for transports.webRTC.",
            required: false,
            defaultValue: true,
        },
        enableCircuitRelay: {
            name: "enableCircuitRelay",
            type: "boolean",
            description: "Legacy alias for transports.circuitRelay.",
            required: false,
            defaultValue: true,
        },
        pnetKey: {
            name: "pnetKey",
            type: "string",
            description: "Optional libp2p PSK document. When set, the node joins a private swarm and only peers with nodes sharing the same key.",
            required: false,
        },
    },
    output: "JSON object with node status, peer id, and listen multiaddrs.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, bootstrap, disabledBootstrap, services, discovery, transports, enableWebRTC, enableCircuitRelay, pnetKey } = args;
        await libp2pService.start({
            bootstrap: Array.isArray(bootstrap) && bootstrap.length ? bootstrap : undefined,
            disabledBootstrap: Array.isArray(disabledBootstrap) ? disabledBootstrap : undefined,
            services: services && typeof services === "object" ? services : undefined,
            discovery: discovery && typeof discovery === "object" ? discovery : undefined,
            transports: transports && typeof transports === "object" ? transports : undefined,
            enableWebRTC: enableWebRTC !== false,
            enableCircuitRelay: enableCircuitRelay !== false,
            pnetKey: typeof pnetKey === "string" && pnetKey.trim() ? pnetKey : undefined,
        }, nodeId);
        const node = libp2pService.getNode(nodeId);
        const snap = node.snapshot();
        context.workspace.addLog(`libp2p[${snap.label}] started — peerId ${snap.peerId?.slice(0, 16)}…`);
        return {
            nodeId: snap.nodeId,
            label: snap.label,
            status: snap.status,
            peerId: snap.peerId,
            multiaddrs: snap.multiaddrs,
        };
    },
};

export const libp2pStopCommand: CommandDefinition = {
    id: "libp2p_stop",
    description: "Stop the running libp2p node and close all connections.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "Confirmation that the node is stopped.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await libp2pService.stop(args.nodeId);
        const snap = libp2pService.getNode(args.nodeId).snapshot();
        context.workspace.addLog(`libp2p[${snap.label}] stopped`);
        return { nodeId: snap.nodeId, status: "stopped" };
    },
};

export const libp2pClearPeersCommand: CommandDefinition = {
    id: "libp2p_clear_peers",
    description: "Clear the local peer book (does not affect open connections).",
    tags: ["libp2p", "network"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON confirming the peer book was cleared.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        libp2pService.clearPeers(args.nodeId);
        return { cleared: true };
    },
};

export const libp2pAddNodeCommand: CommandDefinition = {
    id: "libp2p_add_node",
    description: "Spawn a new libp2p node entry. The node is created in the stopped state and becomes active.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: {
            name: "label",
            type: "string",
            description: "Optional human-friendly label (e.g. \"Relay tester\").",
            required: false,
        },
    },
    output: "JSON with the new node's local id and label.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const id = libp2pService.addNode(args.label);
        context.workspace.addLog(`libp2p node added (${id})`);
        const snap = libp2pService.getNode(id).snapshot();
        return { nodeId: snap.nodeId, label: snap.label };
    },
};

export const libp2pRemoveNodeCommand: CommandDefinition = {
    id: "libp2p_remove_node",
    description: "Stop and remove a libp2p node entry.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true, description: "Local node id to remove." },
    },
    output: "JSON confirming the removal.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.nodeId) throw new Error("nodeId is required");
        await libp2pService.removeNode(args.nodeId);
        context.workspace.addLog(`libp2p node removed (${args.nodeId})`);
        return { nodeId: args.nodeId, removed: true };
    },
};

export const libp2pSetActiveNodeCommand: CommandDefinition = {
    id: "libp2p_set_active_node",
    description: "Switch the UI/active focus to another libp2p node.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true, description: "Local node id to make active." },
    },
    output: "JSON with the new active node id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.nodeId) throw new Error("nodeId is required");
        libp2pService.setActive(args.nodeId);
        return { activeId: args.nodeId };
    },
};

export const libp2pRenameNodeCommand: CommandDefinition = {
    id: "libp2p_rename_node",
    description: "Rename a libp2p node's UI label.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "JSON confirming the rename.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.label || typeof args.label !== "string") throw new Error("label is required");
        const id = args.nodeId ?? libp2pService.getActiveId();
        if (!id) throw new Error("No node selected");
        libp2pService.setLabel(id, args.label);
        return { nodeId: id, label: args.label };
    },
};

/**
 * libp2p peer-connection commands (dial, hangup, ping, list).
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import { NODE_ID_ARG } from "./shared";

export const libp2pDialCommand: CommandDefinition = {
    id: "libp2p_dial",
    description: "Dial a remote peer by multiaddr or peer id.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        target: {
            name: "target",
            type: "string",
            description: "Multiaddr (e.g. /dnsaddr/example.com/p2p/Qm…) or bare peer id.",
            required: true,
        },
    },
    output: "JSON object with the connected remote peer id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, target } = args;
        if (!target || typeof target !== "string") throw new Error("target is required");
        const result = await libp2pService.dial(target, nodeId);
        context.workspace.addLog(`libp2p dialed ${result.remotePeer.slice(0, 16)}…`);
        return result;
    },
};

export const libp2pHangupCommand: CommandDefinition = {
    id: "libp2p_hangup",
    description: "Close the open connection to a remote peer.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        peerId: {
            name: "peerId",
            type: "string",
            description: "Remote peer id to disconnect from.",
            required: true,
        },
    },
    output: "JSON confirming the hangup.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, peerId } = args;
        if (!peerId || typeof peerId !== "string") throw new Error("peerId is required");
        await libp2pService.hangUp(peerId, nodeId);
        context.workspace.addLog(`libp2p disconnected ${peerId.slice(0, 16)}…`);
        return { peerId, disconnected: true };
    },
};

export const libp2pPingCommand: CommandDefinition = {
    id: "libp2p_ping",
    description: "Ping a connected peer and return its latency in ms.",
    tags: ["libp2p", "network", "diagnostics"],
    rbac: ["orchestrator", "builder", "validator"],
    args: {
        nodeId: NODE_ID_ARG,
        peerId: {
            name: "peerId",
            type: "string",
            description: "Remote peer id to ping.",
            required: true,
        },
    },
    output: "JSON object with peerId and latencyMs.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, peerId } = args;
        if (!peerId || typeof peerId !== "string") throw new Error("peerId is required");
        const latencyMs = await libp2pService.ping(peerId, nodeId);
        return { peerId, latencyMs };
    },
};

export const libp2pListPeersCommand: CommandDefinition = {
    id: "libp2p_list_peers",
    description: "List discovered and connected libp2p peers for a node.",
    tags: ["libp2p", "network"],
    rbac: ["orchestrator", "builder", "validator", "researcher"],
    args: {
        nodeId: NODE_ID_ARG,
        connectedOnly: {
            name: "connectedOnly",
            type: "boolean",
            description: "If true, only return peers with an open connection.",
            required: false,
            defaultValue: false,
        },
    },
    output: "JSON array of peer descriptors.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const snap = libp2pService.getNode(args.nodeId).snapshot();
        const peers = args.connectedOnly ? snap.peers.filter((p) => p.connected) : snap.peers;
        return { nodeId: snap.nodeId, count: peers.length, peers };
    },
};

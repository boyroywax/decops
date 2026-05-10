/**
 * libp2p toolkit commands.
 *
 * Each command thinly wraps the libp2pService singleton so it can be
 * invoked from chat / job pipelines as well as from the UI.
 */

import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "./service";

// ── libp2p_start ──

export const libp2pStartCommand: CommandDefinition = {
    id: "libp2p_start",
    description: "Start the in-browser libp2p node. Connects to public bootstrap peers, enables WebRTC + circuit relay, and begins peer discovery.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        bootstrap: {
            name: "bootstrap",
            type: "array",
            description: "Optional list of bootstrap multiaddrs. Defaults to the public js-libp2p bootstrappers.",
            required: false,
        },
        enableWebRTC: {
            name: "enableWebRTC",
            type: "boolean",
            description: "Enable WebRTC transport for browser-to-browser dialing.",
            required: false,
            defaultValue: true,
        },
        enableCircuitRelay: {
            name: "enableCircuitRelay",
            type: "boolean",
            description: "Enable circuit relay v2 transport.",
            required: false,
            defaultValue: true,
        },
    },
    output: "JSON object with node status, peer id, and listen multiaddrs.",
    execute: async (args, context) => {
        const { bootstrap, enableWebRTC, enableCircuitRelay } = args;
        await libp2pService.start({
            bootstrap: Array.isArray(bootstrap) && bootstrap.length ? bootstrap : undefined,
            enableWebRTC: enableWebRTC !== false,
            enableCircuitRelay: enableCircuitRelay !== false,
        });
        const snap = libp2pService.snapshot();
        context.workspace.addLog(`libp2p started — peerId ${snap.peerId?.slice(0, 16)}…`);
        return {
            status: snap.status,
            peerId: snap.peerId,
            multiaddrs: snap.multiaddrs,
        };
    },
};

// ── libp2p_stop ──

export const libp2pStopCommand: CommandDefinition = {
    id: "libp2p_stop",
    description: "Stop the running libp2p node and close all connections.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {},
    output: "Confirmation that the node is stopped.",
    execute: async (_args, context) => {
        await libp2pService.stop();
        context.workspace.addLog("libp2p stopped");
        return { status: "stopped" };
    },
};

// ── libp2p_dial ──

export const libp2pDialCommand: CommandDefinition = {
    id: "libp2p_dial",
    description: "Dial a remote peer by multiaddr or peer id.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        target: {
            name: "target",
            type: "string",
            description: "Multiaddr (e.g. /dnsaddr/example.com/p2p/Qm…) or bare peer id.",
            required: true,
        },
    },
    output: "JSON object with the connected remote peer id.",
    execute: async (args, context) => {
        const { target } = args;
        if (!target || typeof target !== "string") throw new Error("target is required");
        const result = await libp2pService.dial(target);
        context.workspace.addLog(`libp2p dialed ${result.remotePeer.slice(0, 16)}…`);
        return result;
    },
};

// ── libp2p_ping ──

export const libp2pPingCommand: CommandDefinition = {
    id: "libp2p_ping",
    description: "Ping a connected peer and return its latency in ms.",
    tags: ["libp2p", "network", "diagnostics"],
    rbac: ["orchestrator", "builder", "validator"],
    args: {
        peerId: {
            name: "peerId",
            type: "string",
            description: "Remote peer id to ping.",
            required: true,
        },
    },
    output: "JSON object with peerId and latencyMs.",
    execute: async (args) => {
        const { peerId } = args;
        if (!peerId || typeof peerId !== "string") throw new Error("peerId is required");
        const latencyMs = await libp2pService.ping(peerId);
        return { peerId, latencyMs };
    },
};

// ── libp2p_list_peers ──

export const libp2pListPeersCommand: CommandDefinition = {
    id: "libp2p_list_peers",
    description: "List discovered and connected libp2p peers.",
    tags: ["libp2p", "network"],
    rbac: ["orchestrator", "builder", "validator", "researcher"],
    args: {
        connectedOnly: {
            name: "connectedOnly",
            type: "boolean",
            description: "If true, only return peers with an open connection.",
            required: false,
            defaultValue: false,
        },
    },
    output: "JSON array of peer descriptors.",
    execute: async (args) => {
        const snap = libp2pService.snapshot();
        const peers = args.connectedOnly ? snap.peers.filter((p) => p.connected) : snap.peers;
        return { count: peers.length, peers };
    },
};

// ── libp2p_pubsub_subscribe ──

export const libp2pPubsubSubscribeCommand: CommandDefinition = {
    id: "libp2p_pubsub_subscribe",
    description: "Subscribe to a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
    },
    output: "JSON confirming the subscription.",
    execute: async (args) => {
        const { topic } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        await libp2pService.subscribeTopic(topic);
        return { topic, subscribed: true };
    },
};

// ── libp2p_pubsub_publish ──

export const libp2pPubsubPublishCommand: CommandDefinition = {
    id: "libp2p_pubsub_publish",
    description: "Publish a message to a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
        message: { name: "message", type: "string", description: "Message body (UTF-8).", required: true },
    },
    output: "JSON confirming the publish.",
    execute: async (args) => {
        const { topic, message } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        if (typeof message !== "string") throw new Error("message is required");
        await libp2pService.publish(topic, message);
        return { topic, published: true, bytes: message.length };
    },
};

export const libp2pCommands: CommandDefinition[] = [
    libp2pStartCommand,
    libp2pStopCommand,
    libp2pDialCommand,
    libp2pPingCommand,
    libp2pListPeersCommand,
    libp2pPubsubSubscribeCommand,
    libp2pPubsubPublishCommand,
];

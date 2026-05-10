/**
 * useLibp2pMetrics — small hook for surfacing libp2p activity in chrome
 * (e.g. the app footer) without coupling to the toolkit's React context.
 *
 * Subscribes directly to `libp2pService` so the footer stays live even
 * when the libp2p view is not mounted.
 *
 * Exposes:
 *  • activeNodes        — count of nodes currently in the "running" status.
 *  • totalNodes         — total number of nodes in the manager.
 *  • connectedPeers     — sum of connected peers across all nodes.
 *  • totalPubsubMessages — running total of pubsub messages received.
 *  • newPubsubMessages  — messages received since the last `acknowledgeMessages()`.
 *  • lastMessage        — most recent pubsub message metadata (any node).
 *  • acknowledgeMessages() — resets the "new" counter to zero.
 */

import { useCallback, useEffect, useState } from "react";
import { libp2pService } from "../service";

interface Libp2pMetrics {
    activeNodes: number;
    totalNodes: number;
    connectedPeers: number;
    totalPubsubMessages: number;
    newPubsubMessages: number;
    lastMessage?: { topic: string; from?: string; at: string };
    acknowledgeMessages: () => void;
}

export function useLibp2pMetrics(): Libp2pMetrics {
    const [snapshot, setSnapshot] = useState(() => libp2pService.snapshot());
    const [seenMessages, setSeenMessages] = useState(0);

    useEffect(() => libp2pService.subscribe(setSnapshot), []);

    let activeNodes = 0;
    let connectedPeers = 0;
    let totalPubsubMessages = 0;
    let lastMessage: Libp2pMetrics["lastMessage"];

    for (const n of snapshot.nodes) {
        if (n.status === "running") activeNodes += 1;
        for (const p of n.peers) if (p.connected) connectedPeers += 1;
        totalPubsubMessages += n.pubsubMessageCount;
        if (n.lastPubsubMessage) {
            if (!lastMessage || n.lastPubsubMessage.at > lastMessage.at) {
                lastMessage = n.lastPubsubMessage;
            }
        }
    }

    const newPubsubMessages = Math.max(0, totalPubsubMessages - seenMessages);

    const acknowledgeMessages = useCallback(() => {
        setSeenMessages(libp2pService
            .snapshot()
            .nodes
            .reduce((sum, n) => sum + n.pubsubMessageCount, 0));
    }, []);

    return {
        activeNodes,
        totalNodes: snapshot.nodes.length,
        connectedPeers,
        totalPubsubMessages,
        newPubsubMessages,
        lastMessage,
        acknowledgeMessages,
    };
}

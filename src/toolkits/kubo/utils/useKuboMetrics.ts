/**
 * useKuboMetrics — compact metrics hook for the app footer.
 *
 * Subscribes directly to `kuboService` so the footer stays live even when
 * the Kubo view is not mounted.
 */

import { useCallback, useEffect, useState } from "react";
import { kuboService } from "../service";

interface KuboMetrics {
    connectedNodes: number;
    totalNodes: number;
    totalEntries: number;
    pinnedCount: number;
    totalBytes: number;
    newEntries: number;
    acknowledgeEntries: () => void;
}

export function useKuboMetrics(): KuboMetrics {
    const [snapshot, setSnapshot] = useState(() => kuboService.snapshot());
    const [seenEntries, setSeenEntries] = useState(0);

    useEffect(() => kuboService.subscribe(setSnapshot), []);

    let connectedNodes = 0;
    let totalEntries = 0;
    let pinnedCount = 0;
    let totalBytes = 0;
    for (const n of snapshot.nodes) {
        if (n.status === "connected") connectedNodes += 1;
        totalEntries += n.entries.length;
        pinnedCount += n.pinnedCount;
        totalBytes += n.totalBytes;
    }
    const newEntries = Math.max(0, totalEntries - seenEntries);

    const acknowledgeEntries = useCallback(() => {
        const snap = kuboService.snapshot();
        setSeenEntries(snap.nodes.reduce((s, n) => s + n.entries.length, 0));
    }, []);

    return {
        connectedNodes,
        totalNodes: snapshot.nodes.length,
        totalEntries,
        pinnedCount,
        totalBytes,
        newEntries,
        acknowledgeEntries,
    };
}

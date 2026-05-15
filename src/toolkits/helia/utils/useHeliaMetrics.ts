/**
 * useHeliaMetrics — compact metrics hook for the app footer.
 *
 * Subscribes directly to `heliaService` so the footer stays live even when
 * the Helia view is not mounted.
 */

import { useCallback, useEffect, useState } from "react";
import { heliaService } from "../service";

interface HeliaMetrics {
    activeNodes: number;
    totalNodes: number;
    totalEntries: number;
    pinnedCount: number;
    totalBytes: number;
    newEntries: number;
    acknowledgeEntries: () => void;
}

export function useHeliaMetrics(): HeliaMetrics {
    const [snapshot, setSnapshot] = useState(() => heliaService.snapshot());
    const [seenEntries, setSeenEntries] = useState(0);

    useEffect(() => heliaService.subscribe(setSnapshot), []);

    let activeNodes = 0;
    let totalEntries = 0;
    let pinnedCount = 0;
    let totalBytes = 0;
    for (const n of snapshot.nodes) {
        if (n.status === "running") activeNodes += 1;
        totalEntries += n.entries.length;
        pinnedCount += n.pinnedCount;
        totalBytes += n.totalBytes;
    }
    const newEntries = Math.max(0, totalEntries - seenEntries);

    const acknowledgeEntries = useCallback(() => {
        const snap = heliaService.snapshot();
        setSeenEntries(snap.nodes.reduce((s, n) => s + n.entries.length, 0));
    }, []);

    return {
        activeNodes,
        totalNodes: snapshot.nodes.length,
        totalEntries,
        pinnedCount,
        totalBytes,
        newEntries,
        acknowledgeEntries,
    };
}

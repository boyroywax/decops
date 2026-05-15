/**
 * useOrbitdbMetrics — compact metrics hook for the app footer.
 *
 * Subscribes directly to `orbitdbService` so the footer stays live even
 * when the OrbitDB view is not mounted.
 */

import { useCallback, useEffect, useState } from "react";
import { orbitdbService } from "../service";

interface OrbitdbMetrics {
    activeNodes: number;
    totalNodes: number;
    totalDbs: number;
    openDbs: number;
    totalEntries: number;
    newDbs: number;
    acknowledgeDbs: () => void;
}

export function useOrbitdbMetrics(): OrbitdbMetrics {
    const [snapshot, setSnapshot] = useState(() => orbitdbService.snapshot());
    const [seenDbs, setSeenDbs] = useState(0);

    useEffect(() => orbitdbService.subscribe(setSnapshot), []);

    let activeNodes = 0;
    let totalDbs = 0;
    let openDbs = 0;
    let totalEntries = 0;
    for (const n of snapshot.nodes) {
        if (n.status === "running") activeNodes += 1;
        totalDbs += n.databases.length;
        for (const db of n.databases) {
            if (db.open) openDbs += 1;
            totalEntries += db.count ?? 0;
        }
    }
    const newDbs = Math.max(0, totalDbs - seenDbs);

    const acknowledgeDbs = useCallback(() => {
        const snap = orbitdbService.snapshot();
        setSeenDbs(snap.nodes.reduce((s, n) => s + n.databases.length, 0));
    }, []);

    return {
        activeNodes,
        totalNodes: snapshot.nodes.length,
        totalDbs,
        openDbs,
        totalEntries,
        newDbs,
        acknowledgeDbs,
    };
}

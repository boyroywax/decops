/**
 * useOrbitdbServerMetrics — compact metrics hook for the app footer.
 *
 * Subscribes directly to `orbitdbServerService` so the footer stays live
 * even when the orbitdb-server view is not mounted.
 */

import { useCallback, useEffect, useState } from "react";
import { orbitdbServerService } from "../service";

interface OrbitdbServerMetrics {
    connectedNodes: number;
    totalNodes: number;
    totalDatabases: number;
    swarmPeers: number;
    privateNodes: number;
    newDatabases: number;
    acknowledgeDatabases: () => void;
}

export function useOrbitdbServerMetrics(): OrbitdbServerMetrics {
    const [snapshot, setSnapshot] = useState(() => orbitdbServerService.snapshot());
    const [seenDatabases, setSeenDatabases] = useState(0);

    useEffect(() => orbitdbServerService.subscribe(setSnapshot), []);

    let connectedNodes = 0;
    let totalDatabases = 0;
    let swarmPeers = 0;
    let privateNodes = 0;
    for (const n of snapshot.nodes) {
        if (n.status === "connected") connectedNodes += 1;
        totalDatabases += n.databases.length;
        swarmPeers += n.swarmPeers.length;
        if (n.peer?.pnetMode === "private") privateNodes += 1;
    }
    const newDatabases = Math.max(0, totalDatabases - seenDatabases);

    const acknowledgeDatabases = useCallback(() => {
        const snap = orbitdbServerService.snapshot();
        setSeenDatabases(snap.nodes.reduce((s, n) => s + n.databases.length, 0));
    }, []);

    return {
        connectedNodes,
        totalNodes: snapshot.nodes.length,
        totalDatabases,
        swarmPeers,
        privateNodes,
        newDatabases,
        acknowledgeDatabases,
    };
}

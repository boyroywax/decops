/**
 * useOrchestratorMetrics — compact metrics hook for the app footer.
 *
 * Subscribes directly to `orchestratorService` so the footer stays live
 * even when the Orchestrator view is not mounted.
 */

import { useCallback, useEffect, useState } from "react";
import { orchestratorService } from "../service";

interface OrchestratorMetrics {
    totalStacks: number;
    healthyStacks: number;
    driftedStacks: number;
    pendingDrift: number;
    lastAppliedAt?: string;
    activeStatus: string;
    activeManifestName?: string;
    acknowledgeDrift: () => void;
}

export function useOrchestratorMetrics(): OrchestratorMetrics {
    const [snapshot, setSnapshot] = useState(() => orchestratorService.snapshot());

    useEffect(() => orchestratorService.subscribe(setSnapshot), []);

    let healthy = 0;
    let drifted = 0;
    let pendingDrift = 0;
    let lastAppliedAt: string | undefined;
    for (const n of snapshot.nodes) {
        if (n.status === "healthy") healthy += 1;
        if (n.status === "drifted" || n.status === "error") drifted += 1;
        pendingDrift += n.pendingDrift;
        if (n.lastAppliedAt && (!lastAppliedAt || n.lastAppliedAt > lastAppliedAt)) {
            lastAppliedAt = n.lastAppliedAt;
        }
    }
    const active = snapshot.nodes.find((n) => n.nodeId === snapshot.activeId);

    const acknowledgeDrift = useCallback(() => {
        for (const n of orchestratorService.snapshot().nodes) {
            orchestratorService.acknowledgeDrift(n.nodeId);
        }
    }, []);

    return {
        totalStacks: snapshot.nodes.length,
        healthyStacks: healthy,
        driftedStacks: drifted,
        pendingDrift,
        lastAppliedAt,
        activeStatus: active?.status ?? "idle",
        activeManifestName: active?.manifestName,
        acknowledgeDrift,
    };
}

/**
 * OrchestratorContext — React provider mirroring the orchestrator manager
 * state, and wiring the artifact subsystem into the service.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { useJobsContext } from "@/context/JobsContext";
import type { JobArtifact } from "@/types";
import { orchestratorService } from "./service";
import type {
    OrchestratorSnapshot,
    OrchestratorManagerSnapshot,
} from "./types/orchestrator";

interface OrchestratorContextType {
    snapshot: OrchestratorSnapshot;
    nodes: OrchestratorSnapshot[];
    activeId: string | null;
    manifestArtifacts: JobArtifact[];
    setActive: (id: string) => void;
    addNode: (label?: string) => string;
    removeNode: (id: string) => Promise<void>;
    setLabel: (id: string, label: string) => void;
    setManifestArtifact: (artifactId: string | null) => void;
}

const EMPTY_SNAPSHOT: OrchestratorSnapshot = {
    nodeId: "",
    label: "",
    status: "idle",
    manifestArtifactId: null,
    results: [],
    pendingDrift: 0,
};

const OrchestratorContext = createContext<OrchestratorContextType | null>(null);

export function OrchestratorProvider({ children }: { children: ReactNode }) {
    const jobs = useJobsContext();
    const [state, setState] = useState<OrchestratorManagerSnapshot>(() => orchestratorService.snapshot());

    // Inject artifact provider into the singleton service so commands /
    // bot calls outside React can read/write manifests too.
    useEffect(() => {
        orchestratorService.setArtifactProvider({
            getArtifact: (id) => jobs.allArtifacts.find((a) => a.id === id) ?? null,
            importArtifact: (a) => jobs.importArtifact(a),
            listManifestArtifacts: () =>
                jobs.allArtifacts.filter((a) => a.type === "json" && (a.tags ?? []).includes("manifest")),
        });
        return () => { orchestratorService.setArtifactProvider(null); };
    }, [jobs]);

    useEffect(() => orchestratorService.subscribe(setState), []);

    const manifestArtifacts = useMemo(
        () => jobs.allArtifacts.filter((a) => a.type === "json"),
        [jobs.allArtifacts],
    );

    const value = useMemo<OrchestratorContextType>(() => {
        const active = state.nodes.find((n) => n.nodeId === state.activeId) ?? null;
        return {
            snapshot: active ?? EMPTY_SNAPSHOT,
            nodes: state.nodes,
            activeId: state.activeId,
            manifestArtifacts,
            setActive: (id) => orchestratorService.setActive(id),
            addNode: (label) => orchestratorService.addNode(label),
            removeNode: (id) => orchestratorService.removeNode(id),
            setLabel: (id, label) => orchestratorService.setLabel(id, label),
            setManifestArtifact: (artifactId) => orchestratorService.setManifestArtifact(undefined, artifactId),
        };
    }, [state, manifestArtifacts]);

    return <OrchestratorContext.Provider value={value}>{children}</OrchestratorContext.Provider>;
}

export function useOrchestrator(): OrchestratorContextType {
    const ctx = useContext(OrchestratorContext);
    if (!ctx) throw new Error("useOrchestrator must be used inside <OrchestratorProvider>");
    return ctx;
}

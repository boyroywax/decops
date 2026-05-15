/**
 * OrbitdbContext — React provider that mirrors the orbitdb manager state.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { orbitdbService } from "./service";
import type { OrbitdbSnapshot, OrbitdbManagerSnapshot } from "./types/orbitdb";

interface OrbitdbContextType {
    snapshot: OrbitdbSnapshot;
    nodes: OrbitdbSnapshot[];
    activeId: string | null;
    setActive: (id: string) => void;
    addNode: (label?: string, heliaNodeId?: string | null) => string;
    removeNode: (id: string) => Promise<void>;
    setLabel: (id: string, label: string) => void;
    setHeliaBinding: (id: string | undefined, heliaNodeId: string | null) => void;
}

const EMPTY_SNAPSHOT: OrbitdbSnapshot = {
    nodeId: "",
    label: "",
    status: "stopped",
    heliaNodeId: null,
    peerId: null,
    identityId: null,
    databases: [],
};

const OrbitdbContext = createContext<OrbitdbContextType | null>(null);

export function OrbitdbProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<OrbitdbManagerSnapshot>(() => orbitdbService.snapshot());

    useEffect(() => orbitdbService.subscribe(setState), []);

    const value = useMemo<OrbitdbContextType>(() => {
        const active = state.nodes.find((n) => n.nodeId === state.activeId) ?? null;
        return {
            snapshot: active ?? EMPTY_SNAPSHOT,
            nodes: state.nodes,
            activeId: state.activeId,
            setActive: (id) => orbitdbService.setActive(id),
            addNode: (label, heliaNodeId = null) => orbitdbService.addNode(label, heliaNodeId),
            removeNode: (id) => orbitdbService.removeNode(id),
            setLabel: (id, label) => orbitdbService.setLabel(id, label),
            setHeliaBinding: (id, heliaNodeId) => orbitdbService.setHeliaBinding(id, heliaNodeId),
        };
    }, [state]);

    return <OrbitdbContext.Provider value={value}>{children}</OrbitdbContext.Provider>;
}

export function useOrbitdb(): OrbitdbContextType {
    const ctx = useContext(OrbitdbContext);
    if (!ctx) throw new Error("useOrbitdb must be used inside <OrbitdbProvider>");
    return ctx;
}

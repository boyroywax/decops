/**
 * OrbitdbServerContext — React provider mirroring the orbitdb-server manager state.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { orbitdbServerService } from "./service";
import type { OrbitdbServerSnapshot, OrbitdbServerManagerSnapshot } from "./types/orbitdbServer";

interface OrbitdbServerContextType {
    snapshot: OrbitdbServerSnapshot;
    nodes: OrbitdbServerSnapshot[];
    activeId: string | null;
    setActive: (id: string) => void;
    addNode: (label?: string, url?: string) => string;
    removeNode: (id: string) => Promise<void>;
}

const EMPTY_SNAPSHOT: OrbitdbServerSnapshot = {
    nodeId: "",
    label: "",
    status: "disconnected",
    endpoint: "",
    peer: null,
    databases: [],
    swarmPeers: [],
};

const OrbitdbServerContext = createContext<OrbitdbServerContextType | null>(null);

export function OrbitdbServerProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<OrbitdbServerManagerSnapshot>(() => orbitdbServerService.snapshot());

    useEffect(() => orbitdbServerService.subscribe(setState), []);

    const value = useMemo<OrbitdbServerContextType>(() => {
        const active = state.nodes.find((n) => n.nodeId === state.activeId) ?? null;
        return {
            snapshot: active ?? EMPTY_SNAPSHOT,
            nodes: state.nodes,
            activeId: state.activeId,
            setActive: (id) => orbitdbServerService.setActive(id),
            addNode: (label, url) => orbitdbServerService.addNode(label, url),
            removeNode: (id) => orbitdbServerService.removeNode(id),
        };
    }, [state]);

    return <OrbitdbServerContext.Provider value={value}>{children}</OrbitdbServerContext.Provider>;
}

export function useOrbitdbServer(): OrbitdbServerContextType {
    const ctx = useContext(OrbitdbServerContext);
    if (!ctx) throw new Error("useOrbitdbServer must be used inside <OrbitdbServerProvider>");
    return ctx;
}

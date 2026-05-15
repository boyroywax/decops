/**
 * HeliaContext — React provider that mirrors the helia manager state.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { heliaService } from "./service";
import type { HeliaSnapshot, HeliaManagerSnapshot } from "./types/helia";

interface HeliaContextType {
    snapshot: HeliaSnapshot;
    nodes: HeliaSnapshot[];
    activeId: string | null;
    setActive: (id: string) => void;
    addNode: (label?: string, libp2pNodeId?: string | null) => string;
    removeNode: (id: string) => Promise<void>;
}

const EMPTY_SNAPSHOT: HeliaSnapshot = {
    nodeId: "",
    label: "",
    status: "stopped",
    libp2pNodeId: null,
    peerId: null,
    entries: [],
    pinnedCount: 0,
    totalBytes: 0,
};

const HeliaContext = createContext<HeliaContextType | null>(null);

export function HeliaProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<HeliaManagerSnapshot>(() => heliaService.snapshot());

    useEffect(() => heliaService.subscribe(setState), []);

    const value = useMemo<HeliaContextType>(() => {
        const active = state.nodes.find((n) => n.nodeId === state.activeId) ?? null;
        return {
            snapshot: active ?? EMPTY_SNAPSHOT,
            nodes: state.nodes,
            activeId: state.activeId,
            setActive: (id) => heliaService.setActive(id),
            addNode: (label, libp2pNodeId = null) => heliaService.addNode(label, libp2pNodeId),
            removeNode: (id) => heliaService.removeNode(id),
        };
    }, [state]);

    return <HeliaContext.Provider value={value}>{children}</HeliaContext.Provider>;
}

export function useHelia(): HeliaContextType {
    const ctx = useContext(HeliaContext);
    if (!ctx) throw new Error("useHelia must be used inside <HeliaProvider>");
    return ctx;
}

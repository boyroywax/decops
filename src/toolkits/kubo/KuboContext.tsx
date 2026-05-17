/**
 * KuboContext — React provider mirroring the Kubo manager state.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { kuboService } from "./service";
import type { KuboSnapshot, KuboManagerSnapshot } from "./types/kubo";

interface KuboContextType {
    snapshot: KuboSnapshot;
    nodes: KuboSnapshot[];
    activeId: string | null;
    setActive: (id: string) => void;
    addNode: (label?: string, url?: string) => string;
    removeNode: (id: string) => Promise<void>;
}

const EMPTY_SNAPSHOT: KuboSnapshot = {
    nodeId: "",
    label: "",
    status: "disconnected",
    endpoint: "",
    peer: null,
    entries: [],
    pinnedCount: 0,
    totalBytes: 0,
};

const KuboContext = createContext<KuboContextType | null>(null);

export function KuboProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<KuboManagerSnapshot>(() => kuboService.snapshot());

    useEffect(() => kuboService.subscribe(setState), []);

    const value = useMemo<KuboContextType>(() => {
        const active = state.nodes.find((n) => n.nodeId === state.activeId) ?? null;
        return {
            snapshot: active ?? EMPTY_SNAPSHOT,
            nodes: state.nodes,
            activeId: state.activeId,
            setActive: (id) => kuboService.setActive(id),
            addNode: (label, url) => kuboService.addNode(label, url),
            removeNode: (id) => kuboService.removeNode(id),
        };
    }, [state]);

    return <KuboContext.Provider value={value}>{children}</KuboContext.Provider>;
}

export function useKubo(): KuboContextType {
    const ctx = useContext(KuboContext);
    if (!ctx) throw new Error("useKubo must be used inside <KuboProvider>");
    return ctx;
}

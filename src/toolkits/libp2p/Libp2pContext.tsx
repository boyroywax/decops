/**
 * Libp2pContext — React provider that mirrors the libp2p manager state.
 *
 * Exposes the list of nodes, the active node's snapshot, and helpers
 * for switching/adding/removing nodes. Action helpers are kept for
 * convenience (e.g. small components that don't go through the job
 * creator), but in practice the main view dispatches through addJob.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import {
    libp2pService,
    type Libp2pSnapshot,
    type ManagerSnapshot,
} from "./service";

interface Libp2pContextType {
    /** Snapshot of the active node, or a synthetic empty snapshot if none. */
    snapshot: Libp2pSnapshot;
    /** All node snapshots in order. */
    nodes: Libp2pSnapshot[];
    /** Local id of the active node (null when no nodes). */
    activeId: string | null;
    setActive: (id: string) => void;
    addNode: (label?: string) => string;
    removeNode: (id: string) => Promise<void>;
}

const EMPTY_SNAPSHOT: Libp2pSnapshot = {
    nodeId: "",
    label: "",
    status: "stopped",
    peerId: null,
    listenAddrs: [],
    multiaddrs: [],
    peers: [],
    topics: [],
    hasPersistedIdentity: false,
    pubsubMessageCount: 0,
    pubsubMessages: [],
};

const Libp2pContext = createContext<Libp2pContextType | null>(null);

export function Libp2pProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ManagerSnapshot>(() => libp2pService.snapshot());

    useEffect(() => libp2pService.subscribe(setState), []);

    const value = useMemo<Libp2pContextType>(() => {
        const active = state.nodes.find((n) => n.nodeId === state.activeId) ?? null;
        return {
            snapshot: active ?? EMPTY_SNAPSHOT,
            nodes: state.nodes,
            activeId: state.activeId,
            setActive: (id) => libp2pService.setActive(id),
            addNode: (label) => libp2pService.addNode(label),
            removeNode: (id) => libp2pService.removeNode(id),
        };
    }, [state]);

    return <Libp2pContext.Provider value={value}>{children}</Libp2pContext.Provider>;
}

export function useLibp2p(): Libp2pContextType {
    const ctx = useContext(Libp2pContext);
    if (!ctx) throw new Error("useLibp2p must be used inside <Libp2pProvider>");
    return ctx;
}

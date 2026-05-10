/**
 * Libp2pContext — React provider that mirrors the libp2p service state.
 */

import {
    createContext, useContext, useEffect, useState, useCallback,
    type ReactNode,
} from "react";
import {
    libp2pService,
    type Libp2pSnapshot,
    type Libp2pStartOptions,
} from "./service";

interface Libp2pContextType {
    snapshot: Libp2pSnapshot;
    start: (opts?: Libp2pStartOptions) => Promise<void>;
    stop: () => Promise<void>;
    dial: (target: string) => Promise<{ remotePeer: string }>;
    hangUp: (peerId: string) => Promise<void>;
    ping: (peerId: string) => Promise<number>;
    subscribeTopic: (topic: string) => Promise<void>;
    unsubscribeTopic: (topic: string) => Promise<void>;
    publish: (topic: string, message: string) => Promise<void>;
    clearPeers: () => void;
}

const Libp2pContext = createContext<Libp2pContextType | null>(null);

export function Libp2pProvider({ children }: { children: ReactNode }) {
    const [snapshot, setSnapshot] = useState<Libp2pSnapshot>(() => libp2pService.snapshot());

    useEffect(() => {
        return libp2pService.subscribe(setSnapshot);
    }, []);

    const start = useCallback((opts?: Libp2pStartOptions) => libp2pService.start(opts), []);
    const stop = useCallback(() => libp2pService.stop(), []);
    const dial = useCallback((target: string) => libp2pService.dial(target), []);
    const hangUp = useCallback((peerId: string) => libp2pService.hangUp(peerId), []);
    const ping = useCallback((peerId: string) => libp2pService.ping(peerId), []);
    const subscribeTopic = useCallback((t: string) => libp2pService.subscribeTopic(t), []);
    const unsubscribeTopic = useCallback((t: string) => libp2pService.unsubscribeTopic(t), []);
    const publish = useCallback((t: string, m: string) => libp2pService.publish(t, m), []);
    const clearPeers = useCallback(() => libp2pService.clearPeers(), []);

    const value: Libp2pContextType = {
        snapshot, start, stop, dial, hangUp, ping,
        subscribeTopic, unsubscribeTopic, publish, clearPeers,
    };

    return <Libp2pContext.Provider value={value}>{children}</Libp2pContext.Provider>;
}

export function useLibp2p(): Libp2pContextType {
    const ctx = useContext(Libp2pContext);
    if (!ctx) throw new Error("useLibp2p must be used inside <Libp2pProvider>");
    return ctx;
}

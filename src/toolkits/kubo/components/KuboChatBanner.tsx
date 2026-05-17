import { useEffect, useState } from "react";
import { Cloud, Database, Pin, Server } from "lucide-react";
import { kuboService } from "../service";
import type { KuboManagerSnapshot } from "../types/kubo";

/**
 * Compact status banner shown inside the chat panel when the Kubo chat
 * agent is active. Mirrors `HeliaChatBanner` styling/conventions and
 * reuses the shared `.libp2p-chat-banner*` rules from `libp2p.css`.
 */
export function KuboChatBanner() {
    const [snap, setSnap] = useState<KuboManagerSnapshot>(() => kuboService.snapshot());

    useEffect(() => {
        const unsub = kuboService.subscribe((s) => setSnap(s));
        return () => { unsub(); };
    }, []);

    const totals = snap.nodes.reduce(
        (acc, n) => {
            acc.entries += n.entries.length;
            acc.pinned += n.pinnedCount;
            if (n.status === "connected") acc.connected += 1;
            acc.peers += n.peer?.connectedPeers ?? 0;
            return acc;
        },
        { entries: 0, pinned: 0, connected: 0, peers: 0 },
    );

    return (
        <div className="libp2p-chat-banner">
            <div className="libp2p-chat-banner__stat">
                <Cloud size={11} />
                <span className="libp2p-chat-banner__value">
                    {totals.connected}<span className="libp2p-chat-banner__total">/{snap.nodes.length}</span>
                </span>
                <span className="libp2p-chat-banner__label">Online</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Database size={11} />
                <span className="libp2p-chat-banner__value">{totals.entries}</span>
                <span className="libp2p-chat-banner__label">CIDs</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Pin size={11} />
                <span className="libp2p-chat-banner__value">{totals.pinned}</span>
                <span className="libp2p-chat-banner__label">Pinned</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Server size={11} />
                <span className="libp2p-chat-banner__value">{totals.peers}</span>
                <span className="libp2p-chat-banner__label">Peers</span>
            </div>
        </div>
    );
}

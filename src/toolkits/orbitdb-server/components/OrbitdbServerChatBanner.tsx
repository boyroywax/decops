import { useEffect, useState } from "react";
import { Cloud, Database, Network, ShieldCheck } from "lucide-react";
import { orbitdbServerService } from "../service";
import type { OrbitdbServerManagerSnapshot } from "../types/orbitdbServer";

/**
 * Compact status banner shown inside the chat panel when the
 * orbitdb-server chat agent is active. Mirrors `KuboChatBanner` styling
 * and reuses the shared `.libp2p-chat-banner*` rules from `libp2p.css`.
 */
export function OrbitdbServerChatBanner() {
    const [snap, setSnap] = useState<OrbitdbServerManagerSnapshot>(() => orbitdbServerService.snapshot());

    useEffect(() => {
        const unsub = orbitdbServerService.subscribe((s) => setSnap(s));
        return () => { unsub(); };
    }, []);

    const totals = snap.nodes.reduce(
        (acc, n) => {
            acc.databases += n.databases.length;
            if (n.status === "connected") acc.connected += 1;
            acc.peers += n.peer?.connectedPeers ?? n.swarmPeers.length ?? 0;
            if (n.peer?.pnetMode === "private") acc.privateNodes += 1;
            return acc;
        },
        { databases: 0, connected: 0, peers: 0, privateNodes: 0 },
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
                <span className="libp2p-chat-banner__value">{totals.databases}</span>
                <span className="libp2p-chat-banner__label">DBs</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Network size={11} />
                <span className="libp2p-chat-banner__value">{totals.peers}</span>
                <span className="libp2p-chat-banner__label">Peers</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <ShieldCheck size={11} />
                <span className="libp2p-chat-banner__value">{totals.privateNodes}</span>
                <span className="libp2p-chat-banner__label">Pnet</span>
            </div>
        </div>
    );
}

import { useEffect, useState } from "react";
import { Power, Users, Radio, Globe } from "lucide-react";
import { libp2pService, type ManagerSnapshot } from "../service";

/**
 * Compact status banner shown inside the chat panel when the libp2p chat
 * agent is active. Mirrors the metric tiles from Libp2pBotPanel but sized
 * to live above the chat conversation rather than as a sidebar.
 */
export function Libp2pChatBanner() {
    const [snap, setSnap] = useState<ManagerSnapshot>(() => libp2pService.snapshot());

    useEffect(() => {
        const unsub = libp2pService.subscribe((s) => setSnap(s));
        return () => { unsub(); };
    }, []);

    const totals = snap.nodes.reduce(
        (acc, n) => {
            acc.peers += n.peers.length;
            acc.connected += n.peers.filter((p) => p.connected).length;
            acc.topics += n.topics.length;
            acc.pubsubMessages += n.pubsubMessageCount;
            if (n.status === "running") acc.running += 1;
            return acc;
        },
        { peers: 0, connected: 0, topics: 0, pubsubMessages: 0, running: 0 },
    );

    return (
        <div className="libp2p-chat-banner">
            <div className="libp2p-chat-banner__stat">
                <Power size={11} />
                <span className="libp2p-chat-banner__value">
                    {totals.running}<span className="libp2p-chat-banner__total">/{snap.nodes.length}</span>
                </span>
                <span className="libp2p-chat-banner__label">Running</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Users size={11} />
                <span className="libp2p-chat-banner__value">
                    {totals.connected}<span className="libp2p-chat-banner__total">/{totals.peers}</span>
                </span>
                <span className="libp2p-chat-banner__label">Peers</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Radio size={11} />
                <span className="libp2p-chat-banner__value">{totals.topics}</span>
                <span className="libp2p-chat-banner__label">Topics</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Globe size={11} />
                <span className="libp2p-chat-banner__value">{totals.pubsubMessages}</span>
                <span className="libp2p-chat-banner__label">Pubsub</span>
            </div>
        </div>
    );
}

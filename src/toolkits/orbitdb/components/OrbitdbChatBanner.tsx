import { useEffect, useState } from "react";
import { Power, Database, Layers, Hash } from "lucide-react";
import { orbitdbService } from "../service";
import type { OrbitdbManagerSnapshot } from "../types/orbitdb";

/**
 * Compact status banner shown inside the chat panel when the OrbitDB
 * chat agent is active. Mirrors `HeliaChatBanner` styling/conventions.
 */
export function OrbitdbChatBanner() {
    const [snap, setSnap] = useState<OrbitdbManagerSnapshot>(() => orbitdbService.snapshot());

    useEffect(() => {
        const unsub = orbitdbService.subscribe((s) => setSnap(s));
        return () => { unsub(); };
    }, []);

    const totals = snap.nodes.reduce(
        (acc, n) => {
            acc.databases += n.databases.length;
            acc.open += n.databases.filter((d) => d.open).length;
            acc.entries += n.databases.reduce((a, d) => a + (d.count ?? 0), 0);
            if (n.status === "running") acc.running += 1;
            return acc;
        },
        { databases: 0, open: 0, entries: 0, running: 0 },
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
                <Database size={11} />
                <span className="libp2p-chat-banner__value">
                    {totals.open}<span className="libp2p-chat-banner__total">/{totals.databases}</span>
                </span>
                <span className="libp2p-chat-banner__label">DBs</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Layers size={11} />
                <span className="libp2p-chat-banner__value">{totals.entries}</span>
                <span className="libp2p-chat-banner__label">Entries</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Hash size={11} />
                <span className="libp2p-chat-banner__value">{snap.activeId ? snap.activeId.slice(0, 6) : "—"}</span>
                <span className="libp2p-chat-banner__label">Active</span>
            </div>
        </div>
    );
}

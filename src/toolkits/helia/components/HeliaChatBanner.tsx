import { useEffect, useState } from "react";
import { Power, Database, Pin, HardDrive } from "lucide-react";
import { heliaService } from "../service";
import type { HeliaManagerSnapshot } from "../types/helia";

/**
 * Compact status banner shown inside the chat panel when the Helia chat
 * agent is active. Mirrors `Libp2pChatBanner` styling/conventions.
 */
export function HeliaChatBanner() {
    const [snap, setSnap] = useState<HeliaManagerSnapshot>(() => heliaService.snapshot());

    useEffect(() => {
        const unsub = heliaService.subscribe((s) => setSnap(s));
        return () => { unsub(); };
    }, []);

    const totals = snap.nodes.reduce(
        (acc, n) => {
            acc.entries += n.entries.length;
            acc.pinned += n.pinnedCount;
            acc.bytes += n.totalBytes;
            if (n.status === "running") acc.running += 1;
            return acc;
        },
        { entries: 0, pinned: 0, bytes: 0, running: 0 },
    );

    const fmtBytes = (n: number): string => {
        if (n < 1024) return `${n}B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
        return `${(n / (1024 * 1024)).toFixed(1)}M`;
    };

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
                <span className="libp2p-chat-banner__value">{totals.entries}</span>
                <span className="libp2p-chat-banner__label">CIDs</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Pin size={11} />
                <span className="libp2p-chat-banner__value">{totals.pinned}</span>
                <span className="libp2p-chat-banner__label">Pinned</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <HardDrive size={11} />
                <span className="libp2p-chat-banner__value">{fmtBytes(totals.bytes)}</span>
                <span className="libp2p-chat-banner__label">Size</span>
            </div>
        </div>
    );
}

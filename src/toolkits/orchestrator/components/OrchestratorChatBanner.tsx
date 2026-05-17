import { useEffect, useState } from "react";
import { Workflow, Layers, AlertTriangle, CheckCircle } from "lucide-react";
import { orchestratorService } from "../service";
import type { OrchestratorManagerSnapshot } from "../types/orchestrator";

/**
 * Compact status banner shown inside the chat panel when the Orchestrator
 * chat agent is active. Reuses the shared `.libp2p-chat-banner*` rules.
 */
export function OrchestratorChatBanner() {
    const [snap, setSnap] = useState<OrchestratorManagerSnapshot>(() => orchestratorService.snapshot());

    useEffect(() => {
        const unsub = orchestratorService.subscribe(setSnap);
        return () => { unsub(); };
    }, []);

    let healthy = 0, drifted = 0, pendingDrift = 0;
    for (const n of snap.nodes) {
        if (n.status === "healthy") healthy += 1;
        if (n.status === "drifted" || n.status === "error") drifted += 1;
        pendingDrift += n.pendingDrift;
    }
    const active = snap.nodes.find((n) => n.nodeId === snap.activeId);

    return (
        <div className="libp2p-chat-banner">
            <div className="libp2p-chat-banner__stat">
                <Layers size={11} />
                <span className="libp2p-chat-banner__value">
                    {snap.nodes.length}
                </span>
                <span className="libp2p-chat-banner__label">Stacks</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <CheckCircle size={11} />
                <span className="libp2p-chat-banner__value">{healthy}</span>
                <span className="libp2p-chat-banner__label">Healthy</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <AlertTriangle size={11} />
                <span className="libp2p-chat-banner__value">{drifted}</span>
                <span className="libp2p-chat-banner__label">Drifted</span>
            </div>
            <div className="libp2p-chat-banner__stat">
                <Workflow size={11} />
                <span className="libp2p-chat-banner__value">{pendingDrift}</span>
                <span className="libp2p-chat-banner__label">Pending</span>
            </div>
            {active?.manifestName ? (
                <div className="libp2p-chat-banner__stat" title={`Manifest: ${active.manifestName} v${active.manifestVersion ?? "?"}`}>
                    <span className="libp2p-chat-banner__label">{active.manifestName}</span>
                </div>
            ) : null}
        </div>
    );
}

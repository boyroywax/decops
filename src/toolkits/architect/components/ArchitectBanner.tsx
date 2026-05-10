import { Bot, MessageSquare, Network, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useArchitectContext } from "../hooks/ArchitectContext";

/**
 * Sticky banner shown inside the chat panel when the Architect chat agent
 * is active. Reads the live architect state via ArchitectContext (mounted
 * once in AuthenticatedApp). The full preview/deploy UI continues to live
 * in ArchitectPopup; the banner just surfaces phase + progress while the
 * user keeps typing in chat.
 *
 * Visual pattern intentionally mirrors `Libp2pChatBanner` — a 4-column
 * grid of compact stat tiles for at-a-glance information density.
 */
export function ArchitectBanner() {
    const architect = useArchitectContext();
    if (!architect) return null;

    const phase = architect.archPhase;
    const preview = architect.archPreview;
    const dp = architect.deployProgress;

    const agentCount = preview?.agents.length ?? 0;
    const channelCount = preview?.channels.length ?? 0;
    const bridgeCount = preview?.bridges?.length ?? 0;

    const phaseLabel =
        phase === "input" ? "Idle" :
        phase === "preview" ? "Ready" :
        phase === "deploying" ? "Deploy" :
        phase === "done" ? "Live" : phase;

    const PhaseIcon =
        phase === "deploying" ? Loader2 :
        phase === "done" ? CheckCircle2 :
        Sparkles;

    return (
        <>
            <div className="architect-chat-banner">
                <div className="architect-chat-banner__stat">
                    <Bot size={12} />
                    <span className="architect-chat-banner__value">{agentCount}</span>
                    <span className="architect-chat-banner__label">Agents</span>
                </div>
                <div className="architect-chat-banner__stat">
                    <MessageSquare size={12} />
                    <span className="architect-chat-banner__value">{channelCount}</span>
                    <span className="architect-chat-banner__label">Channels</span>
                </div>
                <div className="architect-chat-banner__stat">
                    <Network size={12} />
                    <span className="architect-chat-banner__value">{bridgeCount}</span>
                    <span className="architect-chat-banner__label">Bridges</span>
                </div>
                <div className="architect-chat-banner__stat">
                    <PhaseIcon size={12} className={phase === "deploying" ? "architect-chat-banner__spin" : undefined} />
                    <span className="architect-chat-banner__value">
                        {phaseLabel}
                        {phase === "deploying" && dp.total > 0 && (
                            <span className="architect-chat-banner__total"> {dp.count}/{dp.total}</span>
                        )}
                    </span>
                    <span className="architect-chat-banner__label">Phase</span>
                </div>
            </div>
            {architect.archError && (
                <div className="architect-chat-banner__error">
                    <AlertCircle size={11} />
                    <span>{architect.archError}</span>
                </div>
            )}
        </>
    );
}

import type { CSSProperties } from "react";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useActiveChatAgent, useChatAgentsStore } from "@/services/chat/agents";

/**
 * Sticky banner rendered at the top of the chat conversation when a chat
 * agent is active. Hosts an agent-supplied banner component (e.g. live
 * libp2p metrics, Architect phase progress) plus an exit affordance.
 */
export function ChatAgentBanner() {
    const agent = useActiveChatAgent();
    const setActive = useChatAgentsStore((s) => s.setActive);

    if (!agent) return null;

    const Banner = agent.banner;
    const Icon = agent.icon;
    const [gStart, gEnd] = agent.gradient ?? ["#38bdf8", "#a78bfa"];
    const bannerStyle = {
        ["--agent-gradient-start" as string]: gStart,
        ["--agent-gradient-end" as string]: gEnd,
    } as CSSProperties;

    return (
        <div className="chat-agent-banner" data-agent={agent.id} style={bannerStyle}>
            <div className="chat-agent-banner__header">
                <div className="chat-agent-banner__identity">
                    {Icon ? (
                        <GradientIcon
                            icon={Icon as LucideIcon}
                            size={14}
                            gradient={agent.gradient ?? ["#38bdf8", "#a78bfa"]}
                        />
                    ) : null}
                    <span className="chat-agent-banner__name">{agent.name}</span>
                    {agent.description ? (
                        <span className="chat-agent-banner__desc">{agent.description}</span>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="chat-agent-banner__exit"
                    title="Exit agent mode"
                    aria-label="Exit agent mode"
                    onClick={() => setActive(null)}
                >
                    <X size={11} />
                </button>
            </div>
            {Banner ? (
                <div className="chat-agent-banner__body">
                    <Banner />
                </div>
            ) : null}
        </div>
    );
}

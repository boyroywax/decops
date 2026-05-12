import { useEffect } from "react";
import { Bot } from "lucide-react";
import { useChatAgentsStore } from "@/services/chat/agents";
import { Libp2pChatBanner } from "./components/Libp2pChatBanner";

export function useRegisterLibp2pChatAgent() {
    useEffect(() => {
        const dispose = useChatAgentsStore.getState().register({
            id: "libp2p",
            name: "libp2p Bot",
            description: "Direct line to the libp2p sub-agent — start nodes, dial peers, manage pubsub, identities.",
            icon: Bot,
            gradient: ["#38bdf8", "#a78bfa"],
            banner: Libp2pChatBanner,
            placeholder: "Tell the libp2p bot what to do (start a node, dial a peer, subscribe…)",
            toolkitIds: ["libp2p", "infrastructure", "jobs"],
            workspace: {
                view: "libp2p",
                sideChatFooterPanel: "none",
            },
            quickActions: [
                { label: "Start node", prompt: "Start the active node with default services" },
                { label: "List peers", prompt: "List connected peers" },
                { label: "Subscribe & say hi", prompt: "Subscribe to topic decops.discovery and publish hello" },
                { label: "Generate identity", prompt: "Generate a new identity and store it in the vault" },
            ],
        });
        return dispose;
    }, []);
}
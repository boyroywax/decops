import { useState, useRef, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Message, Agent, Channel, JobRequest } from "../types";

export function useMessages(
    addJob: (job: JobRequest) => void,
    agents: Agent[],
    channels: Channel[],
    activeChannel: string | null,
    broadcastGroup: string | null
) {
    const [messages, setMessages] = useLocalStorage<Message[]>("decops_messages", []);

    // UI State
    const [msgInput, setMsgInput] = useState("");
    const [sending, setSending] = useState(false);
    const [broadcastInput, setBroadcastInput] = useState("");
    const [broadcasting, setBroadcasting] = useState(false);
    const msgEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, activeChannel]);

    const sendMessage = async () => {
        if (!msgInput.trim() || !activeChannel || sending) return;
        const ch = channels.find((c) => c.id === activeChannel);
        if (!ch) return;
        const fromAgent = agents.find((a) => a.id === ch.from);
        const toAgent = agents.find((a) => a.id === ch.to);
        if (!fromAgent || !toAgent) return;

        setSending(true);
        addJob({
            type: "send_message",
            request: {
                from_agent_name: fromAgent.name,
                to_agent_name: toAgent.name,
                message: msgInput.trim()
            }
        });

        setMsgInput("");
        setTimeout(() => setSending(false), 500);
    };

    const sendBroadcast = async () => {
        if (!broadcastInput.trim() || !broadcastGroup || broadcasting) return;

        setBroadcasting(true);
        addJob({
            type: "broadcast_message",
            request: {
                group_id: broadcastGroup,
                message: broadcastInput.trim()
            }
        });

        setBroadcastInput("");
        setTimeout(() => setBroadcasting(false), 500);
    };

    const removeMessages = (ids: Set<string>) => {
        addJob({ type: "bulk_delete", request: { type: "messages", ids: Array.from(ids) } });
    };

    const channelMessages = activeChannel ? messages.filter((m) => m.channelId === activeChannel) : [];

    return {
        messages, setMessages,
        msgInput, setMsgInput,
        sending,
        broadcastInput, setBroadcastInput,
        broadcasting,
        msgEndRef,
        channelMessages,
        sendMessage, sendBroadcast, removeMessages
    };
}

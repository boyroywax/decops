import { useState, useRef, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Message, Agent, Channel, JobRequest } from "@/types";

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
                from_agent_id: fromAgent.id,
                to_agent_id: toAgent.id,
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

    /** Mark one or more messages as read */
    const markAsRead = (ids: string[]) => {
        const now = Date.now();
        setMessages(prev => prev.map(m =>
            ids.includes(m.id) && !m.readAt ? { ...m, readAt: now } : m
        ));
    };

    /** Mark all messages in a channel as read */
    const markChannelRead = (channelId: string) => {
        const now = Date.now();
        setMessages(prev => prev.map(m =>
            m.channelId === channelId && !m.readAt && m.status !== "sending"
                ? { ...m, readAt: now } : m
        ));
    };

    const channelMessages = activeChannel ? messages.filter((m) => m.channelId === activeChannel) : [];

    /** Count of unread messages per channel */
    const unreadCounts: Record<string, number> = {};
    for (const m of messages) {
        if (!m.readAt && m.response !== null && m.status !== "sending") {
            unreadCounts[m.channelId] = (unreadCounts[m.channelId] || 0) + 1;
        }
    }

    /** Total unread count */
    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

    // Auto-mark channel messages as read when the channel is active
    useEffect(() => {
        if (activeChannel && channelMessages.length > 0) {
            const unreadIds = channelMessages
                .filter(m => !m.readAt && m.response !== null && m.status !== "sending")
                .map(m => m.id);
            if (unreadIds.length > 0) {
                // Small delay so the user sees the "new" state briefly
                const timer = setTimeout(() => markAsRead(unreadIds), 1500);
                return () => clearTimeout(timer);
            }
        }
    }, [activeChannel, channelMessages.length]);

    return {
        messages, setMessages,
        msgInput, setMsgInput,
        sending,
        broadcastInput, setBroadcastInput,
        broadcasting,
        msgEndRef,
        channelMessages,
        sendMessage, sendBroadcast, removeMessages,
        markAsRead, markChannelRead,
        unreadCounts, totalUnread,
    };
}

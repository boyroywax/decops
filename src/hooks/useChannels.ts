import { useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Channel, ChannelForm } from "../types";

export function useChannels(addJob: (job: any) => void) {
    const [channels, setChannels] = useLocalStorage<Channel[]>("decops_channels", []);

    // UI State
    const [channelForm, setChannelForm] = useState<ChannelForm>({ from: "", to: "", type: "data" });
    const [activeChannel, setActiveChannel] = useState<string | null>(null);
    const [activeChannels, setActiveChannels] = useState<Set<string>>(new Set()); // For AI processing feedback

    const createChannel = () => {
        if (!channelForm.from || !channelForm.to || channelForm.from === channelForm.to) return;
        addJob({
            type: "create_channel",
            request: {
                from: channelForm.from,
                to: channelForm.to,
                type: channelForm.type
            }
        });
        setChannelForm({ from: "", to: "", type: "data" });
    };

    const removeChannel = (id: string) => {
        addJob({ type: "delete_channel", request: { id } });
        if (activeChannel === id) setActiveChannel(null);
    };

    const removeChannels = (ids: Set<string>) => {
        addJob({ type: "bulk_delete", request: { type: "channels", ids: Array.from(ids) } });
        if (activeChannel && ids.has(activeChannel)) setActiveChannel(null);
    };

    return {
        channels, setChannels,
        channelForm, setChannelForm,
        activeChannel, setActiveChannel,
        activeChannels, setActiveChannels,
        createChannel, removeChannel, removeChannels
    };
}

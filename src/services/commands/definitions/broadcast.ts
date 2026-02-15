import { CommandDefinition } from "../types";
import { Message } from "../../../types";
import { callAgentAI } from "../../ai";

export const broadcastMessageCommand: CommandDefinition = {
    id: "broadcast_message",
    description: "Sends a message to all members of a group.",
    tags: ["messaging", "interaction", "group"],
    rbac: ["orchestrator"],
    args: {
        group_id: { name: "group_id", type: "string", description: "Group ID", required: true },
        message: { name: "message", type: "string", description: "Message Content", required: true },
        sender_id: { name: "sender_id", type: "string", description: "Sender Agent ID", required: false } // optional, defaults to first member
    },
    output: "Confirmation",
    execute: async (args, context) => {
        const { group_id, message, sender_id } = args;
        const { agents, channels, groups, setMessages, setActiveChannels, addLog } = context.workspace;

        const group = groups.find((g: any) => g.id === group_id);
        if (!group) throw new Error("Group not found");
        if (group.members.length < 2) throw new Error("Group needs at least 2 members");

        const senderId = sender_id || group.members[0];
        const sender = agents.find((a: any) => a.id === senderId);
        if (!sender) throw new Error("Sender not found");

        addLog(`Broadcasting to "${group.name}"...`);

        const promises: Promise<any>[] = [];

        // We can't use `setMessages` inside a loop efficiently if we want to batch.
        // We should build the new messages array.
        const newMessages: Message[] = [];

        // This command function mimics the loop in useWorkspace but we must be careful about state updates.
        // We are inside an async function.

        for (let i = 0; i < group.members.length; i++) {
            const receiverId = group.members[i];
            if (receiverId === senderId) continue;

            const receiver = agents.find((a: any) => a.id === receiverId);
            const ch = channels.find((c: any) =>
                (c.from === senderId && c.to === receiverId) ||
                (c.from === receiverId && c.to === senderId)
            );

            if (!ch || !receiver) continue;

            const msgId = crypto.randomUUID();
            const msg: Message = {
                id: msgId,
                channelId: ch.id,
                fromId: senderId,
                toId: receiverId,
                content: `[GROUP BROADCAST — ${group.name}] ${message}`,
                response: null,
                status: "sending",
                ts: Date.now(),
            };

            newMessages.push(msg);

            if (receiver.prompt) {
                // Async call
                promises.push(
                    callAgentAI(receiver, sender, msg.content, ch.type, [])
                        .then(response => ({ msgId, response, status: "delivered" }))
                        .catch(err => ({ msgId, response: "Error", status: "failed" }))
                );
            } else {
                promises.push(Promise.resolve({ msgId, response: "[No prompt]", status: "no-prompt" }));
            }
        }

        // Initial update with "sending" status
        setMessages((prev: any[]) => [...prev, ...newMessages]);

        // Wait for all responses
        const results = await Promise.all(promises);

        // Update messages with responses
        setMessages((prev: any[]) => prev.map((m: any) => {
            const res = results.find(r => r.msgId === m.id);
            return res ? { ...m, response: res.response, status: res.status } : m;
        }));

        addLog("Broadcast complete");
        return { success: true, count: newMessages.length };
    }
};

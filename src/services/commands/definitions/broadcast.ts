import { CommandDefinition } from "@/services/commands/types";
import { Agent, Channel, Group, Message } from "@/types";
import { callAgentAI } from "@/services/ai";

export const broadcastMessageCommand: CommandDefinition = {
    id: "broadcast_message",
    description: "Sends a message to all members of a group.",
    tags: ["messaging", "interaction", "group"],
    rbac: ["orchestrator"],
    args: {
        group_id: { name: "group_id", type: "group", description: "Group ID", required: true },
        message: { name: "message", type: "string", description: "Message Content", required: true },
        sender_id: { name: "sender_id", type: "agent", description: "Sender Agent ID", required: false }, // optional, defaults to first member
        await_responses: {
            name: "await_responses",
            type: "boolean",
            description: "If true, waits for all recipient AI responses before completing the job (slower).",
            required: false,
            defaultValue: false,
        }
    },
    output: "Confirmation",
    outputSchema: {
        type: "object",
        properties: {
            success: { type: "boolean" },
            count: { type: "number" },
            status: { type: "string", enum: ["queued", "delivered"] },
            messageIds: { type: "array", items: { type: "string" } },
        },
        additionalProperties: true,
    },
    execute: async (args, context) => {
        const { group_id, message, sender_id } = args;
        const awaitResponses = Boolean(args.await_responses);
        const { agents, channels, groups, setMessages, setActiveChannels, addLog } = context.workspace;

        const group = groups.find((g: Group) => g.id === group_id);
        if (!group) throw new Error("Group not found");
        if (group.members.length < 2) throw new Error("Group needs at least 2 members");

        const senderId = sender_id || group.members[0];
        const sender = agents.find((a: Agent) => a.id === senderId);
        if (!sender) throw new Error("Sender not found");

        addLog(`Broadcasting to "${group.name}"...`);

        const promises: Promise<{ msgId: string; response: string; status: string }>[] = [];

        // We can't use `setMessages` inside a loop efficiently if we want to batch.
        // We should build the new messages array.
        const newMessages: Message[] = [];

        // This command function mimics the loop in useWorkspace but we must be careful about state updates.
        // We are inside an async function.

        for (let i = 0; i < group.members.length; i++) {
            const receiverId = group.members[i];
            if (receiverId === senderId) continue;

            const receiver = agents.find((a: Agent) => a.id === receiverId);
            const ch = channels.find((c: Channel) =>
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
                    callAgentAI(receiver, sender, msg.content, ch.type, [], undefined, context)
                        .then(response => ({ msgId, response, status: "delivered" }))
                        .catch(() => ({ msgId, response: "Error", status: "failed" }))
                );
            } else {
                promises.push(Promise.resolve({ msgId, response: "[No prompt]", status: "no-prompt" }));
            }
        }

        // Initial update with "sending" status
        setMessages((prev: Message[]) => [...prev, ...newMessages]);

        const settleResponses = async () => {
            const results = await Promise.all(promises);

            // Update messages with responses
            setMessages((prev: Message[]) => prev.map((m: Message) => {
                const res = results.find(r => r.msgId === m.id);
                return res ? { ...m, response: res.response, status: res.status as Message["status"] } : m;
            }));

            addLog("Broadcast complete");

            // Write responses to shared storage
            context.storage.lastBroadcastResponses = results;
            context.storage.lastBroadcastCount = newMessages.length;

            // Produce deliverable with broadcast results
            context.addDeliverable({
                key: 'broadcast-results',
                name: `Broadcast to ${group.name}`,
                type: 'json',
                content: JSON.stringify({ group: group.name, message, responses: results }, null, 2),
                tags: ['broadcast', `group:${group.name}`],
            });

            return results;
        };

        const messageIds = newMessages.map((m) => m.id);

        if (!awaitResponses) {
            void settleResponses();
            return { success: true, count: newMessages.length, status: "queued", messageIds };
        }

        await settleResponses();
        return { success: true, count: newMessages.length, status: "delivered", messageIds };
    }
};

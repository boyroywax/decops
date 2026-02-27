import { CommandDefinition } from "../types";
import { Message } from "../../../types";
import { callAgentAI } from "../../ai";

export const sendMessageCommand: CommandDefinition = {
    id: "send_message",
    description: "Sends a direct message from one agent (or the current user) to another agent",
    tags: ["messaging", "interaction"],
    rbac: ["orchestrator"],
    args: {
        from_agent_id: {
            name: "from_agent_id",
            type: "agent",
            description: "The sender — select an agent, or 'You' to send as the current user",
            required: true,
            includeUserOption: true,
        },
        to_agent_id: {
            name: "to_agent_id",
            type: "agent",
            description: "The recipient agent",
            required: true,
        },
        message: {
            name: "message",
            type: "string",
            description: "The content of the message",
            required: true,
        }
    },
    output: "JSON object with delivery status and response content.",
    outputSchema: {
        type: "object",
        properties: {
            status: { type: "string", enum: ["delivered", "failed", "no-prompt"] },
            messageId: { type: "string" },
            response: { type: "string" }
        }
    },
    execute: async (args, context) => {
        const { from_agent_id, to_agent_id, message } = args;
        const { agents, channels, setMessages, addLog } = context.workspace;

        // 1. Resolve sender — 'user' keyword maps to the current user's DID
        const isUserSender = from_agent_id === 'user';
        const userDid = context.auth?.user?.did;
        const fromAgent = isUserSender
            ? { id: userDid || 'user', name: context.auth?.user?.profile?.name || 'User', prompt: '' }
            : agents.find(a => a.id === from_agent_id);

        // 2. Resolve recipient by ID
        const toAgent = agents.find(a => a.id === to_agent_id);

        if (!fromAgent) throw new Error(`Sender agent '${from_agent_id}' not found`);
        if (!toAgent) throw new Error(`Recipient agent '${to_agent_id}' not found`);

        // 3. Find or validate channel (skip channel requirement when user is the sender)
        let channel = channels.find(c =>
            (c.from === fromAgent.id && c.to === toAgent.id) ||
            (c.from === toAgent.id && c.to === fromAgent.id)
        );

        const channelId = channel?.id || (isUserSender ? `user-dm-${toAgent.id}` : null);
        if (!channelId) {
            throw new Error(`No channel exists between ${fromAgent.id} and ${toAgent.id}`);
        }

        // 4. Create Message Object
        const msgId = crypto.randomUUID();
        const newMsg: Message = {
            id: msgId,
            channelId: channelId,
            fromId: fromAgent.id,
            toId: toAgent.id,
            content: message,
            response: null,
            status: "sending",
            ts: Date.now(),
        };

        // 5. Update State (Optimistic UI)
        setMessages(prev => [...prev, newMsg]);
        addLog(`${fromAgent.name} → ${toAgent.name}: message sent via command`);

        // 6. Trigger AI Response (if recipient has prompt)
        if (toAgent.prompt) {
            // We need 'messages' history for context, but reading fresh state inside async execute might be tricky 
            // if we rely on the closure 'context.workspace.messages'. 
            // It's a snapshot. Ideally we pass current messages or fetch them.
            // For now, let's just pass empty history or what we have in snapshot.
            try {
                const response = await callAgentAI(toAgent, fromAgent, message, channel?.type || 'data', []);

                // Update message with response
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, response, status: "delivered" } : m));
                addLog(`${toAgent.name} responded to command message`);

                // Write to shared storage for downstream steps
                context.storage.lastMessageId = msgId;
                context.storage.lastResponse = response;
                context.storage[`response_${toAgent.id}`] = response;

                return {
                    status: "delivered",
                    messageId: msgId,
                    response
                };
            } catch (err: any) {
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "failed", response: `Error: ${err.message}` } : m));
                throw err;
            }
        } else {
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "no-prompt", response: "[No Prompt]" } : m));
            return { status: "no-prompt", messageId: msgId };
        }
    },
};

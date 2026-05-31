import { CommandDefinition } from "@/services/commands/types";
import { Message } from "@/types";
import { callAgentAI } from "@/services/ai";

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
        },
        await_response: {
            name: "await_response",
            type: "boolean",
            description: "If true, waits for recipient AI response before completing the job (slower).",
            required: false,
            defaultValue: false,
        }
    },
    output: "JSON object with delivery status and response content.",
    outputSchema: {
        type: "object",
        properties: {
            status: { type: "string", enum: ["queued", "delivered", "failed", "no-prompt"] },
            messageId: { type: "string" },
            response: { type: "string" }
        }
    },
    execute: async (args, context) => {
        const { from_agent_id, to_agent_id, message } = args;
        const awaitResponse = Boolean(args.await_response);
        const { setMessages, addLog } = context.workspace;

        // Read LIVE workspace state via getters (falls back to snapshots
        // for legacy/test contexts that don't supply getters). The
        // snapshot arrays on context.workspace are frozen when the
        // CommandContext was built and go stale during async execution.
        const liveAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
        const liveChannels = context.workspace.getChannels?.() ?? context.workspace.channels;

        // Combine workspace state with entities created earlier in the same job
        // (some intra-job entities live only in shared storage until persisted)
        const allAgents = [...liveAgents, ...(context.storage._agents || [])];
        const allChannels = [...liveChannels, ...(context.storage._channels || [])];

        // 1. Resolve sender — 'user' keyword maps to the current user's DID
        const isUserSender = from_agent_id === 'user';
        const userDid = context.auth?.user?.did;
        const fromAgent = isUserSender
            ? { id: userDid || 'user', name: context.auth?.user?.profile?.name || 'User', prompt: '' }
            : allAgents.find(a => a.id === from_agent_id || a.name === from_agent_id);

        // 2. Resolve recipient by ID or name
        const toAgent = allAgents.find(a => a.id === to_agent_id || a.name === to_agent_id);

        if (!fromAgent) throw new Error(`Sender agent '${from_agent_id}' not found`);
        if (!toAgent) throw new Error(`Recipient agent '${to_agent_id}' not found`);

        // 3. Find or validate channel (skip channel requirement when user is the sender)
        let channel = allChannels.find(c =>
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
            // Read LIVE message history via getter so the recipient sees
            // any messages persisted earlier in the same job. Falls back to
            // the snapshot for legacy contexts.
            const history = context.workspace.getMessages?.() ?? context.workspace.messages;
            const finalizeResponse = async () => {
                const response = await callAgentAI(toAgent, fromAgent, message, channel?.type || 'data', history, undefined, context);

                // Update message with response
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, response, status: "delivered" } : m));
                addLog(`${toAgent.name} responded to command message`);

                // Write to shared storage for downstream steps
                context.storage.lastMessageId = msgId;
                context.storage.lastResponse = response;
                context.storage[`response_${toAgent.id}`] = response;

                return response;
            };

            if (!awaitResponse) {
                void finalizeResponse().catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "failed", response: `Error: ${msg}` } : m));
                });
                return {
                    status: "queued",
                    messageId: msgId,
                };
            }

            try {
                const response = await finalizeResponse();

                return {
                    status: "delivered",
                    messageId: msgId,
                    response
                };
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "failed", response: `Error: ${msg}` } : m));
                throw err;
            }
        } else {
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "no-prompt", response: "[No Prompt]" } : m));
            return { status: "no-prompt", messageId: msgId };
        }
    },
};

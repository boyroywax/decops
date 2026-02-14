import { CommandDefinition } from "../types";
import { Message } from "../../../types";
import { callAgentAI } from "../../ai";

export const sendMessageCommand: CommandDefinition = {
    id: "send_message",
    description: "Sends a direct message from one agent to another",
    tags: ["messaging", "interaction"],
    rbac: ["orchestrator", "user"],
    args: {
        from_agent_name: {
            name: "from_agent_name",
            type: "string",
            description: "Name of the sender agent",
            required: true,
        },
        to_agent_name: {
            name: "to_agent_name",
            type: "string",
            description: "Name of the recipient agent",
            required: true,
        },
        message: {
            name: "message",
            type: "string",
            description: "The content of the message",
            required: true,
        }
    },
    execute: async (args, context) => {
        const { from_agent_name, to_agent_name, message } = args;
        const { agents, channels, setMessages, addLog } = context.workspace;

        // 1. Resolve Agents
        const fromAgent = agents.find(a => a.name === from_agent_name);
        const toAgent = agents.find(a => a.name === to_agent_name);

        if (!fromAgent) throw new Error(`Sender agent '${from_agent_name}' not found`);
        if (!toAgent) throw new Error(`Recipient agent '${to_agent_name}' not found`);

        // 2. Find or Validate Channel (Optional: Auto-create channel if missing? For now, assume it must exist or we find it)
        let channel = channels.find(c =>
            (c.from === fromAgent.id && c.to === toAgent.id) ||
            (c.from === toAgent.id && c.to === fromAgent.id)
        );

        if (!channel) {
            // Optional: Create implicit temporary channel or throw error.
            // For this specific 'send_message' command, likely initiated by user or orchestrator, 
            // let's try to find it. If not found, we might need to create it (like in the UI logic).
            // However, to keep it pure, let's just create a channel ID for tracking if we define one?
            // Actually, the UI 'createChannel' logic checks for existence.
            // Let's THROW for now to be strict, or we can auto-create.
            // Given the "Decentralized" nature, you usually need a channel. 
            // But for "God mode" commands, maybe we auto-create?
            throw new Error(`No channel exists between ${from_agent_name} and ${to_agent_name}`);
        }

        // 3. Create Message Object
        const msgId = crypto.randomUUID();
        const newMsg: Message = {
            id: msgId,
            channelId: channel.id,
            fromId: fromAgent.id,
            toId: toAgent.id,
            content: message,
            response: null,
            status: "sending",
            ts: Date.now(),
        };

        // 4. Update State (Optimistic UI)
        setMessages(prev => [...prev, newMsg]);
        addLog(`${fromAgent.name} → ${toAgent.name}: message sent via command`);

        // 5. Trigger AI Response (if recipient has prompt)
        if (toAgent.prompt) {
            // We need 'messages' history for context, but reading fresh state inside async execute might be tricky 
            // if we rely on the closure 'context.workspace.messages'. 
            // It's a snapshot. Ideally we pass current messages or fetch them.
            // For now, let's just pass empty history or what we have in snapshot.
            try {
                const response = await callAgentAI(toAgent, fromAgent, message, channel.type, []);

                // Update message with response
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, response, status: "delivered" } : m));
                addLog(`${toAgent.name} responded to command message`);

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

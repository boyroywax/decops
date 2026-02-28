import { CommandDefinition } from "../types";
import { Channel } from "../../../types";

export const createChannelCommand: CommandDefinition = {
    id: "create_channel",
    description: "Creates a communication channel between two agents",
    tags: ["infrastructure", "channel"],
    rbac: ["orchestrator", "builder"],
    args: {
        from: {
            name: "from",
            type: "agent",
            description: "ID or Name of first agent",
            required: true,
        },
        to: {
            name: "to",
            type: "agent",
            description: "ID or Name of second agent",
            required: true,
        },
        type: {
            name: "type",
            type: "string",
            description: "Type of channel (data, control, financial)",
            required: false,
            defaultValue: "data",
        },
        networkId: {
            name: "networkId",
            type: "network",
            description: "ID of the network this channel belongs to",
            required: false,
        },
        items: {
            name: "items",
            type: "array",
            description: "Batch mode: array of {from, to, type?, networkId?} specs. Overrides individual args.",
            required: false,
        }
    },
    output: "JSON object containing the created channel details.",
    outputSchema: {
        type: "object",
        properties: {
            channel: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    from: { type: "string" },
                    to: { type: "string" },
                    type: { type: "string" }
                }
            }
        }
    },
    execute: async (args, context) => {
        const { agents, channels, setChannels, addLog } = context.workspace;

        // Combine workspace agents with any created in previous job steps
        // (React state may be stale within the same job execution cycle)
        const allAgents = [...agents, ...(context.storage._agents || [])];

        // Normalize: batch items or single spec
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ from: args.from, to: args.to, type: args.type, networkId: args.networkId }];

        const created: Channel[] = [];
        const skipped: string[] = [];
        const allChannels = [...channels, ...(context.storage._channels || [])];

        for (const spec of specs) {
            const fromAgent = allAgents.find((a: any) => a.id === spec.from || a.name === spec.from);
            const toAgent = allAgents.find((a: any) => a.id === spec.to || a.name === spec.to);

            if (!fromAgent) throw new Error(`Agent '${spec.from}' not found`);
            if (!toAgent) throw new Error(`Agent '${spec.to}' not found`);
            if (fromAgent.id === toAgent.id) throw new Error("Cannot create channel to self");

            // Check existence against both existing and newly-created channels
            const exists = allChannels.concat(created).some((c: any) =>
                (c.from === fromAgent.id && c.to === toAgent.id) ||
                (c.from === toAgent.id && c.to === fromAgent.id)
            );

            if (exists) {
                skipped.push(`${fromAgent.name} ⟷ ${toAgent.name}`);
                continue;
            }

            const newChannel: Channel = {
                id: crypto.randomUUID(),
                from: fromAgent.id,
                to: toAgent.id,
                type: spec.type || "data",
                offset: Math.random() * 100,
                createdAt: new Date().toISOString(),
                networkId: spec.networkId || context.ecosystem?.activeNetworkId || fromAgent.networkId || undefined,
            };

            created.push(newChannel);

            // Write to shared storage for downstream steps
            context.storage.lastChannelId = newChannel.id;
            context.storage[`channel_${fromAgent.name}_${toAgent.name}`] = newChannel.id;
        }

        if (created.length > 0) {
            setChannels((prev: any[]) => [...prev, ...created]);
            addLog(`Created ${created.length} channel(s)${skipped.length ? `, ${skipped.length} already existed` : ""}`);
        } else {
            addLog(`All ${skipped.length} channel(s) already exist`);
        }

        // Accumulate in storage so downstream steps can find channels
        context.storage._channels = [...(context.storage._channels || []), ...created];

        // Single mode: backwards-compatible return shape
        if (!args.items) {
            if (created.length === 0) return { status: "exists", message: "Channel already exists" };
            return { status: "created", channelId: created[0].id };
        }
        // Batch mode
        return {
            results: created.map(c => ({ channelId: c.id, from: c.from, to: c.to })),
            skipped,
        };
    },
};

import { CommandDefinition } from "@/services/commands/types";
import { Group, Channel } from "@/types";
import { generateGroupDID } from "@/utils/identity";
import { GROUP_COLORS } from "@/constants";
import { isUnresolvedRef } from "@/utils/storageKey";

export const createGroupCommand: CommandDefinition = {
    id: "create_group",
    description: "Creates a new agent group",
    tags: ["infrastructure", "group"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: {
            name: "name",
            type: "string",
            description: "Name of the group",
            required: true,
        },
        members: {
            name: "members",
            type: "array", // Need to handle array types in validation if not already
            description: "List of agent IDs or Names to include",
            required: true,
        },
        governance: {
            name: "governance",
            type: "string",
            description: "Governance model",
            required: true,
        },
        networkId: {
            name: "networkId",
            type: "network",
            description: "ID of the network this group belongs to",
            required: false,
        },
        items: {
            name: "items",
            type: "array",
            description: "Batch mode: array of {name, members, governance, networkId?} specs. Overrides individual args.",
            required: false,
        }
    },
    output: "JSON object containing the created group details.",
    outputSchema: {
        type: "object",
        properties: {
            group: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    members: { type: "array", items: { type: "string" } }
                }
            }
        }
    },
    execute: async (args, context) => {
        const { agents, groups, setGroups, setChannels, addLog } = context.workspace;

        // Combine workspace agents with any created in previous job steps
        const allAgents = [...agents, ...(context.storage._agents || [])];

        // Normalize: batch items or single spec
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ name: args.name, members: args.members, governance: args.governance, networkId: args.networkId }];

        const createdGroups: Group[] = [];
        const allNewChannels: Channel[] = [];

        for (const spec of specs) {
            const { name, members, governance } = spec;

            // Validate members
            const memberIds: string[] = [];
            for (const input of members) {
                const agent = allAgents.find((a: any) => a.id === input || a.name === input);
                if (!agent) throw new Error(`Agent '${input}' not found`);
                memberIds.push(agent.id);
            }

            const uniqueMembers = [...new Set(memberIds)];
            if (uniqueMembers.length < 2) throw new Error("Group must have at least 2 members");

            const specNetworkId = isUnresolvedRef(spec.networkId) ? undefined : spec.networkId;
            const newGroup: Group = {
                id: crypto.randomUUID(),
                name,
                governance: governance || "majority",
                members: uniqueMembers,
                threshold: Math.ceil(uniqueMembers.length / 2),
                did: generateGroupDID(),
                color: GROUP_COLORS[(groups.length + createdGroups.length) % GROUP_COLORS.length],
                createdAt: new Date().toISOString(),
                networkId: specNetworkId || context.ecosystem?.activeNetworkId || (context.ecosystem?.networks?.length === 1 ? context.ecosystem.networks[0].id : undefined),
            };

            createdGroups.push(newGroup);

            // Auto-create consensus channels between members
            const currentChannels = [...context.workspace.channels, ...(context.storage._channels || [])];
            for (let i = 0; i < uniqueMembers.length; i++) {
                for (let j = i + 1; j < uniqueMembers.length; j++) {
                    const hasChannel = currentChannels.concat(allNewChannels).some((c: any) =>
                        (c.from === uniqueMembers[i] && c.to === uniqueMembers[j]) ||
                        (c.from === uniqueMembers[j] && c.to === uniqueMembers[i])
                    );

                    if (!hasChannel) {
                        allNewChannels.push({
                            id: crypto.randomUUID(),
                            from: uniqueMembers[i],
                            to: uniqueMembers[j],
                            type: "consensus",
                            offset: Math.random() * 100,
                            createdAt: new Date().toISOString(),
                            networkId: context.ecosystem?.activeNetworkId || (context.ecosystem?.networks?.length === 1 ? context.ecosystem.networks[0].id : undefined),
                        });
                    }
                }
            }

            // Write to shared storage
            context.storage.lastGroupId = newGroup.id;
            context.storage.lastGroupName = newGroup.name;
            context.storage[`group_${name}`] = newGroup.id;
        }

        setGroups((prev: any[]) => [...prev, ...createdGroups]);
        addLog(`Created ${createdGroups.length} group(s): ${createdGroups.map(g => g.name).join(", ")}`);

        if (allNewChannels.length > 0) {
            setChannels((prev: any[]) => [...prev, ...allNewChannels]);
            addLog(`Created ${allNewChannels.length} consensus channels for groups`);
        }

        // Single mode: backwards-compatible return shape
        if (!args.items) {
            return { status: "created", groupId: createdGroups[0].id, channelCount: allNewChannels.length };
        }
        // Batch mode
        return {
            results: createdGroups.map(g => ({ groupId: g.id, name: g.name })),
            channelCount: allNewChannels.length,
        };
    },
};

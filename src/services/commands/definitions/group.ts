import { CommandDefinition } from "../types";
import { Group, Channel } from "../../../types";
import { generateGroupDID } from "../../../utils/identity";
import { GROUP_COLORS } from "../../../constants";

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
            type: "string",
            description: "ID of the network this group belongs to",
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
        const { name, members, governance } = args;
        const { agents, groups, setGroups, setChannels, addLog } = context.workspace;

        // Validate members
        const memberIds: string[] = [];
        for (const input of members) {
            const agent = agents.find((a: any) => a.id === input || a.name === input);
            if (!agent) throw new Error(`Agent '${input}' not found`);
            memberIds.push(agent.id);
        }

        // Deduplicate
        const uniqueMembers = [...new Set(memberIds)];

        if (uniqueMembers.length < 2) throw new Error("Group must have at least 2 members");

        // Create Group
        const newGroup: Group = {
            id: crypto.randomUUID(),
            name,
            governance: governance || "majority",
            members: uniqueMembers,
            threshold: Math.ceil(uniqueMembers.length / 2),
            did: generateGroupDID(),
            color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
            createdAt: new Date().toISOString(),
            networkId: args.networkId || context.ecosystem?.activeNetworkId || undefined,
        };

        setGroups((prev: any[]) => [...prev, newGroup]);
        addLog(`Group "${name}" created via command`);

        // Auto-create consensus channels (similar to useWorkspace logic)
        const newCh: Channel[] = [];
        const currentChannels = context.workspace.channels;

        for (let i = 0; i < uniqueMembers.length; i++) {
            for (let j = i + 1; j < uniqueMembers.length; j++) {
                const hasChannel = currentChannels.concat(newCh).some((c: any) =>
                    (c.from === uniqueMembers[i] && c.to === uniqueMembers[j]) ||
                    (c.from === uniqueMembers[j] && c.to === uniqueMembers[i])
                );

                if (!hasChannel) {
                    newCh.push({
                        id: crypto.randomUUID(),
                        from: uniqueMembers[i],
                        to: uniqueMembers[j],
                        type: "consensus",
                        offset: Math.random() * 100,
                        createdAt: new Date().toISOString(),
                        networkId: context.ecosystem?.activeNetworkId || undefined,
                    });
                }
            }
        }

        if (newCh.length > 0) {
            setChannels((prev: any[]) => [...prev, ...newCh]);
            addLog(`Created ${newCh.length} consensus channels for group`);
        }

        return { status: "created", groupId: newGroup.id, channelCount: newCh.length };
    },
};

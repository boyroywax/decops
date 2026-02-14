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
            description: "List of agent names to include",
            required: true,
        },
        governance: {
            name: "governance",
            type: "string",
            description: "Governance model",
            defaultValue: "majority",
        }
    },
    execute: async (args, context) => {
        const { name, members, governance } = args;
        const { agents, groups, setGroups, setChannels, addLog } = context.workspace;

        // Validate members
        const memberIds: string[] = [];
        for (const memberName of members) {
            const agent = agents.find(a => a.name === memberName);
            if (!agent) throw new Error(`Agent '${memberName}' not found`);
            memberIds.push(agent.id);
        }

        if (memberIds.length < 2) throw new Error("Group must have at least 2 members");

        // Create Group
        const newGroup: Group = {
            id: crypto.randomUUID(),
            name,
            governance: governance || "majority",
            members: memberIds,
            threshold: Math.ceil(memberIds.length / 2),
            did: generateGroupDID(),
            color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
            createdAt: new Date().toISOString(),
        };

        setGroups(prev => [...prev, newGroup]);
        addLog(`Group "${name}" created via command`);

        // Auto-create consensus channels (similar to useWorkspace logic)
        const newCh: Channel[] = [];
        // We need current channels to check existence. `context.workspace.channels` is a snapshot.
        // It is safe to use within this tick, but if multiple commands run in parallel, might be issue.
        // Javascript is single threaded so should be fine inside this sync block before await.
        const currentChannels = context.workspace.channels;

        for (let i = 0; i < memberIds.length; i++) {
            for (let j = i + 1; j < memberIds.length; j++) {
                const hasChannel = currentChannels.concat(newCh).some(c =>
                    (c.from === memberIds[i] && c.to === memberIds[j]) ||
                    (c.from === memberIds[j] && c.to === memberIds[i])
                );

                if (!hasChannel) {
                    newCh.push({
                        id: crypto.randomUUID(),
                        from: memberIds[i],
                        to: memberIds[j],
                        type: "consensus",
                        offset: Math.random() * 100,
                        createdAt: new Date().toISOString()
                    });
                }
            }
        }

        if (newCh.length > 0) {
            setChannels(prev => [...prev, ...newCh]);
            addLog(`Created ${newCh.length} consensus channels for group`);
        }

        return { status: "created", groupId: newGroup.id, channelCount: newCh.length };
    },
};

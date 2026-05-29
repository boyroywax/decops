import { CommandDefinition } from "@/services/commands/types";
import { Agent, Group, Channel } from "@/types";
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
            description: "ID of the network this group belongs to (primary/host network for huddles)",
            required: false,
        },
        kind: {
            name: "kind",
            type: "string",
            description: "Group kind: 'native' (default, single-network) or 'huddle' (ad-hoc, cross-network assembly).",
            required: false,
        },
        networkIds: {
            name: "networkIds",
            type: "array",
            description: "For kind='huddle': list of contributing network IDs. Inferred from member networks when omitted.",
            required: false,
        },
        summonedBy: {
            name: "summonedBy",
            type: "string",
            description: "For huddles: who summoned the assembly (e.g. 'navigator', an agent DID, or 'user').",
            required: false,
        },
        topic: {
            name: "topic",
            type: "string",
            description: "For huddles: the goal / topic the assembly is forming around.",
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
        const storage = context.storage as { _agents?: Agent[]; _channels?: Channel[] } & Record<string, unknown>;
        const allAgents: Agent[] = [...agents, ...(storage._agents || [])];

        // Normalize: batch items or single spec
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{
                name: args.name,
                members: args.members,
                governance: args.governance,
                networkId: args.networkId,
                kind: args.kind,
                networkIds: args.networkIds,
                summonedBy: args.summonedBy,
                topic: args.topic,
            }];

        const createdGroups: Group[] = [];
        const allNewChannels: Channel[] = [];

        for (const spec of specs) {
            const { name, members, governance } = spec;

            // Validate members
            const memberIds: string[] = [];
            for (const input of members) {
                const agent = allAgents.find((a) => a.id === input || a.name === input);
                if (!agent) throw new Error(`Agent '${input}' not found`);
                memberIds.push(agent.id);
            }

            const uniqueMembers = [...new Set(memberIds)];
            if (uniqueMembers.length < 2) throw new Error("Group must have at least 2 members");

            const specNetworkId = isUnresolvedRef(spec.networkId) ? undefined : spec.networkId;
            const kind: "native" | "huddle" = spec.kind === "huddle" ? "huddle" : "native";

            // For huddles, infer the contributing network set from members
            // when the caller didn't specify it explicitly.
            let networkIds: string[] | undefined;
            if (kind === "huddle") {
                if (Array.isArray(spec.networkIds) && spec.networkIds.length > 0) {
                    networkIds = [...new Set((spec.networkIds as unknown[]).filter((n: unknown): n is string => typeof n === "string" && !!n))];
                } else {
                    const inferred = uniqueMembers
                        .map((mid) => allAgents.find((a) => a.id === mid)?.networkId)
                        .filter((n): n is string => typeof n === "string" && !!n);
                    networkIds = [...new Set(inferred)];
                }
            }

            const resolvedNetworkId = specNetworkId
                || (kind === "huddle" ? networkIds?.[0] : undefined)
                || context.ecosystem?.activeNetworkId
                || (context.ecosystem?.networks?.length === 1 ? context.ecosystem.networks[0].id : undefined);

            const newGroup: Group = {
                id: crypto.randomUUID(),
                name,
                governance: governance || "majority",
                members: uniqueMembers,
                threshold: Math.ceil(uniqueMembers.length / 2),
                did: generateGroupDID(),
                color: GROUP_COLORS[(groups.length + createdGroups.length) % GROUP_COLORS.length],
                createdAt: new Date().toISOString(),
                networkId: resolvedNetworkId,
                kind,
                ...(kind === "huddle"
                    ? {
                        networkIds: networkIds && networkIds.length > 0 ? networkIds : undefined,
                        summonedBy: typeof spec.summonedBy === "string" ? spec.summonedBy : "navigator",
                        topic: typeof spec.topic === "string" ? spec.topic : undefined,
                    }
                    : {}),
            };

            createdGroups.push(newGroup);

            // Auto-create consensus channels between members
            const liveChannels = context.workspace.getChannels?.() ?? context.workspace.channels;
            const currentChannels: Channel[] = [...liveChannels, ...(storage._channels || [])];
            for (let i = 0; i < uniqueMembers.length; i++) {
                for (let j = i + 1; j < uniqueMembers.length; j++) {
                    const hasChannel = currentChannels.concat(allNewChannels).some((c) =>
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

        setGroups((prev: Group[]) => [...prev, ...createdGroups]);
        addLog(`Created ${createdGroups.length} group(s): ${createdGroups.map(g => g.name).join(", ")}`);

        if (allNewChannels.length > 0) {
            setChannels((prev: Channel[]) => [...prev, ...allNewChannels]);
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

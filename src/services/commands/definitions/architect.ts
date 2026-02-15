
import type { CommandDefinition, CommandContext } from "../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS } from "../../../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../../../utils/identity";
import { callAgentAI } from "../../ai";

export const promptArchitectCommand: CommandDefinition = {
    id: "prompt_architect",
    description: "Generate a new network design using the AI Architect.",
    tags: ["architect", "create", "ai"],
    rbac: ["builder", "orchestrator"],
    args: {
        prompt: {
            name: "prompt",
            type: "string",
            description: "Description of the network to build",
            required: true
        }
    },
    output: "Confirmation that generation has started.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } },
    execute: async (args, context: CommandContext) => {
        context.workspace.addLog(`Architect triggered with prompt: ${args.prompt}`);
        await context.architect.generateNetwork(args.prompt);
        return { success: true, message: "Architect generation started." };
    }
};

export const deployNetworkCommand: CommandDefinition = {
    id: "deploy_network",
    description: "Deploy a generated network configuration (agents, channels, groups).",
    tags: ["architect", "deploy", "provision"],
    rbac: ["builder", "orchestrator"],
    args: {
        config: {
            name: "config",
            type: "object",
            description: "The MeshConfig object used to deploy the network",
            required: true
        }
    },
    output: "Summary of deployed resources.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, summary: { type: "string" } } },
    execute: async (args, context: CommandContext) => {
        const config = args.config;
        const total = config.agents.length + config.channels.length + (config.groups?.length || 0) + (config.exampleMessages?.length || 0);
        let count = 0;
        const { addLog, setAgents, setChannels, setGroups, setMessages, setActiveChannels } = context.workspace;

        // 1. Create agents
        const newAgents: any[] = [];
        for (const a of config.agents) {
            if (!a || !a.name) continue;
            const validRole = ROLES.find((r: any) => r.id === a.role) ? a.role : "researcher";
            const agent = {
                id: crypto.randomUUID(), name: a.name, role: validRole,
                prompt: a.prompt || "", did: generateDID(), keys: generateKeyPair(),
                createdAt: new Date().toISOString(), status: "active",
            };
            newAgents.push(agent);
            count++;
            addLog(`Deployed agent "${a.name}" -> ${agent.did.slice(0, 20)}…`);
            await new Promise(r => setTimeout(r, 50)); // Reduced delay for job
        }
        setAgents((prev: any[]) => [...prev, ...newAgents]);

        // 2. Create channels
        const newChannels: any[] = [];
        for (const c of config.channels) {
            if (c.from == null || c.to == null) continue;
            const fromAgent = newAgents[c.from];
            const toAgent = newAgents[c.to];
            if (!fromAgent || !toAgent) continue;
            const validType = CHANNEL_TYPES.find((t: any) => t.id === c.type) ? c.type : "data";
            const ch = {
                id: crypto.randomUUID(), from: fromAgent.id, to: toAgent.id,
                type: validType, offset: Math.random() * 120, createdAt: new Date().toISOString(),
            };
            newChannels.push(ch);
            count++;
            addLog(`Channel: ${fromAgent.name} <-> ${toAgent.name} [${validType}]`);
        }
        setChannels((prev: any[]) => [...prev, ...newChannels]);

        // 3. Create groups
        const newGroups: any[] = [];
        if (config.groups) {
            for (const g of config.groups) {
                if (!g || !g.name) continue;
                const memberIds = (g.members || []).map((idx: number) => newAgents[idx]?.id).filter(Boolean);
                if (memberIds.length < 2) continue;
                const validGov = GOVERNANCE_MODELS.find((m: any) => m.id === g.governance) ? g.governance : "majority";
                const group = {
                    id: crypto.randomUUID(), name: g.name, governance: validGov,
                    members: memberIds, threshold: g.threshold || 2,
                    did: generateGroupDID(), color: GROUP_COLORS[newGroups.length % GROUP_COLORS.length],
                    createdAt: new Date().toISOString(),
                };
                newGroups.push(group);
                count++;
                addLog(`Group "${g.name}" formed -> ${group.did.slice(0, 22)}…`);

                // Auto-create consensus channels within group
                for (let i = 0; i < memberIds.length; i++) {
                    for (let j = i + 1; j < memberIds.length; j++) {
                        const exists = newChannels.some(c =>
                            (c.from === memberIds[i] && c.to === memberIds[j]) ||
                            (c.from === memberIds[j] && c.to === memberIds[i])
                        );
                        if (!exists) {
                            const ch = {
                                id: crypto.randomUUID(), from: memberIds[i], to: memberIds[j],
                                type: "consensus", offset: Math.random() * 120, createdAt: new Date().toISOString(),
                            };
                            newChannels.push(ch);
                            setChannels((prev: any[]) => [...prev, ch]);
                        }
                    }
                }
            }
        }
        setGroups((prev: any[]) => [...prev, ...newGroups]);

        // 4. Send example messages
        if (config.exampleMessages && config.exampleMessages.length > 0) {
            for (const em of config.exampleMessages) {
                if (em.channelIdx == null || !em.message) continue;
                const ch = newChannels[em.channelIdx];
                if (!ch) continue;
                const fromAgent = newAgents.find((a: any) => a.id === ch.from);
                const toAgent = newAgents.find((a: any) => a.id === ch.to);
                if (!fromAgent || !toAgent) continue;

                count++;
                addLog(`Example msg: ${fromAgent.name} -> ${toAgent.name}`);

                const msgId = crypto.randomUUID();
                const msg = {
                    id: msgId, channelId: ch.id, fromId: ch.from, toId: ch.to,
                    content: em.message, response: null, status: "sending", ts: Date.now(),
                };
                setMessages((prev: any[]) => [...prev, msg]);
                if (setActiveChannels) {
                    setActiveChannels((prev: Set<string>) => new Set([...prev, ch.id]));
                }

                if (toAgent.prompt) {
                    const response = await callAgentAI(toAgent, fromAgent, em.message, ch.type, []);
                    setMessages((prev: any[]) => prev.map((m: any) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
                    addLog(`${toAgent.name} responded (${response.length} chars)`);
                } else {
                    setMessages((prev: any[]) => prev.map((m: any) => m.id === msgId ? { ...m, response: "[No prompt]", status: "no-prompt" } : m));
                }

                // Cleanup active channel highlight after delay (handled by UI or global timer? Job is transient)
                // In job, we generally don't wait for UI effects like "highlight for 3s".
                // We just set status.
                // But setActiveChannels is state.
                if (setActiveChannels) {
                    setTimeout(() => setActiveChannels((prev: Set<string>) => { const n = new Set(prev); n.delete(ch.id); return n; }), 3000);
                }
            }
        }

        return { success: true, summary: `Deployed ${newAgents.length} agents, ${newChannels.length} channels, ${newGroups.length} groups.` };
    }
};

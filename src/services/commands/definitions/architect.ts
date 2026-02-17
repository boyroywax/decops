
import type { CommandDefinition, CommandContext } from "../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS, NETWORK_COLORS } from "../../../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../../../utils/identity";
import { callAgentAI, generateMeshConfig } from "../../ai";

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
    output: "The generated MeshConfig object.",
    outputSchema: { type: "object", properties: { agents: { type: "array" }, channels: { type: "array" } } },
    execute: async (args, context: CommandContext) => {
        context.workspace.addLog(`Architect triggered with prompt: ${args.prompt}`);
        const config = await generateMeshConfig(args.prompt);
        return config;
    }
};

export const deployNetworkCommand: CommandDefinition = {
    id: "deploy_network",
    description: "Deploy a generated network configuration (networks, agents, channels, groups, bridges).",
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
        const { addLog, setAgents, setChannels, setGroups, setMessages, setActiveChannels } = context.workspace;
        const { setEcosystems, setBridges } = context.ecosystem;

        // Track created resources for summary
        let networkCount = 0;
        let agentCount = 0;
        let channelCount = 0;
        let groupCount = 0;
        let bridgeCount = 0;

        // Map from config indices to created IDs
        const networkIdMap: string[] = []; // networkIdMap[configIdx] = realId
        const agentIdMap: string[] = []; // agentIdMap[configIdx] = realId

        // 0. Create networks first
        const newNetworks: any[] = [];
        const configNetworks = config.networks || [];
        
        // If no networks in config, create a default one
        if (configNetworks.length === 0) {
            configNetworks.push({
                name: "Default Network",
                description: "Auto-generated network",
                agents: config.agents.map((_: any, i: number) => i)
            });
        }

        for (let i = 0; i < configNetworks.length; i++) {
            const n = configNetworks[i];
            if (!n || !n.name) continue;
            const network = {
                id: crypto.randomUUID(),
                name: n.name,
                did: generateDID(),
                color: NETWORK_COLORS[i % NETWORK_COLORS.length],
                agents: [], // Live data model - agents referenced by networkId
                channels: [],
                groups: [],
                messages: [],
                createdAt: new Date().toISOString(),
                description: n.description || "",
            };
            newNetworks.push(network);
            networkIdMap[i] = network.id;
            networkCount++;
            addLog(`Created network "${n.name}" -> ${network.did.slice(0, 20)}…`);
        }
        setEcosystems((prev: any[]) => [...prev, ...newNetworks]);

        // Build agent-to-network mapping from config
        const agentToNetworkIdx: (number | undefined)[] = [];
        for (let netIdx = 0; netIdx < configNetworks.length; netIdx++) {
            const net = configNetworks[netIdx];
            if (net.agents) {
                for (const agentIdx of net.agents) {
                    agentToNetworkIdx[agentIdx] = netIdx;
                }
            }
        }

        // 1. Create agents (with networkId)
        const newAgents: any[] = [];
        for (let i = 0; i < config.agents.length; i++) {
            const a = config.agents[i];
            if (!a || !a.name) continue;
            const validRole = ROLES.find((r: any) => r.id === a.role) ? a.role : "researcher";
            const networkIdx = a.network ?? agentToNetworkIdx[i] ?? 0;
            const networkId = networkIdMap[networkIdx] || networkIdMap[0];
            
            const agent = {
                id: crypto.randomUUID(),
                name: a.name,
                role: validRole,
                prompt: a.prompt || "",
                did: generateDID(),
                keys: generateKeyPair(),
                createdAt: new Date().toISOString(),
                status: "active",
                networkId,
            };
            newAgents.push(agent);
            agentIdMap[i] = agent.id;
            agentCount++;
            addLog(`Deployed agent "${a.name}" -> ${agent.did.slice(0, 20)}… [${configNetworks[networkIdx]?.name || 'Default'}]`);
            await new Promise(r => setTimeout(r, 50));
        }
        setAgents((prev: any[]) => [...prev, ...newAgents]);

        // 2. Create channels (with networkId from 'from' agent)
        const newChannels: any[] = [];
        for (const c of config.channels) {
            if (c.from == null || c.to == null) continue;
            const fromAgent = newAgents[c.from];
            const toAgent = newAgents[c.to];
            if (!fromAgent || !toAgent) continue;
            const validType = CHANNEL_TYPES.find((t: any) => t.id === c.type) ? c.type : "data";
            
            // Use the from agent's networkId (or shared if both in same network)
            const networkId = fromAgent.networkId;
            
            const ch = {
                id: crypto.randomUUID(),
                from: fromAgent.id,
                to: toAgent.id,
                type: validType,
                offset: Math.random() * 120,
                createdAt: new Date().toISOString(),
                networkId,
            };
            newChannels.push(ch);
            channelCount++;
            addLog(`Channel: ${fromAgent.name} <-> ${toAgent.name} [${validType}]`);
        }
        setChannels((prev: any[]) => [...prev, ...newChannels]);

        // 3. Create groups (with networkId from first member)
        const newGroups: any[] = [];
        if (config.groups) {
            for (const g of config.groups) {
                if (!g || !g.name) continue;
                const memberIds = (g.members || []).map((idx: number) => agentIdMap[idx]).filter(Boolean);
                if (memberIds.length < 2) continue;
                const validGov = GOVERNANCE_MODELS.find((m: any) => m.id === g.governance) ? g.governance : "majority";
                
                // Use first member's networkId
                const firstMember = newAgents.find((a: any) => a.id === memberIds[0]);
                const networkId = firstMember?.networkId;
                
                const group = {
                    id: crypto.randomUUID(),
                    name: g.name,
                    governance: validGov,
                    members: memberIds,
                    threshold: g.threshold || 2,
                    did: generateGroupDID(),
                    color: GROUP_COLORS[newGroups.length % GROUP_COLORS.length],
                    createdAt: new Date().toISOString(),
                    networkId,
                };
                newGroups.push(group);
                groupCount++;
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
                                id: crypto.randomUUID(),
                                from: memberIds[i],
                                to: memberIds[j],
                                type: "consensus",
                                offset: Math.random() * 120,
                                createdAt: new Date().toISOString(),
                                networkId,
                            };
                            newChannels.push(ch);
                            setChannels((prev: any[]) => [...prev, ch]);
                        }
                    }
                }
            }
        }
        setGroups((prev: any[]) => [...prev, ...newGroups]);

        // 4. Create bridges between networks
        const newBridges: any[] = [];
        if (config.bridges && config.bridges.length > 0) {
            for (const b of config.bridges) {
                if (b.fromNetwork == null || b.toNetwork == null || 
                    b.fromAgent == null || b.toAgent == null) continue;
                
                const fromNetworkId = networkIdMap[b.fromNetwork];
                const toNetworkId = networkIdMap[b.toNetwork];
                const fromAgentId = agentIdMap[b.fromAgent];
                const toAgentId = agentIdMap[b.toAgent];
                
                if (!fromNetworkId || !toNetworkId || !fromAgentId || !toAgentId) continue;
                if (fromNetworkId === toNetworkId) continue; // Bridges connect different networks
                
                const validType = CHANNEL_TYPES.find((t: any) => t.id === b.type) ? b.type : "data";
                
                const bridge = {
                    id: crypto.randomUUID(),
                    fromNetworkId,
                    toNetworkId,
                    fromAgentId,
                    toAgentId,
                    type: validType,
                    offset: Math.random() * 100,
                    createdAt: new Date().toISOString(),
                };
                newBridges.push(bridge);
                bridgeCount++;
                
                const fromAgent = newAgents.find((a: any) => a.id === fromAgentId);
                const toAgent = newAgents.find((a: any) => a.id === toAgentId);
                const fromNet = configNetworks[b.fromNetwork];
                const toNet = configNetworks[b.toNetwork];
                addLog(`Bridge: ${fromAgent?.name} (${fromNet?.name}) <-> ${toAgent?.name} (${toNet?.name})`);
            }
            setBridges((prev: any[]) => [...prev, ...newBridges]);
        }

        // 5. Send example messages
        if (config.exampleMessages && config.exampleMessages.length > 0) {
            for (const em of config.exampleMessages) {
                if (em.channelIdx == null || !em.message) continue;
                const ch = newChannels[em.channelIdx];
                if (!ch) continue;
                const fromAgent = newAgents.find((a: any) => a.id === ch.from);
                const toAgent = newAgents.find((a: any) => a.id === ch.to);
                if (!fromAgent || !toAgent) continue;

                addLog(`Example msg: ${fromAgent.name} -> ${toAgent.name}`);

                const msgId = crypto.randomUUID();
                const msg = {
                    id: msgId,
                    channelId: ch.id,
                    fromId: ch.from,
                    toId: ch.to,
                    content: em.message,
                    response: null,
                    status: "sending",
                    ts: Date.now(),
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

                if (setActiveChannels) {
                    setTimeout(() => setActiveChannels((prev: Set<string>) => { const n = new Set(prev); n.delete(ch.id); return n; }), 3000);
                }
            }
        }

        const summary = [
            `${networkCount} network${networkCount !== 1 ? 's' : ''}`,
            `${agentCount} agent${agentCount !== 1 ? 's' : ''}`,
            `${channelCount} channel${channelCount !== 1 ? 's' : ''}`,
            `${groupCount} group${groupCount !== 1 ? 's' : ''}`,
            bridgeCount > 0 ? `${bridgeCount} bridge${bridgeCount !== 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(', ');

        return { success: true, summary: `Deployed ${summary}.` };
    }
};

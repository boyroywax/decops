
import type { CommandDefinition, CommandContext } from "../types";
import { generateMeshConfig } from "../../ai";

export const promptArchitectCommand: CommandDefinition = {
    id: "prompt_architect",
    description: "Generate a new network design using the AI Architect.",
    tags: ["architect", "create", "ai"],
    rbac: ["builder", "orchestrator"],
    recommendedModel: "claude-sonnet-4-20250514",
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

        // Write config to shared storage so deploy_network can read it
        context.storage.lastConfig = config;
        context.storage.lastArchitectPrompt = args.prompt;

        // Produce deliverable
        context.addDeliverable({
            key: 'mesh-config',
            name: 'Architect Config',
            type: 'json',
            content: JSON.stringify(config, null, 2),
            tags: ['architect', 'config'],
        });

        return config;
    }
};

export const deployNetworkCommand: CommandDefinition = {
    id: "deploy_network",
    description: "Generate and deploy a full agent mesh network. Provide a natural-language prompt to auto-generate the config, or supply a pre-built MeshConfig directly.",
    tags: ["architect", "deploy", "provision", "job"],
    rbac: ["builder", "orchestrator"],
    args: {
        prompt: {
            name: "prompt",
            type: "string",
            description: "Natural-language description of the network to build (used to generate config when no config is provided)",
            required: false,
        },
        config: {
            name: "config",
            type: "object",
            description: "Pre-built MeshConfig object — overrides prompt-based generation",
            required: false
        }
    },
    output: "Summary of the generated deployment job with step list.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, jobId: { type: "string" }, stepCount: { type: "number" }, steps: { type: "array" } } },
    execute: async (args, context: CommandContext) => {
        const { addLog } = context.workspace;

        // ── Resolve config: args.config → storage → generate from prompt ──
        let config = args.config || context.storage.lastConfig;

        if (!config) {
            const prompt = args.prompt || context.storage.lastArchitectPrompt;
            if (!prompt) {
                throw new Error(
                    "No config or prompt provided. Either:\n" +
                    "  • Set the 'prompt' arg to describe the network you want\n" +
                    "  • Pass a MeshConfig via the 'config' arg\n" +
                    "  • Run prompt_architect first to store a config"
                );
            }
            addLog(`Architect generating config from prompt: "${String(prompt).slice(0, 60)}…"`);
            config = await generateMeshConfig(prompt);

            // Store generated config for downstream steps / re-runs
            context.storage.lastConfig = config;
            context.storage.lastArchitectPrompt = prompt;

            // Produce config deliverable
            context.addDeliverable({
                key: 'mesh-config',
                name: 'Architect Config',
                type: 'json',
                content: JSON.stringify(config, null, 2),
                tags: ['architect', 'config'],
            });
        }

        addLog("Generating deployment plan from config...");

        // Normalize networks — ensure at least a default
        const configNetworks = config.networks && config.networks.length > 0
            ? [...config.networks]
            : [{ name: "Default Network", description: "Auto-generated network", agents: config.agents.map((_: any, i: number) => i) }];

        // Build agent-to-network index mapping
        const agentToNetworkIdx: (number | undefined)[] = [];
        for (let netIdx = 0; netIdx < configNetworks.length; netIdx++) {
            const net = configNetworks[netIdx];
            if (net.agents) {
                for (const agentIdx of net.agents) {
                    agentToNetworkIdx[agentIdx] = netIdx;
                }
            }
        }

        // --- Generate steps ---
        const steps: any[] = [];
        let stepIdx = 0;

        // 1. Create networks — output network ID to storage for downstream steps
        for (const net of configNetworks) {
            if (!net?.name) continue;
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "create_network",
                name: `Create Network: ${net.name}`,
                args: { name: net.name, description: net.description || "" },
                outputMappings: [
                    { outputKey: "network", target: "storage", targetKey: `network_${net.name}` },
                ],
            });
        }

        // 2. Create agents — bind networkId from storage, output agent ID to storage
        for (let i = 0; i < config.agents.length; i++) {
            const a = config.agents[i];
            if (!a?.name) continue;
            const networkIdx = a.network ?? agentToNetworkIdx[i] ?? 0;
            const networkName = configNetworks[networkIdx]?.name || configNetworks[0]?.name;
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "create_agent",
                name: `Create Agent: ${a.name}`,
                args: {
                    name: a.name,
                    role: a.role || "researcher",
                    prompt: a.prompt || "",
                    networkId: `$storage.network_${networkName}`,
                },
                inputBindings: {
                    networkId: { source: "storage", sourceKey: `network_${networkName}` },
                },
                outputMappings: [
                    { outputKey: "agentId", target: "storage", targetKey: `agent_${a.name}` },
                ],
            });
        }

        // 3. Create channels — output channel ID to storage
        for (const c of config.channels || []) {
            if (c.from == null || c.to == null) continue;
            const fromName = config.agents[c.from]?.name;
            const toName = config.agents[c.to]?.name;
            if (!fromName || !toName) continue;
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "create_channel",
                name: `Channel: ${fromName} ↔ ${toName}`,
                args: { from: fromName, to: toName, type: c.type || "data" },
                inputBindings: {
                    from: { source: "storage", sourceKey: `agent_${fromName}` },
                    to: { source: "storage", sourceKey: `agent_${toName}` },
                },
                outputMappings: [
                    { outputKey: "channelId", target: "storage", targetKey: `channel_${fromName}_${toName}` },
                ],
            });
        }

        // 4. Create groups — bind networkId from storage, output group ID to storage
        for (const g of config.groups || []) {
            if (!g?.name) continue;
            const memberNames = (g.members || []).map((idx: number) => config.agents[idx]?.name).filter(Boolean);
            if (memberNames.length < 2) continue;
            const firstMemberNetIdx = agentToNetworkIdx[g.members[0]] ?? 0;
            const networkName = configNetworks[firstMemberNetIdx]?.name || configNetworks[0]?.name;
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "create_group",
                name: `Create Group: ${g.name}`,
                args: {
                    name: g.name,
                    members: memberNames,
                    governance: g.governance || "majority",
                    networkId: `$storage.network_${networkName}`,
                },
                inputBindings: {
                    networkId: { source: "storage", sourceKey: `network_${networkName}` },
                },
                outputMappings: [
                    { outputKey: "groupId", target: "storage", targetKey: `group_${g.name}` },
                ],
            });
        }

        // 5. Create bridges — bind network/agent refs from storage
        for (const b of config.bridges || []) {
            if (b.fromNetwork == null || b.toNetwork == null || b.fromAgent == null || b.toAgent == null) continue;
            const fromAgentName = config.agents[b.fromAgent]?.name;
            const toAgentName = config.agents[b.toAgent]?.name;
            const fromNetworkName = configNetworks[b.fromNetwork]?.name;
            const toNetworkName = configNetworks[b.toNetwork]?.name;
            if (!fromAgentName || !toAgentName || !fromNetworkName || !toNetworkName) continue;
            if (fromNetworkName === toNetworkName) continue; // Bridges connect different networks
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "create_bridge",
                name: `Bridge: ${fromAgentName} ↔ ${toAgentName}`,
                args: {
                    from_network: `$storage.network_${fromNetworkName}`,
                    to_network: `$storage.network_${toNetworkName}`,
                    from_agent: `$storage.agent_${fromAgentName}`,
                    to_agent: `$storage.agent_${toAgentName}`,
                    type: b.type || "data",
                },
                inputBindings: {
                    from_network: { source: "storage", sourceKey: `network_${fromNetworkName}` },
                    to_network: { source: "storage", sourceKey: `network_${toNetworkName}` },
                    from_agent: { source: "storage", sourceKey: `agent_${fromAgentName}` },
                    to_agent: { source: "storage", sourceKey: `agent_${toAgentName}` },
                },
                outputMappings: [
                    { outputKey: "bridge", target: "storage", targetKey: `bridge_${fromAgentName}_${toAgentName}` },
                ],
            });
        }

        // 6. Example messages — output responses to storage
        for (const em of config.exampleMessages || []) {
            if (em.channelIdx == null || !em.message) continue;
            const ch = (config.channels || [])[em.channelIdx];
            if (!ch) continue;
            const fromName = config.agents[ch.from]?.name;
            const toName = config.agents[ch.to]?.name;
            if (!fromName || !toName) continue;
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "send_message",
                name: `Message: ${fromName} → ${toName}`,
                args: { from_agent_id: `$storage.agent_${fromName}`, to_agent_id: `$storage.agent_${toName}`, message: em.message },
                inputBindings: {
                    from_agent_id: { source: "storage", sourceKey: `agent_${fromName}` },
                    to_agent_id: { source: "storage", sourceKey: `agent_${toName}` },
                },
                outputMappings: [
                    { outputKey: "response", target: "storage", targetKey: `response_${toName}` },
                ],
            });
        }

        // 7. Final step: print topology — route to storage and deliverable
        steps.push({
            id: `step-${stepIdx++}`,
            commandId: "print_topology",
            name: "Generate Topology Report",
            args: {},
            outputMappings: [
                { outputKey: "*", target: "storage", targetKey: "lastTopology" },
                { outputKey: "*", target: "deliverable", targetKey: "topology" },
            ],
        });

        // --- Build storage defaults from config entities ---
        const childStorageDefaults: Record<string, any> = {};
        for (const net of configNetworks) {
            if (net?.name) childStorageDefaults[`network_${net.name}`] = null;
        }
        for (const a of config.agents) {
            if (a?.name) childStorageDefaults[`agent_${a.name}`] = null;
        }
        for (const c of config.channels || []) {
            const fn = config.agents[c.from]?.name;
            const tn = config.agents[c.to]?.name;
            if (fn && tn) childStorageDefaults[`channel_${fn}_${tn}`] = null;
        }
        for (const g of config.groups || []) {
            if (g?.name) childStorageDefaults[`group_${g.name}`] = null;
        }

        // --- Queue the multi-step deployment job ---
        const networkNames = configNetworks.map((n: any) => n.name).join(", ");
        const jobPayload: any = {
            type: `deploy: ${networkNames}`,
            request: { config, generatedAt: new Date().toISOString() },
            steps,
            mode: "serial",
            deliverables: [
                { key: "topology", label: "Network Topology", type: "json", description: "Final topology after deployment" },
            ],
            storageDefaults: childStorageDefaults,
            inputDefaults: [],
        };

        const job = context.jobs.addJob(jobPayload);
        addLog(`Deployment job queued: ${steps.length} steps → ${job.id.slice(0, 12)}`);

        return {
            success: true,
            jobId: job.id,
            stepCount: steps.length,
            steps: steps.map((s: any) => ({ id: s.id, command: s.commandId, name: s.name })),
        };
    }
};

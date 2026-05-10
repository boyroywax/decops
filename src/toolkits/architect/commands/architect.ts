
import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import { generateMeshConfig } from "@/services/ai";
import { slugifyStorageKey } from "@/utils/storageKey";

export const promptArchitectCommand: CommandDefinition = {
    id: "prompt_architect",
    description: "Generate a new network design using the AI Architect.",
    tags: ["architect", "create", "ai"],
    rbac: ["builder", "orchestrator"],
    recommendedModel: "claude-sonnet-4-20250514",
    usesAI: true,
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
    description: "Generate and deploy a full agent mesh network. Provide a natural-language prompt to auto-generate the config, or supply a pre-built MeshConfig directly. Multi-network configs create parallel jobs for A/B testing.",
    tags: ["architect", "deploy", "provision", "job"],
    rbac: ["builder", "orchestrator"],
    usesAI: true,
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
        },
        mode: {
            name: "mode",
            type: "string",
            description: "Deployment mode: 'parallel' queues each network as an independent concurrent job (A/B testing), 'serial' queues everything as one sequential job. Default: parallel for multi-network, serial for single.",
            required: false,
            enum: ["serial", "parallel"],
        }
    },
    output: "Summary of the generated deployment job(s) with step lists.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, jobs: { type: "array" }, stepCount: { type: "number" } } },
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

        // Determine deployment mode
        const effectiveMode = args.mode || (configNetworks.length > 1 ? "parallel" : "serial");

        // ── Auto-generate bridges when multiple networks lack any connecting bridges ──
        // Architect contract: every network must connect to the rest of the mesh.
        // If the AI returned multiple networks but no bridges, create a chain of
        // bridges between each consecutive pair (using each network's first agent).
        if (configNetworks.length > 1 && (!config.bridges || config.bridges.length === 0)) {
            const autoBridges: any[] = [];
            const firstAgentIdxOfNetwork = (netIdx: number): number | undefined => {
                const net = configNetworks[netIdx];
                if (net?.agents && net.agents.length > 0) return net.agents[0];
                // Fall back to scanning the agent-to-network index
                for (let i = 0; i < agentToNetworkIdx.length; i++) {
                    if (agentToNetworkIdx[i] === netIdx) return i;
                }
                return undefined;
            };
            for (let i = 0; i < configNetworks.length - 1; i++) {
                const fromAgent = firstAgentIdxOfNetwork(i);
                const toAgent = firstAgentIdxOfNetwork(i + 1);
                if (fromAgent == null || toAgent == null) continue;
                autoBridges.push({
                    fromNetwork: i,
                    toNetwork: i + 1,
                    fromAgent,
                    toAgent,
                    type: "data",
                });
            }
            if (autoBridges.length > 0) {
                config.bridges = autoBridges;
                addLog(`Architect auto-generated ${autoBridges.length} bridge(s) to connect ${configNetworks.length} networks`);
            }
        }

        // ── Helper: build per-network pipeline steps ──
        const buildNetworkPipeline = (net: any, netIdx: number, prefix: string) => {
            const steps: any[] = [];
            let stepIdx = 0;

            // 1. Create the network
            steps.push({
                id: `${prefix}-step-${stepIdx++}`,
                commandId: "create_network",
                name: `Create Network: ${net.name}`,
                args: { name: net.name, description: net.description || "" },
            });

            // 2. Create agents belonging to this network
            const agentSpecs: any[] = [];
            for (let i = 0; i < config.agents.length; i++) {
                const a = config.agents[i];
                if (!a?.name) continue;
                const belongsToNet = a.network ?? agentToNetworkIdx[i] ?? 0;
                if (belongsToNet !== netIdx) continue;
                agentSpecs.push({
                    name: a.name,
                    role: a.role || "researcher",
                    prompt: a.prompt || "",
                    networkId: `$storage.network_${slugifyStorageKey(net.name)}`,
                });
            }

            if (agentSpecs.length > 0) {
                steps.push({
                    id: `${prefix}-step-${stepIdx++}`,
                    commandId: "create_agent",
                    name: `Create ${agentSpecs.length} Agent(s) [${net.name}]`,
                    args: agentSpecs.length === 1 ? { ...agentSpecs[0] } : { items: agentSpecs },
                });
            }

            // 3. Create channels (intra-network only)
            const netAgentIndices = new Set<number>();
            for (let i = 0; i < config.agents.length; i++) {
                const belongsToNet = config.agents[i]?.network ?? agentToNetworkIdx[i] ?? 0;
                if (belongsToNet === netIdx) netAgentIndices.add(i);
            }
            const channelSpecs: any[] = [];
            for (const c of config.channels || []) {
                if (c.from == null || c.to == null) continue;
                if (!netAgentIndices.has(c.from) || !netAgentIndices.has(c.to)) continue;
                const fromName = config.agents[c.from]?.name;
                const toName = config.agents[c.to]?.name;
                if (!fromName || !toName) continue;
                channelSpecs.push({
                    from: fromName,
                    to: toName,
                    type: c.type || "data",
                    networkId: `$storage.network_${slugifyStorageKey(net.name)}`,
                });
            }
            if (channelSpecs.length > 0) {
                steps.push({
                    id: `${prefix}-step-${stepIdx++}`,
                    commandId: "create_channel",
                    name: `Create ${channelSpecs.length} Channel(s) [${net.name}]`,
                    args: channelSpecs.length === 1 ? { ...channelSpecs[0] } : { items: channelSpecs },
                });
            }

            // 4. Create groups (members in this network)
            const groupSpecs: any[] = [];
            for (const g of config.groups || []) {
                if (!g?.name) continue;
                const memberNames = (g.members || [])
                    .filter((idx: number) => netAgentIndices.has(idx))
                    .map((idx: number) => config.agents[idx]?.name)
                    .filter(Boolean);
                if (memberNames.length < 2) continue;
                groupSpecs.push({
                    name: g.name,
                    members: memberNames,
                    governance: g.governance || "majority",
                    networkId: `$storage.network_${slugifyStorageKey(net.name)}`,
                });
            }
            if (groupSpecs.length > 0) {
                steps.push({
                    id: `${prefix}-step-${stepIdx++}`,
                    commandId: "create_group",
                    name: `Create ${groupSpecs.length} Group(s) [${net.name}]`,
                    args: groupSpecs.length === 1 ? { ...groupSpecs[0] } : { items: groupSpecs },
                });
            }

            // 5. Heartbeat check — ping every agent in this network from the
            //    current user to confirm setup completed and elicit a response.
            const HEARTBEAT_MESSAGE = "Heartbeat check — setup complete. Please respond with your current status and confirm you are online.";
            for (const i of netAgentIndices) {
                const a = config.agents[i];
                if (!a?.name) continue;
                steps.push({
                    id: `${prefix}-step-${stepIdx++}`,
                    commandId: "send_message",
                    name: `Heartbeat → ${a.name} [${net.name}]`,
                    args: {
                        from_agent_id: "user",
                        to_agent_id: `$storage.agent_${slugifyStorageKey(a.name)}`,
                        message: HEARTBEAT_MESSAGE,
                    },
                });
            }

            // 6. Print topology at the end
            steps.push({
                id: `${prefix}-step-${stepIdx++}`,
                commandId: "print_topology",
                name: `Topology Report [${net.name}]`,
                args: {},
                outputMappings: [
                    { outputKey: "*", target: "storage", targetKey: "lastTopology" },
                    { outputKey: "*", target: "deliverable", targetKey: `topology_${net.name}` },
                ],
            });

            return steps;
        };

        // ── Build storage defaults for a network ──
        const buildStorageDefaults = (net: any, netIdx: number) => {
            const defaults: Record<string, any> = {};
            defaults[`network_${slugifyStorageKey(net.name)}`] = null;
            for (let i = 0; i < config.agents.length; i++) {
                const a = config.agents[i];
                if (!a?.name) continue;
                const belongsToNet = a.network ?? agentToNetworkIdx[i] ?? 0;
                if (belongsToNet !== netIdx) continue;
                defaults[`agent_${slugifyStorageKey(a.name)}`] = null;
            }
            return defaults;
        };

        // ── Parallel mode: one job per network ──
        if (effectiveMode === "parallel" && configNetworks.length > 1) {
            const queuedJobs: any[] = [];

            for (let netIdx = 0; netIdx < configNetworks.length; netIdx++) {
                const net = configNetworks[netIdx];
                if (!net?.name) continue;
                const steps = buildNetworkPipeline(net, netIdx, `net${netIdx}`);
                const storageDefaults = buildStorageDefaults(net, netIdx);

                const jobPayload: any = {
                    type: `deploy: ${net.name}`,
                    request: { config, generatedAt: new Date().toISOString(), networkIndex: netIdx },
                    steps,
                    mode: "serial",
                    deliverables: [
                        { key: `topology_${net.name}`, label: `Topology: ${net.name}`, type: "json", description: `Topology for network ${net.name}` },
                    ],
                    storageDefaults,
                    inputDefaults: [],
                };

                const job = context.jobs.addJob(jobPayload);
                queuedJobs.push({ jobId: job.id, network: net.name, stepCount: steps.length });
                addLog(`[A/B] Queued job for "${net.name}": ${steps.length} steps → ${job.id.slice(0, 12)}`);
            }

            // If there are cross-network bridges, queue a finalization job that
            // resolves agents/networks by NAME (since each parallel job has its
            // own storage scope; bridges run after all networks are created).
            const bridgeSpecs: any[] = [];
            for (const b of config.bridges || []) {
                if (b.fromNetwork == null || b.toNetwork == null || b.fromAgent == null || b.toAgent == null) continue;
                const fromAgentName = config.agents[b.fromAgent]?.name;
                const toAgentName = config.agents[b.toAgent]?.name;
                const fromNetworkName = configNetworks[b.fromNetwork]?.name;
                const toNetworkName = configNetworks[b.toNetwork]?.name;
                if (!fromAgentName || !toAgentName || !fromNetworkName || !toNetworkName) continue;
                if (fromNetworkName === toNetworkName) continue;
                bridgeSpecs.push({
                    from_network: fromNetworkName,
                    to_network: toNetworkName,
                    from_agent: fromAgentName,
                    to_agent: toAgentName,
                    type: b.type || "data",
                });
            }

            if (bridgeSpecs.length > 0) {
                const bridgeJobPayload: any = {
                    type: `bridges: ${bridgeSpecs.length} cross-network`,
                    request: { bridges: bridgeSpecs },
                    steps: [{
                        id: "step-0",
                        commandId: "create_bridge",
                        name: `Create ${bridgeSpecs.length} Bridge(s)`,
                        args: bridgeSpecs.length === 1 ? { ...bridgeSpecs[0] } : { items: bridgeSpecs },
                    }],
                    mode: "serial",
                    deliverables: [],
                    storageDefaults: {},
                    inputDefaults: [],
                };
                const bridgeJob = context.jobs.addJob(bridgeJobPayload);
                queuedJobs.push({ jobId: bridgeJob.id, network: "(bridges)", stepCount: 1 });
                addLog(`[A/B] Queued bridges job: ${bridgeSpecs.length} cross-network bridge(s) → ${bridgeJob.id.slice(0, 12)}`);
            }

            const totalSteps = queuedJobs.reduce((s: number, j: any) => s + j.stepCount, 0);
            return {
                success: true,
                mode: "parallel",
                jobs: queuedJobs,
                stepCount: totalSteps,
            };
        }

        // ── Serial mode: single job with all networks ──
        const steps: any[] = [];
        let stepIdx = 0;

        for (let netIdx = 0; netIdx < configNetworks.length; netIdx++) {
            const net = configNetworks[netIdx];
            if (!net?.name) continue;
            const pipelineSteps = buildNetworkPipeline(net, netIdx, `s${netIdx}`);
            // Remove per-network topology step (we'll add one at the end)
            const withoutTopology = pipelineSteps.filter((s: any) => s.commandId !== "print_topology");
            for (const s of withoutTopology) {
                steps.push({ ...s, id: `step-${stepIdx++}` });
            }
        }

        // Cross-network bridges (only in serial mode where all entities share storage)
        const bridgeSpecs: any[] = [];
        for (const b of config.bridges || []) {
            if (b.fromNetwork == null || b.toNetwork == null || b.fromAgent == null || b.toAgent == null) continue;
            const fromAgentName = config.agents[b.fromAgent]?.name;
            const toAgentName = config.agents[b.toAgent]?.name;
            const fromNetworkName = configNetworks[b.fromNetwork]?.name;
            const toNetworkName = configNetworks[b.toNetwork]?.name;
            if (!fromAgentName || !toAgentName || !fromNetworkName || !toNetworkName) continue;
            if (fromNetworkName === toNetworkName) continue;
            bridgeSpecs.push({
                from_network: `$storage.network_${slugifyStorageKey(fromNetworkName)}`,
                to_network: `$storage.network_${slugifyStorageKey(toNetworkName)}`,
                from_agent: `$storage.agent_${slugifyStorageKey(fromAgentName)}`,
                to_agent: `$storage.agent_${slugifyStorageKey(toAgentName)}`,
                type: b.type || "data",
            });
        }
        if (bridgeSpecs.length > 0) {
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "create_bridge",
                name: `Create ${bridgeSpecs.length} Bridge(s)`,
                args: bridgeSpecs.length === 1 ? { ...bridgeSpecs[0] } : { items: bridgeSpecs },
            });
        }

        // Heartbeat check — ping every deployed agent from the current user
        // to confirm setup completed and elicit an initial AI response.
        const HEARTBEAT_MESSAGE = "Heartbeat check — setup complete. Please respond with your current status and confirm you are online.";
        for (const a of config.agents || []) {
            if (!a?.name) continue;
            steps.push({
                id: `step-${stepIdx++}`,
                commandId: "send_message",
                name: `Heartbeat → ${a.name}`,
                args: {
                    from_agent_id: "user",
                    to_agent_id: `$storage.agent_${slugifyStorageKey(a.name)}`,
                    message: HEARTBEAT_MESSAGE,
                },
            });
        }

        // Final topology step
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

        // Build storage defaults
        const childStorageDefaults: Record<string, any> = {};
        for (const net of configNetworks) {
            if (net?.name) childStorageDefaults[`network_${slugifyStorageKey(net.name)}`] = null;
        }
        for (const a of config.agents) {
            if (a?.name) childStorageDefaults[`agent_${slugifyStorageKey(a.name)}`] = null;
        }

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
            mode: "serial",
            jobs: [{ jobId: job.id, network: networkNames, stepCount: steps.length }],
            stepCount: steps.length,
        };
    }
};

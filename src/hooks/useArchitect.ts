import { useState } from "react";
import type {
  Agent, Channel, Group, Message, MeshConfig,
  ArchPhase, DeployProgress,
} from "../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS } from "../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../utils/identity";
import { generateMeshConfig } from "../services/ai";
import { callAgentAI } from "../services/ai";

interface UseArchitectDeps {
  addLog: (msg: string) => void;
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setActiveChannels: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useArchitect({
  addLog, setAgents, setChannels, setGroups, setMessages, setActiveChannels,
}: UseArchitectDeps, addJob?: (job: any) => void) {
  const [archPrompt, setArchPrompt] = useState("");
  const [archGenerating, setArchGenerating] = useState(false);
  const [archPreview, setArchPreview] = useState<MeshConfig | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [archPhase, setArchPhase] = useState<ArchPhase>("input");
  const [deployProgress, setDeployProgress] = useState<DeployProgress>({ step: "", count: 0, total: 0 });

  const execGenerateMesh = async (description: string) => {
    setArchGenerating(true);
    setArchError(null);
    setArchPreview(null);
    setArchPhase("input");
    addLog(`Architect: generating mesh for "${description.slice(0, 50)}…"`);
    try {
      const config = await generateMeshConfig(description);
      if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
        throw new Error("No agents in config");
      }
      if (!config.channels || !Array.isArray(config.channels)) {
        throw new Error("No channels in config");
      }
      setArchPreview(config);
      setArchPhase("preview");
      addLog(`Architect: generated ${config.agents.length} agents, ${config.channels.length} channels, ${config.groups?.length || 0} groups`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setArchError(message);
      addLog(`Architect error: ${message}`);
    }
    setArchGenerating(false);
  };

  const generateNetwork = async (description: string) => {
    // Instead of running immediately, queue a job
    if (addJob) {
      addJob({
        type: "prompt_architect",
        request: { prompt: description },
        name: `Architect: ${description.slice(0, 30)}...`,
        description: `Generating network design for: ${description}`,
        status: "queued"
      });
      // Optimistic update
      setArchGenerating(true);
      // We might want to set this to false effectively immediately and let the job status control UI?
      // But ArchitectView uses 'archGenerating' to show spinner. 
      // If we queue it, we might want to keep spinner until job starts? 
      // Actually, the job will run 'execGenerateMesh' which sets 'archGenerating' to true.
      // So we don't need to double set it here maybe? 
      // Let's set it briefly to acknowledge click.
    } else {
      console.error("No addJob function provided");
      // Fallback
      execGenerateMesh(description);
    }
  };

  const deployNetwork = async () => {
    if (!archPreview) return;
    setArchPhase("deploying");

    // Instead of executing logic here, queue a job!
    if (addJob) {
      const steps = [];

      // 1. Create Agents
      if (archPreview.agents) {
        for (const agent of archPreview.agents) {
          steps.push({
            id: `step-create-agent-${agent.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
            commandId: "create_agent",
            args: {
              name: agent.name,
              role: agent.role || "researcher",
              model: agent.model || "claude-3-haiku-20240307",
              prompt: agent.prompt || "",
              icon: agent.icon
            },
            status: "pending"
          });
        }
      }

      // 2. Create Channels (depend on agents)
      if (archPreview.channels) {
        for (const channel of archPreview.channels) {
          // Resolve indices to names (commands accept names or IDs)
          // Since agents are created in previous steps, we rely on name resolution.
          // Handle both numeric indices setup and potential string names if config differs
          const fromAgent = typeof channel.from === 'number' && archPreview.agents[channel.from]
            ? archPreview.agents[channel.from].name
            : channel.from;

          const toAgent = typeof channel.to === 'number' && archPreview.agents[channel.to]
            ? archPreview.agents[channel.to].name
            : channel.to;

          steps.push({
            id: `step-create-channel-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            commandId: "create_channel",
            args: {
              from: fromAgent,
              to: toAgent,
              type: channel.type,
              label: channel.label
            },
            status: "pending"
          });
        }
      }

      // 3. Create Groups
      if (archPreview.groups) {
        for (const group of archPreview.groups) {
          // Resolve member indices to names
          const resolvedMembers = group.members.map((m: number | string) => {
            if (typeof m === 'number' && archPreview.agents[m]) {
              return archPreview.agents[m].name;
            }
            return m;
          });

          steps.push({
            id: `step-create-group-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            commandId: "create_group",
            args: {
              name: group.name,
              members: resolvedMembers,
              governance: group.governance
            },
            status: "pending"
          });
        }
      }

      if (steps.length > 0) {
        addJob({
          type: "deploy_network_granular",
          request: { config: archPreview }, // Keep original request for reference
          name: `Deploy: ${archPrompt.slice(0, 30)}...`,
          description: ` deploying ${steps.length} components.`,
          mode: "serial", // Serial to ensure agents exist before channels
          steps: steps
        });
      }

      // Optimistic / UI updates
      setDeployProgress({ step: "Queued for deployment...", count: 0, total: 100 });

      // We can reset phase to "done" immediately or after a timeout?
      setTimeout(() => {
        setArchPhase("done");
        setDeployProgress({ step: "Deployment Job Started", count: 100, total: 100 });
      }, 1000);
    } else {
      console.error("No addJob function provided to useArchitect");
    }
  };

  const resetArchitect = () => {
    setArchPrompt("");
    setArchPreview(null);
    setArchError(null);
    setArchPhase("input");
    setDeployProgress({ step: "", count: 0, total: 0 });
  };

  return {
    archPrompt, setArchPrompt,
    archGenerating,
    archPreview,
    archError,
    archPhase,
    deployProgress,
    generateNetwork, // The one that queues the job
    execGenerateMesh, // The actual logic
    deployNetwork,
    resetArchitect,
  };
}

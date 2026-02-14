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
}: UseArchitectDeps) {
  const [archPrompt, setArchPrompt] = useState("");
  const [archGenerating, setArchGenerating] = useState(false);
  const [archPreview, setArchPreview] = useState<MeshConfig | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [archPhase, setArchPhase] = useState<ArchPhase>("input");
  const [deployProgress, setDeployProgress] = useState<DeployProgress>({ step: "", count: 0, total: 0 });

  const generateNetwork = async (description: string) => {
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

  const deployNetwork = async () => {
    if (!archPreview) return;
    setArchPhase("deploying");
    const config = archPreview;
    const total = config.agents.length + config.channels.length + (config.groups?.length || 0) + (config.exampleMessages?.length || 0);
    let count = 0;

    // 1. Create agents
    const newAgents: Agent[] = [];
    for (const a of config.agents) {
      if (!a || !a.name) continue;
      const validRole = ROLES.find(r => r.id === a.role) ? a.role as Agent["role"] : "researcher";
      const agent: Agent = {
        id: crypto.randomUUID(), name: a.name, role: validRole,
        prompt: a.prompt || "", did: generateDID(), keys: generateKeyPair(),
        createdAt: new Date().toISOString(), status: "active",
      };
      newAgents.push(agent);
      count++;
      setDeployProgress({ step: `Creating agent: ${a.name}`, count, total });
      addLog(`Deployed agent "${a.name}" -> ${agent.did.slice(0, 20)}…`);
      await new Promise(r => setTimeout(r, 150));
    }
    setAgents((prev) => [...prev, ...newAgents]);

    // 2. Create channels
    const newChannels: Channel[] = [];
    for (const c of config.channels) {
      if (c.from == null || c.to == null) continue;
      const fromAgent = newAgents[c.from];
      const toAgent = newAgents[c.to];
      if (!fromAgent || !toAgent) continue;
      const validType = CHANNEL_TYPES.find(t => t.id === c.type) ? c.type as Channel["type"] : "data";
      const ch: Channel = {
        id: crypto.randomUUID(), from: fromAgent.id, to: toAgent.id,
        type: validType, offset: Math.random() * 120, createdAt: new Date().toISOString(),
      };
      newChannels.push(ch);
      count++;
      setDeployProgress({ step: `Channel: ${fromAgent.name} <-> ${toAgent.name}`, count, total });
      addLog(`Channel: ${fromAgent.name} <-> ${toAgent.name} [${validType}]`);
      await new Promise(r => setTimeout(r, 100));
    }
    setChannels((prev) => [...prev, ...newChannels]);

    // 3. Create groups
    const newGroups: Group[] = [];
    if (config.groups) {
      for (const g of config.groups) {
        if (!g || !g.name) continue;
        const memberIds = (g.members || []).map(idx => newAgents[idx]?.id).filter(Boolean);
        if (memberIds.length < 2) continue;
        const validGov = GOVERNANCE_MODELS.find(m => m.id === g.governance) ? g.governance as Group["governance"] : "majority";
        const group: Group = {
          id: crypto.randomUUID(), name: g.name, governance: validGov,
          members: memberIds, threshold: g.threshold || 2,
          did: generateGroupDID(), color: GROUP_COLORS[newGroups.length % GROUP_COLORS.length],
          createdAt: new Date().toISOString(),
        };
        newGroups.push(group);
        count++;
        setDeployProgress({ step: `Group: ${g.name}`, count, total });
        addLog(`Group "${g.name}" formed -> ${group.did.slice(0, 22)}…`);
        await new Promise(r => setTimeout(r, 100));

        // Auto-create consensus channels within group
        for (let i = 0; i < memberIds.length; i++) {
          for (let j = i + 1; j < memberIds.length; j++) {
            const exists = newChannels.some(c =>
              (c.from === memberIds[i] && c.to === memberIds[j]) ||
              (c.from === memberIds[j] && c.to === memberIds[i])
            );
            if (!exists) {
              const ch: Channel = {
                id: crypto.randomUUID(), from: memberIds[i], to: memberIds[j],
                type: "consensus", offset: Math.random() * 120, createdAt: new Date().toISOString(),
              };
              newChannels.push(ch);
              setChannels((prev) => [...prev, ch]);
            }
          }
        }
      }
    }
    setGroups((prev) => [...prev, ...newGroups]);

    // 4. Send example messages
    if (config.exampleMessages && config.exampleMessages.length > 0) {
      for (const em of config.exampleMessages) {
        if (em.channelIdx == null || !em.message) continue;
        const ch = newChannels[em.channelIdx];
        if (!ch) continue;
        const fromAgent = newAgents.find(a => a.id === ch.from);
        const toAgent = newAgents.find(a => a.id === ch.to);
        if (!fromAgent || !toAgent) continue;

        count++;
        setDeployProgress({ step: `Message: ${fromAgent.name} -> ${toAgent.name}`, count, total });
        addLog(`Example msg: ${fromAgent.name} -> ${toAgent.name}`);

        const msgId = crypto.randomUUID();
        const msg: Message = {
          id: msgId, channelId: ch.id, fromId: ch.from, toId: ch.to,
          content: em.message, response: null, status: "sending", ts: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        setActiveChannels((prev) => new Set([...prev, ch.id]));

        if (toAgent.prompt) {
          const response = await callAgentAI(toAgent, fromAgent, em.message, ch.type, []);
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
          addLog(`${toAgent.name} responded (${response.length} chars)`);
        } else {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[No prompt]", status: "no-prompt" } : m));
        }

        setTimeout(() => setActiveChannels((prev) => { const n = new Set(prev); n.delete(ch.id); return n; }), 3000);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    setArchPhase("done");
    setDeployProgress({ step: "Complete", count: total, total });
    addLog(`Mesh network deployed: ${newAgents.length} agents, ${newChannels.length} channels, ${newGroups.length} groups`);
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
    generateNetwork,
    deployNetwork,
    resetArchitect,
  };
}

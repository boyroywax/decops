import { useState, useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type {
  Agent, Channel, Group, Message, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId, Ecosystem,
} from "@/types";
import { ROLES, CHANNEL_TYPES, NETWORK_COLORS } from "@/constants";
import { generateNetworkDID, generateEcosystemDID } from "@/utils/identity";
import { callAgentAI } from "@/services/ai";

interface UseEcosystemDeps {
  addLog: (msg: string) => void;
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setView: (view: ViewId) => void;
}

/** Create a default empty ecosystem */
function createDefaultEcosystem(): Ecosystem {
  return {
    id: crypto.randomUUID(),
    name: "Default Ecosystem",
    did: generateEcosystemDID(),
    networks: [],
    bridges: [],
    bridgeMessages: [],
    createdAt: new Date().toISOString(),
  };
}

export function useEcosystem({
  addLog, agents, channels, groups, messages,
  setAgents, setChannels, setGroups, setMessages, setView,
}: UseEcosystemDeps, addJob?: (job: any) => void) {
  // ─── Ecosystem state ───
  // The canonical ecosystem object. For backward compat with existing localStorage,
  // we also maintain legacy `decops_ecosystems` / `decops_bridges` keys and migrate on load.
  const [ecosystem, setEcosystem] = useLocalStorage<Ecosystem>(
    "decops_ecosystem",
    createDefaultEcosystem()
  );

  // ─── Auto-adopt orphaned entities ───
  // If entities exist without a networkId (or with a networkId that doesn't match
  // any known network), create a default network and assign them.
  // Runs whenever entities or networks change, but debounced via a ref to avoid loops.
  const adoptionInProgress = useRef(false);
  useEffect(() => {
    if (adoptionInProgress.current) return;
    const totalEntities = agents.length + channels.length + groups.length;
    if (totalEntities === 0) return;

    const networkIds = new Set(ecosystem.networks.map(n => n.id));

    // Find orphaned entities — no networkId or networkId doesn't match any network
    const orphanedAgents = agents.filter(a => !a.networkId || !networkIds.has(a.networkId));
    const orphanedChannels = channels.filter(c => !c.networkId || !networkIds.has(c.networkId));
    const orphanedGroups = groups.filter(g => !g.networkId || !networkIds.has(g.networkId));

    if (orphanedAgents.length === 0 && orphanedChannels.length === 0 && orphanedGroups.length === 0) return;

    adoptionInProgress.current = true;

    // Determine which network to assign orphans to
    let targetNetworkId: string;

    if (ecosystem.networks.length === 1) {
      // Use the sole existing network
      targetNetworkId = ecosystem.networks[0].id;
    } else if (ecosystem.networks.length === 0) {
      // Create a default network
      targetNetworkId = crypto.randomUUID();
      const defaultNetwork: Network = {
        id: targetNetworkId,
        name: "Default Network",
        did: generateNetworkDID(),
        color: NETWORK_COLORS?.[0] || "#00e5a0",
        agents: [],
        channels: [],
        groups: [],
        messages: [],
        createdAt: new Date().toISOString(),
        description: "Auto-created network for workspace entities.",
      };
      setEcosystem(prev => ({
        ...prev,
        networks: [...prev.networks, defaultNetwork],
      }));
      addLog(`Created default network for ${orphanedAgents.length + orphanedChannels.length + orphanedGroups.length} orphaned entities.`);
    } else {
      // Multiple networks — can't guess which one to adopt into
      adoptionInProgress.current = false;
      return;
    }

    // Tag orphaned entities with the target network
    if (orphanedAgents.length > 0) {
      setAgents(prev => prev.map(a =>
        (!a.networkId || !networkIds.has(a.networkId)) ? { ...a, networkId: targetNetworkId } : a
      ));
    }
    if (orphanedChannels.length > 0) {
      setChannels(prev => prev.map(c =>
        (!c.networkId || !networkIds.has(c.networkId)) ? { ...c, networkId: targetNetworkId } : c
      ));
    }
    if (orphanedGroups.length > 0) {
      setGroups(prev => prev.map(g =>
        (!g.networkId || !networkIds.has(g.networkId)) ? { ...g, networkId: targetNetworkId } : g
      ));
    }

    // Allow re-adoption after state settles
    setTimeout(() => { adoptionInProgress.current = false; }, 500);
  }, [agents, channels, groups, ecosystem.networks]);

  // ─── Derived references ───
  const networks = ecosystem.networks;
  const bridges = ecosystem.bridges;

  // ─── Setters that update the nested ecosystem ───
  const setNetworks = (updater: Network[] | ((prev: Network[]) => Network[])) => {
    setEcosystem((prev) => ({
      ...prev,
      networks: typeof updater === "function" ? updater(prev.networks) : updater,
    }));
  };

  const setBridges = (updater: Bridge[] | ((prev: Bridge[]) => Bridge[])) => {
    setEcosystem((prev) => ({
      ...prev,
      bridges: typeof updater === "function" ? updater(prev.bridges) : updater,
    }));
  };

  const setBridgeMessages = (updater: BridgeMessage[] | ((prev: BridgeMessage[]) => BridgeMessage[])) => {
    setEcosystem((prev) => ({
      ...prev,
      bridgeMessages: typeof updater === "function" ? updater(prev.bridgeMessages) : updater,
    }));
  };

  // ─── Active network (which network the user is "focused" on) ───
  const [activeNetworkId, setActiveNetworkId] = useState<string | null>(null);
  const activeNetwork = activeNetworkId
    ? ecosystem.networks.find((n) => n.id === activeNetworkId) ?? null
    : null;

  // ─── Transient UI state (not persisted in ecosystem) ───
  const [activeBridges, setActiveBridges] = useState<Set<string>>(new Set());
  const [bridgeForm, setBridgeForm] = useState<BridgeForm>({
    fromNet: "", toNet: "", fromAgent: "", toAgent: "", type: "data",
  });
  const [selectedBridge, setSelectedBridge] = useState<string | null>(null);
  const [bridgeMsgInput, setBridgeMsgInput] = useState("");
  const [bridgeSending, setBridgeSending] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ecosystem.bridgeMessages, selectedBridge]);

  // ─── Actions ───

  const dissolveNetwork = (id: string) => {
    if (addJob) {
      addJob({
        type: "destroy_network",
        request: { id }
      });
    }
  };

  const createBridge = () => {
    const { fromNet, toNet, fromAgent, toAgent, type } = bridgeForm;
    if (!fromNet || !toNet || !fromAgent || !toAgent || fromNet === toNet) return;

    if (addJob) {
      addJob({
        type: "create_bridge",
        request: {
          from_network: fromNet,
          to_network: toNet,
          from_agent: fromAgent,
          to_agent: toAgent,
          type
        }
      });
    }
    setBridgeForm({ fromNet: "", toNet: "", fromAgent: "", toAgent: "", type: "data" });
  };

  const removeBridge = (id: string) => {
    if (addJob) {
      addJob({ type: "delete_bridge", request: { id } });
    }
    if (selectedBridge === id) setSelectedBridge(null);
  };

  const sendBridgeMessage = async () => {
    if (!bridgeMsgInput.trim() || !selectedBridge || bridgeSending) return;

    setBridgeSending(true);
    if (addJob) {
      addJob({
        type: "send_bridge_message",
        request: {
          bridge_id: selectedBridge,
          message: bridgeMsgInput.trim()
        }
      });
    }

    setBridgeMsgInput("");
    setTimeout(() => setBridgeSending(false), 500);
  };

  // ─── Computed values ───
  const bridgeMessages = ecosystem.bridgeMessages;
  const selBridge = bridges.find((b) => b.id === selectedBridge);
  const selBridgeFromNet = selBridge ? networks.find((n) => n.id === selBridge.fromNetworkId) : null;
  const selBridgeToNet = selBridge ? networks.find((n) => n.id === selBridge.toNetworkId) : null;
  // Resolve bridge agents from workspace-level agents (always fresh) with fallback to Network.agents
  const selBridgeFrom = agents.find((a) => a.id === selBridge?.fromAgentId)
    || selBridgeFromNet?.agents.find((a) => a.id === selBridge?.fromAgentId);
  const selBridgeTo = agents.find((a) => a.id === selBridge?.toAgentId)
    || selBridgeToNet?.agents.find((a) => a.id === selBridge?.toAgentId);
  const bridgeFromNet = bridgeForm.fromNet ? networks.find((n) => n.id === bridgeForm.fromNet) : null;
  const bridgeToNet = bridgeForm.toNet ? networks.find((n) => n.id === bridgeForm.toNet) : null;

  return {
    // Ecosystem object
    ecosystem, setEcosystem,
    // Active network
    activeNetworkId, setActiveNetworkId, activeNetwork,
    // Derived arrays
    networks, bridges, bridgeMessages, activeBridges,
    bridgeForm, setBridgeForm,
    selectedBridge, setSelectedBridge,
    bridgeMsgInput, setBridgeMsgInput,
    bridgeSending, msgEndRef,
    // Computed
    selBridge, selBridgeFromNet, selBridgeToNet, selBridgeFrom, selBridgeTo,
    bridgeFromNet, bridgeToNet,
    // Actions
    dissolveNetwork,
    createBridge, removeBridge, sendBridgeMessage,
    // Setters (operate on ecosystem internals)
    setNetworks, setBridges,
    setBridgeMessages, setActiveBridges,
  };
}

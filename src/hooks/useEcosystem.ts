import { useState, useEffect, useRef } from "react";
import { useEcosystemStore } from "@/stores";
import type {
  Agent, Channel, Group, Message, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId, Ecosystem, JobRequest,
} from "@/types";
import { NETWORK_COLORS } from "@/constants";
import { generateNetworkDID } from "@/utils/identity";

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

export function useEcosystem({
  addLog, agents, channels, groups, messages,
  setAgents, setChannels, setGroups, setMessages, setView,
}: UseEcosystemDeps, addJob?: (job: JobRequest) => void) {
  // ─── Ecosystem state (backed by Zustand store) ───
  const ecosystem = useEcosystemStore((s) => s.ecosystem);
  const setEcosystem = useEcosystemStore((s) => s.setEcosystem);

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
      // Cascade-by-default for UI-driven dissolves: also remove the
      // network's agents, channels, and groups so they aren't orphaned.
      addJob({
        type: "destroy_network",
        request: { id, cascade: true }
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

/** Inferred return type of {@link useEcosystem}. Prefer this over `any`. */
export type UseEcosystemReturn = ReturnType<typeof useEcosystem>;

import { useState, useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type {
  Agent, Channel, Group, Message, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId,
} from "../types";
import { ROLES, CHANNEL_TYPES, NETWORK_COLORS } from "../constants";
import { generateNetworkDID } from "../utils/identity";
import { callAgentAI } from "../services/ai";

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
}: UseEcosystemDeps) {
  const [ecosystems, setEcosystems] = useLocalStorage<Network[]>("decops_ecosystems", []);
  const [bridges, setBridges] = useLocalStorage<Bridge[]>("decops_bridges", []);
  const [bridgeMessages, setBridgeMessages] = useState<BridgeMessage[]>([]);
  const [activeBridges, setActiveBridges] = useState<Set<string>>(new Set());
  const [ecoSaveName, setEcoSaveName] = useState("");
  const [bridgeForm, setBridgeForm] = useState<BridgeForm>({
    fromNet: "", toNet: "", fromAgent: "", toAgent: "", type: "data",
  });
  const [selectedBridge, setSelectedBridge] = useState<string | null>(null);
  const [bridgeMsgInput, setBridgeMsgInput] = useState("");
  const [bridgeSending, setBridgeSending] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bridgeMessages, selectedBridge]);

  const saveCurrentNetwork = () => {
    if (!ecoSaveName.trim() || agents.length === 0) return;
    const net: Network = {
      id: crypto.randomUUID(), name: ecoSaveName.trim(), did: generateNetworkDID(),
      color: NETWORK_COLORS[ecosystems.length % NETWORK_COLORS.length],
      agents: [...agents], channels: [...channels], groups: [...groups], messages: [...messages],
      createdAt: new Date().toISOString(),
    };
    setEcosystems((prev) => [...prev, net]);
    addLog(`Network "${net.name}" saved -> ${net.did.slice(0, 24)}…`);
    setEcoSaveName("");
  };

  const loadNetwork = (id: string) => {
    const net = ecosystems.find((n) => n.id === id);
    if (!net) return;
    setAgents([...net.agents]);
    setChannels([...net.channels]);
    setGroups([...net.groups]);
    setMessages([...net.messages]);
    addLog(`Loaded network "${net.name}" into workspace`);
    setView("agents");
  };

  const dissolveNetwork = (id: string) => {
    setEcosystems((prev) => prev.filter((n) => n.id !== id));
    setBridges((prev) => prev.filter((b) => b.fromNetworkId !== id && b.toNetworkId !== id));
    addLog("Network dissolved from ecosystem");
  };

  const createBridge = () => {
    const { fromNet, toNet, fromAgent, toAgent, type } = bridgeForm;
    if (!fromNet || !toNet || !fromAgent || !toAgent || fromNet === toNet) return;
    const exists = bridges.some((b) =>
      (b.fromAgentId === fromAgent && b.toAgentId === toAgent) ||
      (b.fromAgentId === toAgent && b.toAgentId === fromAgent)
    );
    if (exists) { addLog("Bridge already exists"); return; }
    const bridge: Bridge = {
      id: crypto.randomUUID(), fromNetworkId: fromNet, toNetworkId: toNet,
      fromAgentId: fromAgent, toAgentId: toAgent,
      type: CHANNEL_TYPES.find((t) => t.id === type) ? type : "data",
      offset: Math.random() * 120, createdAt: new Date().toISOString(),
    };
    setBridges((prev) => [...prev, bridge]);
    const fNet = ecosystems.find((n) => n.id === fromNet);
    const tNet = ecosystems.find((n) => n.id === toNet);
    const fAgent = fNet?.agents.find((a) => a.id === fromAgent);
    const tAgent = tNet?.agents.find((a) => a.id === toAgent);
    addLog(`Bridge: ${fAgent?.name} (${fNet?.name}) <-> ${tAgent?.name} (${tNet?.name})`);
    setBridgeForm({ fromNet: "", toNet: "", fromAgent: "", toAgent: "", type: "data" });
  };

  const removeBridge = (id: string) => {
    setBridges((prev) => prev.filter((b) => b.id !== id));
    if (selectedBridge === id) setSelectedBridge(null);
    addLog("Bridge dissolved");
  };

  const sendBridgeMessage = async () => {
    if (!bridgeMsgInput.trim() || !selectedBridge || bridgeSending) return;
    const bridge = bridges.find((b) => b.id === selectedBridge);
    if (!bridge) return;
    const fromNet = ecosystems.find((n) => n.id === bridge.fromNetworkId);
    const toNet = ecosystems.find((n) => n.id === bridge.toNetworkId);
    const fromAgent = fromNet?.agents.find((a) => a.id === bridge.fromAgentId);
    const toAgent = toNet?.agents.find((a) => a.id === bridge.toAgentId);
    if (!fromAgent || !toAgent) return;

    const msgId = crypto.randomUUID();
    const msg: BridgeMessage = {
      id: msgId, bridgeId: bridge.id, fromId: bridge.fromAgentId, toId: bridge.toAgentId,
      content: bridgeMsgInput.trim(), response: null, status: "sending", ts: Date.now(),
    };
    setBridgeMessages((prev) => [...prev, msg]);
    setBridgeMsgInput("");
    setBridgeSending(true);
    setActiveBridges((prev) => new Set([...prev, bridge.id]));
    addLog(`Bridge msg: ${fromAgent.name} -> ${toAgent.name} (cross-network)`);

    if (toAgent.prompt) {
      const history = bridgeMessages.filter((m) => m.bridgeId === bridge.id);
      const response = await callAgentAI(toAgent, fromAgent, msg.content, bridge.type, history, fromNet?.name);
      setBridgeMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
      addLog(`${toAgent.name} responded across bridge`);
    } else {
      setBridgeMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[No prompt — agent cannot respond]", status: "no-prompt" } : m));
    }
    setBridgeSending(false);
    setTimeout(() => setActiveBridges((prev) => { const n = new Set(prev); n.delete(bridge.id); return n; }), 3000);
  };

  // Computed values
  const selBridge = bridges.find((b) => b.id === selectedBridge);
  const selBridgeFromNet = selBridge ? ecosystems.find((n) => n.id === selBridge.fromNetworkId) : null;
  const selBridgeToNet = selBridge ? ecosystems.find((n) => n.id === selBridge.toNetworkId) : null;
  const selBridgeFrom = selBridgeFromNet?.agents.find((a) => a.id === selBridge?.fromAgentId);
  const selBridgeTo = selBridgeToNet?.agents.find((a) => a.id === selBridge?.toAgentId);
  const bridgeFromNet = bridgeForm.fromNet ? ecosystems.find((n) => n.id === bridgeForm.fromNet) : null;
  const bridgeToNet = bridgeForm.toNet ? ecosystems.find((n) => n.id === bridgeForm.toNet) : null;

  return {
    ecosystems, bridges, bridgeMessages, activeBridges,
    ecoSaveName, setEcoSaveName,
    bridgeForm, setBridgeForm,
    selectedBridge, setSelectedBridge,
    bridgeMsgInput, setBridgeMsgInput,
    bridgeSending, msgEndRef,
    // Computed
    selBridge, selBridgeFromNet, selBridgeToNet, selBridgeFrom, selBridgeTo,
    bridgeFromNet, bridgeToNet,
    // Actions
    saveCurrentNetwork, loadNetwork, dissolveNetwork,
    createBridge, removeBridge, sendBridgeMessage,
    // Setters
    setEcosystems, setBridges,
  };
}

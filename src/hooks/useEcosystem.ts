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
}: UseEcosystemDeps, addJob?: (job: any) => void) {
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
    if (addJob) {
      addJob({
        type: "save_ecosystem",
        request: { name: ecoSaveName.trim() }
      });
    } else {
      // Fallback or Error? Ideally all paths use addJob now.
      // But for safety during migration we can keep old logic or just allow it to fail if addJob missing?
      // Let's assume addJob is provided.
    }
    setEcoSaveName("");
  };

  const loadNetwork = (id: string) => {
    if (addJob) {
      addJob({
        type: "load_ecosystem",
        request: { id }
      });
    }
    // Optimistic / UI side transition?
    // The command executes logic to clear workspace and load data.
    // The View switch might need to happen after?
    // Or we can just switch view proactively.
    setView("agents");
  };

  const dissolveNetwork = (id: string) => {
    if (addJob) {
      addJob({
        type: "delete_ecosystem",
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
    // Rely on Job to update state
    setTimeout(() => setBridgeSending(false), 500);
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
    setBridgeMessages, setActiveBridges,
  };
}

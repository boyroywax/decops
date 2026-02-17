import { useState, useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type {
  Agent, Channel, Group, Message, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId, Ecosystem,
} from "../types";
import { ROLES, CHANNEL_TYPES, NETWORK_COLORS } from "../constants";
import { generateNetworkDID, generateEcosystemDID } from "../utils/identity";
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

  // Legacy storage keys — used only for one-time migration
  const [legacyNetworks, setLegacyNetworks] = useLocalStorage<Network[]>("decops_ecosystems", []);
  const [legacyBridges, setLegacyBridges] = useLocalStorage<Bridge[]>("decops_bridges", []);

  // One-time migration: if legacy keys have data but ecosystem is empty, migrate
  const hasMigrated = useRef(false);
  useEffect(() => {
    if (hasMigrated.current) return;
    if ((legacyNetworks.length > 0 || legacyBridges.length > 0) && ecosystem.networks.length === 0 && ecosystem.bridges.length === 0) {
      hasMigrated.current = true;
      setEcosystem((prev) => ({
        ...prev,
        networks: legacyNetworks,
        bridges: legacyBridges,
      }));
      // Clear legacy keys after migration
      setLegacyNetworks([]);
      setLegacyBridges([]);
      addLog("Migrated legacy ecosystem data into workspace ecosystem.");
    } else {
      hasMigrated.current = true;
    }
  }, [legacyNetworks, legacyBridges, ecosystem]);

  // ─── Derived references for backward compat (views still use these) ───
  const ecosystems = ecosystem.networks;
  const bridges = ecosystem.bridges;

  // ─── Setters that update the nested ecosystem ───
  const setEcosystems = (updater: Network[] | ((prev: Network[]) => Network[])) => {
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

  // ─── Transient UI state (not persisted in ecosystem) ───
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
  }, [ecosystem.bridgeMessages, selectedBridge]);

  // ─── Actions ───

  const saveCurrentNetwork = () => {
    if (!ecoSaveName.trim() || agents.length === 0) return;
    if (addJob) {
      addJob({
        type: "save_ecosystem",
        request: { name: ecoSaveName.trim() }
      });
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
    setTimeout(() => setBridgeSending(false), 500);
  };

  // ─── Computed values ───
  const bridgeMessages = ecosystem.bridgeMessages;
  const selBridge = bridges.find((b) => b.id === selectedBridge);
  const selBridgeFromNet = selBridge ? ecosystems.find((n) => n.id === selBridge.fromNetworkId) : null;
  const selBridgeToNet = selBridge ? ecosystems.find((n) => n.id === selBridge.toNetworkId) : null;
  const selBridgeFrom = selBridgeFromNet?.agents.find((a) => a.id === selBridge?.fromAgentId);
  const selBridgeTo = selBridgeToNet?.agents.find((a) => a.id === selBridge?.toAgentId);
  const bridgeFromNet = bridgeForm.fromNet ? ecosystems.find((n) => n.id === bridgeForm.fromNet) : null;
  const bridgeToNet = bridgeForm.toNet ? ecosystems.find((n) => n.id === bridgeForm.toNet) : null;

  return {
    // Ecosystem object
    ecosystem, setEcosystem,
    // Backward-compat derived arrays
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
    // Setters (operate on ecosystem internals)
    setEcosystems, setBridges,
    setBridgeMessages, setActiveBridges,
  };
}

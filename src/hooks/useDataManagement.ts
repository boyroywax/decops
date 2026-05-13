import { useCallback } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge } from "@/types";

interface DataManagementDeps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  networks: Network[];
  bridges: Bridge[];
  setAgents: (val: Agent[]) => void;
  setChannels: (val: Channel[]) => void;
  setGroups: (val: Group[]) => void;
  setMessages: (val: Message[]) => void;
  setNetworks?: (val: Network[]) => void;
  setBridges?: (val: Bridge[]) => void;
}

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function useDataManagement(deps: DataManagementDeps) {
  const {
    agents, channels, groups, messages, networks, bridges,
    setAgents, setChannels, setGroups, setMessages, setNetworks, setBridges,
  } = deps;

  const exportWorkspace = useCallback(() => {
    downloadJSON({
      version: "1.0",
      type: "workspace",
      exportedAt: new Date().toISOString(),
      data: { agents, channels, groups, messages, networks, bridges },
    }, `decops-workspace-${Date.now()}.json`);
  }, [agents, channels, groups, messages, networks, bridges]);

  const fullBackup = useCallback(() => {
    downloadJSON({
      version: "1.0",
      type: "full-backup",
      exportedAt: new Date().toISOString(),
      data: {
        agents,
        channels,
        groups,
        messages,
        networks,
        bridges,
      },
    }, `decops-full-backup-${Date.now()}.json`);
  }, [agents, channels, groups, messages, networks, bridges]);

  const processImport = useCallback((json: unknown): { success: boolean; message: string } => {
    if (!isRecord(json) || !isRecord(json.data)) {
      return { success: false, message: "Invalid file format (missing data field)" };
    }

    const type = typeof json.type === "string" ? json.type : undefined;
    const data = json.data;

    if (type === "full-backup") {
      // Support both old nested format and new flat format
      const ws = isRecord(data.workspace) ? data.workspace : data;
      const eco = isRecord(data.ecosystem) ? data.ecosystem : data;
      setAgents(asArray<Agent>(ws.agents));
      setChannels(asArray<Channel>(ws.channels));
      setGroups(asArray<Group>(ws.groups));
      setMessages(asArray<Message>(ws.messages));
      if (setNetworks && setBridges) {
        setNetworks(asArray<Network>(eco.networks || eco.ecosystems));
        setBridges(asArray<Bridge>(eco.bridges));
      }
    } else if (type === "workspace") {
      setAgents(asArray<Agent>(data.agents));
      setChannels(asArray<Channel>(data.channels));
      setGroups(asArray<Group>(data.groups));
      setMessages(asArray<Message>(data.messages));
      // New workspace exports include networks/bridges
      if (setNetworks && (data.networks || data.ecosystems)) {
        setNetworks(asArray<Network>(data.networks || data.ecosystems));
      }
      if (setBridges && data.bridges) {
        setBridges(asArray<Bridge>(data.bridges));
      }
    } else if (type === "ecosystem" && setNetworks && setBridges) {
      // Legacy ecosystem-only imports
      setNetworks(asArray<Network>(data.networks || data.ecosystems));
      setBridges(asArray<Bridge>(data.bridges));
    } else {
      return { success: false, message: "Unknown or unsupported file type" };
    }

    return { success: true, message: `Loaded data from ${type || "file"}.` };
  }, [setAgents, setChannels, setGroups, setMessages, setNetworks, setBridges]);

  const resetAllData = useCallback(() => {
    localStorage.clear();
    window.location.reload();
  }, []);

  return {
    exportWorkspace,
    fullBackup,
    processImport,
    resetAllData,
  };
}

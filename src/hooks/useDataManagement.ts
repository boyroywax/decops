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

  const processImport = useCallback((json: any): { success: boolean; message: string } => {
    if (!json.data) {
      return { success: false, message: "Invalid file format (missing data field)" };
    }

    if (json.type === "full-backup") {
      // Support both old nested format and new flat format
      const ws = json.data.workspace || json.data;
      const eco = json.data.ecosystem || json.data;
      setAgents(ws.agents || []);
      setChannels(ws.channels || []);
      setGroups(ws.groups || []);
      setMessages(ws.messages || []);
      if (setNetworks && setBridges) {
        setNetworks(eco.networks || eco.ecosystems || []);
        setBridges(eco.bridges || []);
      }
    } else if (json.type === "workspace") {
      setAgents(json.data.agents || []);
      setChannels(json.data.channels || []);
      setGroups(json.data.groups || []);
      setMessages(json.data.messages || []);
      // New workspace exports include networks/bridges
      if (setNetworks && (json.data.networks || json.data.ecosystems)) {
        setNetworks(json.data.networks || json.data.ecosystems || []);
      }
      if (setBridges && json.data.bridges) {
        setBridges(json.data.bridges || []);
      }
    } else if (json.type === "ecosystem" && setNetworks && setBridges) {
      // Legacy ecosystem-only imports
      setNetworks(json.data.networks || json.data.ecosystems || []);
      setBridges(json.data.bridges || []);
    } else {
      return { success: false, message: "Unknown or unsupported file type" };
    }

    return { success: true, message: `Loaded data from ${json.type || "file"}.` };
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

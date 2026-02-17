import { useCallback } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge } from "../types";

interface DataManagementDeps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  ecosystems: Network[];
  bridges: Bridge[];
  setAgents: (val: Agent[]) => void;
  setChannels: (val: Channel[]) => void;
  setGroups: (val: Group[]) => void;
  setMessages: (val: Message[]) => void;
  setEcosystems?: (val: Network[]) => void;
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
    agents, channels, groups, messages, ecosystems, bridges,
    setAgents, setChannels, setGroups, setMessages, setEcosystems, setBridges,
  } = deps;

  const exportWorkspace = useCallback(() => {
    downloadJSON({
      version: "1.0",
      type: "workspace",
      exportedAt: new Date().toISOString(),
      data: { agents, channels, groups, messages },
    }, `decops-workspace-${Date.now()}.json`);
  }, [agents, channels, groups, messages]);

  const exportEcosystem = useCallback(() => {
    downloadJSON({
      version: "1.0",
      type: "ecosystem",
      exportedAt: new Date().toISOString(),
      data: { ecosystems, bridges },
    }, `decops-ecosystem-${Date.now()}.json`);
  }, [ecosystems, bridges]);

  const fullBackup = useCallback(() => {
    downloadJSON({
      version: "1.0",
      type: "full-backup",
      exportedAt: new Date().toISOString(),
      data: {
        workspace: { agents, channels, groups, messages },
        ecosystem: { ecosystems, bridges },
      },
    }, `decops-full-backup-${Date.now()}.json`);
  }, [agents, channels, groups, messages, ecosystems, bridges]);

  const processImport = useCallback((json: any): { success: boolean; message: string } => {
    if (!json.data) {
      return { success: false, message: "Invalid file format (missing data field)" };
    }

    if (json.type === "full-backup") {
      if (json.data.workspace) {
        setAgents(json.data.workspace.agents || []);
        setChannels(json.data.workspace.channels || []);
        setGroups(json.data.workspace.groups || []);
        setMessages(json.data.workspace.messages || []);
      }
      if (json.data.ecosystem && setEcosystems && setBridges) {
        setEcosystems(json.data.ecosystem.ecosystems || []);
        setBridges(json.data.ecosystem.bridges || []);
      }
    } else if (json.type === "workspace") {
      setAgents(json.data.agents || []);
      setChannels(json.data.channels || []);
      setGroups(json.data.groups || []);
      setMessages(json.data.messages || []);
    } else if (json.type === "ecosystem" && setEcosystems && setBridges) {
      setEcosystems(json.data.ecosystems || []);
      setBridges(json.data.bridges || []);
    } else {
      return { success: false, message: "Unknown or unsupported file type" };
    }

    return { success: true, message: `Loaded data from ${json.type || "file"}.` };
  }, [setAgents, setChannels, setGroups, setMessages, setEcosystems, setBridges]);

  const resetAllData = useCallback(() => {
    if (confirm("Are you sure? This will WIPE ALL DATA from LocalStorage. This action cannot be undone.")) {
      localStorage.clear();
      window.location.reload();
    }
  }, []);

  return {
    exportWorkspace,
    exportEcosystem,
    fullBackup,
    processImport,
    resetAllData,
  };
}

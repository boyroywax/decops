import { useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Agent, NewAgentForm, JobRequest } from "../types";

export function useAgents(addJob: (job: JobRequest) => void) {
    const [agents, setAgents] = useLocalStorage<Agent[]>("decops_agents", []);

    // UI State
    const [showCreate, setShowCreate] = useState(false);
    const [newAgent, setNewAgent] = useState<NewAgentForm>({ name: "", role: "researcher", prompt: "", templateIdx: 0, networkId: "" });
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
    const [editPromptText, setEditPromptText] = useState("");

    const createAgent = () => {
        if (!newAgent.name.trim() || !newAgent.networkId) return;
        addJob({
            type: "create_agent",
            request: {
                name: newAgent.name.trim(),
                role: newAgent.role,
                prompt: newAgent.prompt.trim(),
                networkId: newAgent.networkId
            }
        });
        setNewAgent({ name: "", role: "researcher", prompt: "", templateIdx: 0, networkId: newAgent.networkId });
        setShowCreate(false);
    };

    const updateAgentPrompt = (id: string) => {
        if (!editPromptText.trim()) return;
        addJob({
            type: "update_agent_prompt",
            request: { id, prompt: editPromptText.trim() }
        });
        setEditingPrompt(null);
        setEditPromptText("");
    };

    const removeAgent = (id: string) => {
        addJob({ type: "delete_agent", request: { id } });
        if (selectedAgent === id) setSelectedAgent(null);
    };

    const removeAgents = (ids: Set<string>) => {
        addJob({ type: "bulk_delete", request: { type: "agents", ids: Array.from(ids) } });
        if (selectedAgent && ids.has(selectedAgent)) setSelectedAgent(null);
    };

    return {
        agents, setAgents,
        showCreate, setShowCreate,
        newAgent, setNewAgent,
        selectedAgent, setSelectedAgent,
        editingPrompt, setEditingPrompt,
        editPromptText, setEditPromptText,
        createAgent, updateAgentPrompt, removeAgent, removeAgents
    };
}

import { useState, useRef, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type {
  Agent, Channel, Group, Message,
  NewAgentForm, ChannelForm, GroupForm,
  ChannelTypeId,
} from "../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS } from "../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../utils/identity";
import { callAgentAI } from "../services/ai";

export function useWorkspace(addLog: (msg: string) => void, addJob: (job: any) => void) {
  const [agents, setAgents] = useLocalStorage<Agent[]>("decops_agents", []);
  const [channels, setChannels] = useLocalStorage<Channel[]>("decops_channels", []);
  const [groups, setGroups] = useLocalStorage<Group[]>("decops_groups", []);
  const [messages, setMessages] = useLocalStorage<Message[]>("decops_messages", []);

  // UI state
  const [showCreate, setShowCreate] = useState(false);
  const [newAgent, setNewAgent] = useState<NewAgentForm>({ name: "", role: "researcher", prompt: "", templateIdx: 0 });
  const [channelForm, setChannelForm] = useState<ChannelForm>({ from: "", to: "", type: "data" });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupForm>({ name: "", governance: "majority", members: [], threshold: 2 });
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // Message state
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  // activeChannels tracks channels with active AI processing for UI feedback
  const [activeChannels, setActiveChannels] = useState<Set<string>>(new Set());
  const [broadcastGroup, setBroadcastGroup] = useState<string | null>(null);
  const [broadcastInput, setBroadcastInput] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannel]);

  // Actions now routed via Job Queue

  // Agent Actions
  const createAgent = () => {
    if (!newAgent.name.trim()) return;
    addJob({
      type: "create_agent",
      request: {
        name: newAgent.name.trim(),
        role: newAgent.role,
        prompt: newAgent.prompt.trim()
      }
    });
    setNewAgent({ name: "", role: "researcher", prompt: "", templateIdx: 0 });
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

  // Channel Actions
  const createChannel = () => {
    if (!channelForm.from || !channelForm.to || channelForm.from === channelForm.to) return;
    addJob({
      type: "create_channel",
      request: {
        from: channelForm.from,
        to: channelForm.to,
        type: channelForm.type
      }
    });
    setChannelForm({ from: "", to: "", type: "data" });
  };

  const removeChannel = (id: string) => {
    addJob({ type: "delete_channel", request: { id } });
    if (activeChannel === id) setActiveChannel(null);
  };

  // Group Actions
  const createGroup = () => {
    if (!groupForm.name.trim() || groupForm.members.length < 2) return;
    addJob({
      type: "create_group",
      request: {
        name: groupForm.name.trim(),
        members: groupForm.members,
        governance: groupForm.governance
      }
    });
    setGroupForm({ name: "", governance: "majority", members: [], threshold: 2 });
    setShowGroupCreate(false);
  };

  const removeGroup = (id: string) => {
    addJob({ type: "delete_group", request: { id } });
    if (selectedGroup === id) setSelectedGroup(null);
  };

  const toggleGroupMember = (agentId: string) => {
    // This is UI state first (form), OR modification of existing group?
    // The GroupsView uses this for the FORM construction typically? 
    // Let's check: GroupsView passes 'toggleGroupMember' to 'GroupCreator'?
    // Actually GroupsView uses `toggleGroupMember` to edit `groupForm`.
    // BUT there is also `toggleGroupMemberCommand` for modifying EXISTING groups.
    // The hook `toggleGroupMember` in previous version updated `groupForm` state!
    // See lines 137-144 in original file.
    // It updates `groupForm`. It does NOT update `groups` directly.
    // So this is a LOCAL UI helper, unrelated to commands. 
    // I should KEEP it as local state manipulation.

    setGroupForm((prev) => ({
      ...prev,
      members: prev.members.includes(agentId)
        ? prev.members.filter((m) => m !== agentId)
        : [...prev.members, agentId],
    }));
  };

  // Messaging Actions
  const channelMessages = activeChannel ? messages.filter((m) => m.channelId === activeChannel) : [];

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChannel || sending) return;
    const ch = channels.find((c) => c.id === activeChannel);
    if (!ch) return;
    const fromAgent = agents.find((a) => a.id === ch.from);
    const toAgent = agents.find((a) => a.id === ch.to);
    if (!fromAgent || !toAgent) return;

    // We can't do full optimistic UI easily without race conditions on ID or duplication.
    // For now, we'll set 'sending' true, clear input, and fire job.
    // The Job will create the message.

    setSending(true);
    addJob({
      type: "send_message",
      request: {
        from_agent_name: fromAgent.name, // Command expects names currently? Let's check command definition.
        to_agent_name: toAgent.name,
        message: msgInput.trim()
      }
    });

    setMsgInput("");
    // We rely on the Job to add the message to state.
    // We can use a timeout to reset 'sending' or listen to changes?
    setTimeout(() => setSending(false), 500);
  };

  const sendBroadcast = async () => {
    if (!broadcastInput.trim() || !broadcastGroup || broadcasting) return;

    setBroadcasting(true);
    addJob({
      type: "broadcast_message",
      request: {
        group_id: broadcastGroup,
        message: broadcastInput.trim()
      }
    });

    setBroadcastInput("");
    setTimeout(() => setBroadcasting(false), 500);
  };

  const clearWorkspace = () => {
    addJob({ type: "reset_workspace", request: {} });
  };

  // Bulk delete
  const removeAgents = (ids: Set<string>) => {
    addJob({ type: "bulk_delete", request: { type: "agents", ids: Array.from(ids) } });
    if (selectedAgent && ids.has(selectedAgent)) setSelectedAgent(null);
  };
  const removeChannels = (ids: Set<string>) => {
    addJob({ type: "bulk_delete", request: { type: "channels", ids: Array.from(ids) } });
    if (activeChannel && ids.has(activeChannel)) setActiveChannel(null);
  };
  const removeGroups = (ids: Set<string>) => {
    addJob({ type: "bulk_delete", request: { type: "groups", ids: Array.from(ids) } });
    if (selectedGroup && ids.has(selectedGroup)) setSelectedGroup(null);
  };
  const removeMessages = (ids: Set<string>) => {
    addJob({ type: "bulk_delete", request: { type: "messages", ids: Array.from(ids) } });
  };

  // Active channel computed values
  const acCh = channels.find((c) => c.id === activeChannel);
  const acFrom = acCh ? agents.find((a) => a.id === acCh.from) : null;
  const acTo = acCh ? agents.find((a) => a.id === acCh.to) : null;

  return {
    // Core data
    agents, setAgents,
    channels, setChannels,
    groups, setGroups,
    messages, setMessages,
    // Agent UI
    showCreate, setShowCreate,
    newAgent, setNewAgent,
    selectedAgent, setSelectedAgent,
    editingPrompt, setEditingPrompt,
    editPromptText, setEditPromptText,
    // Channel UI
    channelForm, setChannelForm,
    // Group UI
    showGroupCreate, setShowGroupCreate,
    groupForm, setGroupForm,
    selectedGroup, setSelectedGroup,
    // Message UI
    activeChannel, setActiveChannel,
    msgInput, setMsgInput,
    sending,
    activeChannels, setActiveChannels,
    broadcastGroup, setBroadcastGroup,
    broadcastInput, setBroadcastInput,
    broadcasting,
    msgEndRef,
    channelMessages,
    acCh, acFrom, acTo,
    // Actions
    createAgent, updateAgentPrompt, removeAgent,
    createChannel, removeChannel,
    createGroup, removeGroup, toggleGroupMember,
    sendMessage, sendBroadcast,
    clearWorkspace,
    // Bulk actions
    removeAgents, removeChannels, removeGroups, removeMessages,
  };
}


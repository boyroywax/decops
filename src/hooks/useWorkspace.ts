import { useState, useRef, useEffect } from "react";
import type {
  Agent, Channel, Group, Message,
  NewAgentForm, ChannelForm, GroupForm,
  ChannelTypeId,
} from "../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS } from "../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../utils/identity";
import { callAgentAI } from "../services/ai";

export function useWorkspace(addLog: (msg: string) => void) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

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
  const [activeChannels, setActiveChannels] = useState<Set<string>>(new Set());
  const [broadcastGroup, setBroadcastGroup] = useState<string | null>(null);
  const [broadcastInput, setBroadcastInput] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannel]);

  // Agent CRUD
  const createAgent = () => {
    if (!newAgent.name.trim()) return;
    const agent: Agent = {
      id: crypto.randomUUID(), name: newAgent.name.trim(), role: newAgent.role,
      prompt: newAgent.prompt.trim(), did: generateDID(), keys: generateKeyPair(),
      createdAt: new Date().toISOString(), status: "active",
    };
    setAgents((prev) => [...prev, agent]);
    addLog(`Agent "${agent.name}" created → ${agent.did.slice(0, 20)}…`);
    if (agent.prompt) addLog(`Prompt loaded (${agent.prompt.length} chars)`);
    setNewAgent({ name: "", role: "researcher", prompt: "", templateIdx: 0 });
    setShowCreate(false);
  };

  const updateAgentPrompt = (id: string) => {
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, prompt: editPromptText.trim() } : a));
    addLog(`Prompt updated for "${agents.find((a) => a.id === id)?.name}"`);
    setEditingPrompt(null);
    setEditPromptText("");
  };

  const removeAgent = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setChannels((prev) => prev.filter((c) => c.from !== id && c.to !== id));
    setGroups((prev) => prev.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })));
    if (selectedAgent === id) setSelectedAgent(null);
    addLog(`Agent "${agent?.name}" revoked`);
  };

  // Channel CRUD
  const createChannel = () => {
    if (!channelForm.from || !channelForm.to || channelForm.from === channelForm.to) return;
    const exists = channels.some((c) =>
      (c.from === channelForm.from && c.to === channelForm.to) ||
      (c.from === channelForm.to && c.to === channelForm.from)
    );
    if (exists) { addLog("Channel already exists"); return; }
    const ch: Channel = {
      id: crypto.randomUUID(), from: channelForm.from, to: channelForm.to,
      type: channelForm.type, offset: Math.random() * 120, createdAt: new Date().toISOString(),
    };
    setChannels((prev) => [...prev, ch]);
    addLog(`P2P channel: ${agents.find(a => a.id === channelForm.from)?.name} ⟷ ${agents.find(a => a.id === channelForm.to)?.name}`);
    setChannelForm({ from: "", to: "", type: "data" });
  };

  const removeChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    if (activeChannel === id) setActiveChannel(null);
    addLog("Channel dissolved");
  };

  // Group CRUD
  const createGroup = () => {
    if (!groupForm.name.trim() || groupForm.members.length < 2) return;
    const group: Group = {
      id: crypto.randomUUID(), name: groupForm.name.trim(), governance: groupForm.governance,
      members: [...groupForm.members], threshold: groupForm.threshold,
      did: generateGroupDID(), color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    setGroups((prev) => [...prev, group]);
    addLog(`Group "${group.name}" formed`);
    const newCh: Channel[] = [];
    for (let i = 0; i < group.members.length; i++) {
      for (let j = i + 1; j < group.members.length; j++) {
        const exists = channels.some((c) =>
          (c.from === group.members[i] && c.to === group.members[j]) ||
          (c.from === group.members[j] && c.to === group.members[i])
        );
        if (!exists) {
          newCh.push({
            id: crypto.randomUUID(), from: group.members[i], to: group.members[j],
            type: "consensus", offset: Math.random() * 120, createdAt: new Date().toISOString(),
          });
        }
      }
    }
    if (newCh.length) {
      setChannels((prev) => [...prev, ...newCh]);
      addLog(`Auto-established ${newCh.length} consensus channels`);
    }
    setGroupForm({ name: "", governance: "majority", members: [], threshold: 2 });
    setShowGroupCreate(false);
  };

  const removeGroup = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    if (selectedGroup === id) setSelectedGroup(null);
    addLog("Group dissolved");
  };

  const toggleGroupMember = (agentId: string) => {
    setGroupForm((prev) => ({
      ...prev,
      members: prev.members.includes(agentId)
        ? prev.members.filter((m) => m !== agentId)
        : [...prev.members, agentId],
    }));
  };

  // Messaging
  const channelMessages = activeChannel ? messages.filter((m) => m.channelId === activeChannel) : [];

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChannel || sending) return;
    const ch = channels.find((c) => c.id === activeChannel);
    if (!ch) return;
    const fromAgent = agents.find((a) => a.id === ch.from);
    const toAgent = agents.find((a) => a.id === ch.to);
    if (!fromAgent || !toAgent) return;
    const msgId = crypto.randomUUID();
    const msg: Message = {
      id: msgId, channelId: activeChannel, fromId: ch.from, toId: ch.to,
      content: msgInput.trim(), response: null, status: "sending", ts: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setMsgInput("");
    setSending(true);
    setActiveChannels((prev) => new Set([...prev, activeChannel]));
    addLog(`${fromAgent.name} → ${toAgent.name}: message sent`);
    if (toAgent.prompt) {
      const history = messages.filter((m) => m.channelId === activeChannel);
      const response = await callAgentAI(toAgent, fromAgent, msg.content, ch.type, history);
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
      addLog(`${toAgent.name} responded (${response.length} chars)`);
    } else {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[Agent has no prompt]", status: "no-prompt" } : m));
    }
    setSending(false);
    setTimeout(() => setActiveChannels((prev) => { const n = new Set(prev); n.delete(activeChannel); return n; }), 3000);
  };

  const sendBroadcast = async () => {
    if (!broadcastInput.trim() || !broadcastGroup || broadcasting) return;
    const group = groups.find((g) => g.id === broadcastGroup);
    if (!group || group.members.length < 2) return;
    setBroadcasting(true);
    const senderId = group.members[0];
    const sender = agents.find((a) => a.id === senderId);
    addLog(`Broadcasting to "${group.name}"...`);
    for (let i = 1; i < group.members.length; i++) {
      const receiverId = group.members[i];
      const receiver = agents.find((a) => a.id === receiverId);
      const ch = channels.find((c) =>
        (c.from === senderId && c.to === receiverId) ||
        (c.from === receiverId && c.to === senderId)
      );
      if (!ch || !receiver) continue;
      const msgId = crypto.randomUUID();
      const msg: Message = {
        id: msgId, channelId: ch.id, fromId: senderId, toId: receiverId,
        content: `[GROUP BROADCAST — ${group.name}] ${broadcastInput.trim()}`,
        response: null, status: "sending", ts: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      setActiveChannels((prev) => new Set([...prev, ch.id]));
      if (receiver.prompt) {
        const response = await callAgentAI(receiver, sender!, msg.content, ch.type, []);
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
        addLog(`${receiver.name} responded to broadcast`);
      } else {
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[No prompt]", status: "no-prompt" } : m));
      }
      setTimeout(() => setActiveChannels((prev) => { const n = new Set(prev); n.delete(ch.id); return n; }), 3000);
    }
    setBroadcasting(false);
    setBroadcastInput("");
    addLog("Broadcast complete");
  };

  const clearWorkspace = () => {
    setAgents([]);
    setChannels([]);
    setGroups([]);
    setMessages([]);
    addLog("Workspace cleared");
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
  };
}

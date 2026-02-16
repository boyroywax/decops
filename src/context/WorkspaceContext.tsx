import React, { createContext, useContext, ReactNode } from 'react';
import { useAgents } from '../hooks/useAgents';
import { useChannels } from '../hooks/useChannels';
import { useGroups } from '../hooks/useGroups';
import { useMessages } from '../hooks/useMessages';
import type { Agent, Channel, Group, Message, NewAgentForm, ChannelForm, GroupForm } from '../types';

export interface WorkspaceContextType {
    // Agents
    agents: Agent[];
    setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
    showCreate: boolean;
    setShowCreate: React.Dispatch<React.SetStateAction<boolean>>;
    newAgent: NewAgentForm;
    setNewAgent: React.Dispatch<React.SetStateAction<NewAgentForm>>;
    selectedAgent: string | null;
    setSelectedAgent: React.Dispatch<React.SetStateAction<string | null>>;
    editingPrompt: string | null;
    setEditingPrompt: React.Dispatch<React.SetStateAction<string | null>>;
    editPromptText: string;
    setEditPromptText: React.Dispatch<React.SetStateAction<string>>;
    createAgent: () => void;
    updateAgentPrompt: (id: string) => void;
    removeAgent: (id: string) => void;
    removeAgents: (ids: Set<string>) => void;

    // Channels
    channels: Channel[];
    setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
    channelForm: ChannelForm;
    setChannelForm: React.Dispatch<React.SetStateAction<ChannelForm>>;
    activeChannel: string | null;
    setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
    activeChannels: Set<string>;
    setActiveChannels: React.Dispatch<React.SetStateAction<Set<string>>>;
    createChannel: () => void;
    removeChannel: (id: string) => void;
    removeChannels: (ids: Set<string>) => void;

    // Groups
    groups: Group[];
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    showGroupCreate: boolean;
    setShowGroupCreate: React.Dispatch<React.SetStateAction<boolean>>;
    groupForm: GroupForm;
    setGroupForm: React.Dispatch<React.SetStateAction<GroupForm>>;
    selectedGroup: string | null;
    setSelectedGroup: React.Dispatch<React.SetStateAction<string | null>>;
    broadcastGroup: string | null;
    setBroadcastGroup: React.Dispatch<React.SetStateAction<string | null>>;
    createGroup: () => void;
    removeGroup: (id: string) => void;
    removeGroups: (ids: Set<string>) => void;
    toggleGroupMember: (id: string) => void;

    // Messages
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    msgInput: string;
    setMsgInput: React.Dispatch<React.SetStateAction<string>>;
    sending: boolean;
    broadcastInput: string;
    setBroadcastInput: React.Dispatch<React.SetStateAction<string>>;
    broadcasting: boolean;
    msgEndRef: React.RefObject<HTMLDivElement | null>;
    channelMessages: Message[];
    sendMessage: () => void;
    sendBroadcast: () => void;
    removeMessages: (ids: Set<string>) => void;

    // Globals
    clearWorkspace: () => void;
    // Computed (from useWorkspace replacement)
    acCh: Channel | undefined;
    acFrom: Agent | undefined;
    acTo: Agent | undefined;

    // Import/Export
    exportWorkspace: () => Omit<import('../types').Workspace, 'metadata'>;
    importWorkspace: (data: Omit<import('../types').Workspace, 'metadata'>) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspaceContext() {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error("useWorkspaceContext must be used within a WorkspaceProvider");
    }
    return context;
}

interface WorkspaceProviderProps {
    children: ReactNode;
    addJob: (job: any) => void;
}

export function WorkspaceProvider({ children, addJob }: WorkspaceProviderProps) {
    const agentStore = useAgents(addJob);
    const channelStore = useChannels(addJob);
    const groupStore = useGroups(addJob);

    // Messages needs dependencies from other stores
    const messageStore = useMessages(
        addJob,
        agentStore.agents,
        channelStore.channels,
        channelStore.activeChannel,
        groupStore.broadcastGroup
    );

    const clearWorkspace = () => {
        agentStore.setAgents([]);
        channelStore.setChannels([]);
        groupStore.setGroups([]);
        messageStore.setMessages([]);
    };

    // Computed values for active channel
    const acCh = channelStore.channels.find((c) => c.id === channelStore.activeChannel);
    const acFrom = acCh ? agentStore.agents.find((a) => a.id === acCh.from) : undefined;
    const acTo = acCh ? agentStore.agents.find((a) => a.id === acCh.to) : undefined;

    const exportWorkspace = () => {
        return {
            agents: agentStore.agents,
            channels: channelStore.channels,
            groups: groupStore.groups,
            messages: messageStore.messages
        };
    };

    const importWorkspace = (data: Omit<import('../types').Workspace, 'metadata'>) => {
        agentStore.setAgents(data.agents || []);
        channelStore.setChannels(data.channels || []);
        groupStore.setGroups(data.groups || []);
        messageStore.setMessages(data.messages || []);
    };

    const value: WorkspaceContextType = {
        ...agentStore,
        ...channelStore,
        ...groupStore,
        ...messageStore,
        clearWorkspace,
        acCh, acFrom, acTo,
        exportWorkspace,
        importWorkspace
    };

    return (
        <WorkspaceContext.Provider value={value}>
            {children}
        </WorkspaceContext.Provider>
    );
}

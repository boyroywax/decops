/**
 * Zustand Workspace Store — single source of truth for workspace entities.
 *
 * Replaces: useAgents, useChannels, useGroups, useMessages, WorkspaceContext.
 * Persists agents/channels/groups/messages to localStorage under namespaced keys.
 *
 * Design notes:
 *  - Persisted state = entity arrays (agents, channels, groups, messages).
 *  - Transient UI state (forms, selections) is intentionally excluded — that stays in components.
 *  - All mutations are synchronous actions on the store.
 *  - Computed values (e.g. network-filtered entities) are derived via selectors, NOT stored.
 *  - Commands still dispatch via addJob (external); this store provides the state they read/write.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Agent, Channel, Group, Message } from "@/types";

// ── State shape ──

export interface WorkspaceState {
  // Entity arrays (persisted)
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
}

export interface WorkspaceActions {
  // Setters — accept either a value or an updater function (matching React setState API)
  setAgents: (updater: Agent[] | ((prev: Agent[]) => Agent[])) => void;
  setChannels: (updater: Channel[] | ((prev: Channel[]) => Channel[])) => void;
  setGroups: (updater: Group[] | ((prev: Group[]) => Group[])) => void;
  setMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => void;

  // Convenience actions
  addAgent: (agent: Agent) => void;
  addChannel: (channel: Channel) => void;
  addGroup: (group: Group) => void;
  addMessage: (message: Message) => void;
  removeAgent: (id: string) => void;
  removeChannel: (id: string) => void;
  removeGroup: (id: string) => void;
  removeMessage: (id: string) => void;

  // Bulk operations
  clearWorkspace: () => void;
  importWorkspace: (data: { agents?: Agent[]; channels?: Channel[]; groups?: Group[]; messages?: Message[] }) => void;
  exportWorkspace: () => { agents: Agent[]; channels: Channel[]; groups: Group[]; messages: Message[] };

  // Unread management
  markAsRead: (ids: string[]) => void;
  markChannelRead: (channelId: string, channels: Channel[]) => void;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

// ── Store ──

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    immer((set, get) => ({
      // Initial state
      agents: [],
      channels: [],
      groups: [],
      messages: [],

      // Setters (React setState–compatible API for backward compat with commands)
      setAgents: (updater) =>
        set((state) => {
          state.agents = typeof updater === "function" ? updater(state.agents) : updater;
        }),
      setChannels: (updater) =>
        set((state) => {
          state.channels = typeof updater === "function" ? updater(state.channels) : updater;
        }),
      setGroups: (updater) =>
        set((state) => {
          state.groups = typeof updater === "function" ? updater(state.groups) : updater;
        }),
      setMessages: (updater) =>
        set((state) => {
          state.messages = typeof updater === "function" ? updater(state.messages) : updater;
        }),

      // Convenience single-entity actions
      addAgent: (agent) =>
        set((state) => {
          state.agents.push(agent);
        }),
      addChannel: (channel) =>
        set((state) => {
          state.channels.push(channel);
        }),
      addGroup: (group) =>
        set((state) => {
          state.groups.push(group);
        }),
      addMessage: (message) =>
        set((state) => {
          state.messages.push(message);
        }),
      removeAgent: (id) =>
        set((state) => {
          state.agents = state.agents.filter((a) => a.id !== id);
        }),
      removeChannel: (id) =>
        set((state) => {
          state.channels = state.channels.filter((c) => c.id !== id);
        }),
      removeGroup: (id) =>
        set((state) => {
          state.groups = state.groups.filter((g) => g.id !== id);
        }),
      removeMessage: (id) =>
        set((state) => {
          state.messages = state.messages.filter((m) => m.id !== id);
        }),

      // Bulk operations
      clearWorkspace: () =>
        set((state) => {
          state.agents = [];
          state.channels = [];
          state.groups = [];
          state.messages = [];
        }),

      importWorkspace: (data) =>
        set((state) => {
          if (data.agents) state.agents = data.agents;
          if (data.channels) state.channels = data.channels;
          if (data.groups) state.groups = data.groups;
          if (data.messages) state.messages = data.messages;
        }),

      exportWorkspace: () => {
        const { agents, channels, groups, messages } = get();
        return { agents, channels, groups, messages };
      },

      // Unread management
      markAsRead: (ids) =>
        set((state) => {
          const now = Date.now();
          for (const msg of state.messages) {
            if (ids.includes(msg.id) && !msg.readAt) {
              msg.readAt = now;
            }
          }
        }),

      markChannelRead: (channelId, channels) => {
        const ch = channels.find((c) => c.id === channelId);
        if (!ch) return;
        set((state) => {
          const now = Date.now();
          for (const msg of state.messages) {
            if (
              !msg.readAt &&
              ((msg.fromId === ch.from && msg.toId === ch.to) ||
                (msg.fromId === ch.to && msg.toId === ch.from))
            ) {
              msg.readAt = now;
            }
          }
        });
      },
    })),
    {
      name: "decops_workspace",
      storage: createJSONStorage(() => localStorage),
      // Only persist entity arrays, not transient state
      partialize: (state) => ({
        agents: state.agents,
        channels: state.channels,
        groups: state.groups,
        messages: state.messages,
      }),
    }
  )
);

// ── Migration from legacy useLocalStorage keys ──
// Old hooks stored entities in separate keys: decops_agents, decops_channels, etc.
// This store consolidates them under decops_workspace.
if (typeof window !== "undefined") {
  const hasNewStore = localStorage.getItem("decops_workspace");
  if (!hasNewStore) {
    try {
      const tryParse = (key: string) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      };
      const agents = tryParse("decops_agents");
      const channels = tryParse("decops_channels");
      const groups = tryParse("decops_groups");
      const messages = tryParse("decops_messages");
      if (agents.length || channels.length || groups.length || messages.length) {
        useWorkspaceStore.getState().importWorkspace({ agents, channels, groups, messages });
      }
    } catch {
      // Ignore parse errors — start fresh
    }
  }
  // Clean up old keys regardless
  ["decops_agents", "decops_channels", "decops_groups", "decops_messages"].forEach((k) =>
    localStorage.removeItem(k)
  );
}

// ── Selectors ──
// Use these to derive values from the store. Components subscribe to only the slices they need.

/** Get agents belonging to a specific network */
export const selectAgentsByNetwork = (networkId: string) => (state: WorkspaceState) =>
  state.agents.filter((a) => a.networkId === networkId);

/** Get channels belonging to a specific network */
export const selectChannelsByNetwork = (networkId: string) => (state: WorkspaceState) =>
  state.channels.filter((c) => c.networkId === networkId);

/** Get groups belonging to a specific network */
export const selectGroupsByNetwork = (networkId: string) => (state: WorkspaceState) =>
  state.groups.filter((g) => g.networkId === networkId);

/** Get messages for a specific channel (by from/to pair) */
export const selectChannelMessages = (channelId: string, channels: Channel[]) => (state: WorkspaceState) => {
  const ch = channels.find((c) => c.id === channelId);
  if (!ch) return [];
  return state.messages.filter(
    (m) =>
      (m.fromId === ch.from && m.toId === ch.to) ||
      (m.fromId === ch.to && m.toId === ch.from)
  );
};

/** Count unread messages per channel */
export const selectUnreadCounts = (channels: Channel[]) => (state: WorkspaceState) => {
  const counts: Record<string, number> = {};
  for (const ch of channels) {
    const unread = state.messages.filter(
      (m) =>
        !m.readAt &&
        ((m.fromId === ch.from && m.toId === ch.to) ||
          (m.fromId === ch.to && m.toId === ch.from))
    ).length;
    if (unread > 0) counts[ch.id] = unread;
  }
  return counts;
};

/** Total unread messages across all channels */
export const selectTotalUnread = (state: WorkspaceState) =>
  state.messages.filter((m) => !m.readAt).length;

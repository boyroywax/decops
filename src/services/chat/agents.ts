/**
 * Chat Agents Registry & Store
 *
 * The chat panel is the single interaction surface for AI agents on the platform.
 * Built-in agents (Architect) and toolkit-contributed agents (libp2p, …) register
 * themselves here so the chat panel can:
 *
 *   • Render an agent-specific banner sticky at the top of the conversation
 *     (e.g. live libp2p metrics, Architect phase).
 *   • Show agent-specific quick-action chips on the empty state.
 *   • Route the user's input through the agent's `onSubmit` handler before
 *     falling through to the default workspace chat.
 *   • Be activated/focused programmatically (Ctrl+K, the libp2p Bot button, …)
 *     so any caller can say "open chat focused on agent X".
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { create } from "zustand";

export interface ChatAgentQuickAction {
    label: string;
    /** Text inserted into the input — agent's onSubmit will run on send. */
    prompt?: string;
    /** Optional bespoke handler (e.g. opens a sub-modal). */
    run?: () => void;
}

export interface ChatAgentSubmitContext {
    /** The active conversation id (may be undefined on first message). */
    conversationId?: string;
    /** Append a message to the active conversation (utility from chat panel). */
    appendAssistantMessage?: (content: string) => void;
}

export interface ChatAgent {
    id: string;
    name: string;
    /** Short description shown in banner subtitle / tooltip. */
    description?: string;
    /** Lucide icon component (rendered with GradientIcon). */
    icon?: LucideIcon | ComponentType<{ size?: number; color?: string }>;
    /** [start, end] for GradientIcon. */
    gradient?: [string, string];
    /** Sticky banner shown at the top of the chat conversation when active. */
    banner?: ComponentType<{}>;
    /**
     * Optional welcome panel rendered in place of the generic empty-state
     * when this agent is active and the conversation has no messages yet.
     * The agent uses this to "say the first word" — explain itself, show
     * sample scenarios, etc. — so the user starts the dialogue informed.
     */
    welcome?: ComponentType<{ onPrompt?: (text: string) => void }>;
    /** Suggested prompts shown as chips on the empty state. */
    quickActions?: ChatAgentQuickAction[];
    /** Override input placeholder. */
    placeholder?: string;
    /**
     * When the chat panel is docked left/right, render at this width while
     * this agent is active. Clamped against viewport in the panel. Useful
     * for agents that need a wider canvas (e.g. Architect blueprint cards).
     */
    preferredSideWidth?: number;
    /**
     * If true, activating this agent starts a fresh conversation (the
     * current one is preserved in history). Use for agents whose welcome
     * panel needs an empty stage to "speak first" (Architect). Inline
     * agents (Editor, Studio) leave the active conversation untouched.
     */
    freshConversation?: boolean;
    /**
     * Hook for agent-driven input routing. Return true if handled (chat skips
     * its default workspace chat path); return false/undefined to fall through.
     */
    onSubmit?: (text: string, ctx: ChatAgentSubmitContext) => boolean | Promise<boolean>;
}

interface ChatAgentsState {
    agents: Record<string, ChatAgent>;
    activeAgentId: string | null;
    /** Bumped when somebody asks to focus the chat input (e.g. Cmd+K). */
    focusTick: number;
    /** Bumped when somebody asks to make the chat panel visible. */
    openTick: number;

    register: (agent: ChatAgent) => () => void;
    unregister: (id: string) => void;
    setActive: (id: string | null) => void;
    /** Activate an agent + ensure the chat panel is visible + focus the input. */
    open: (id?: string | null) => void;
    requestFocus: () => void;
    requestOpen: () => void;
}

export const useChatAgentsStore = create<ChatAgentsState>((set, get) => ({
    agents: {},
    activeAgentId: null,
    focusTick: 0,
    openTick: 0,

    register: (agent) => {
        set((s) => ({ agents: { ...s.agents, [agent.id]: agent } }));
        return () => get().unregister(agent.id);
    },

    unregister: (id) => {
        set((s) => {
            const next = { ...s.agents };
            delete next[id];
            return {
                agents: next,
                activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
            };
        });
    },

    setActive: (id) => set({ activeAgentId: id }),

    open: (id) => set((s) => ({
        activeAgentId: id === undefined ? s.activeAgentId : id,
        openTick: s.openTick + 1,
        focusTick: s.focusTick + 1,
    })),

    requestFocus: () => set((s) => ({ focusTick: s.focusTick + 1 })),
    requestOpen: () => set((s) => ({ openTick: s.openTick + 1 })),
}));

/** Convenience hook: read a specific agent definition (reactive). */
export function useChatAgent(id: string | null | undefined): ChatAgent | null {
    return useChatAgentsStore((s) => (id ? s.agents[id] ?? null : null));
}

/** Convenience hook: the currently-active agent or null. */
export function useActiveChatAgent(): ChatAgent | null {
    return useChatAgentsStore((s) => (s.activeAgentId ? s.agents[s.activeAgentId] ?? null : null));
}

/**
 * Imperative helper for non-React callers (event handlers, subscribers).
 * Returns the `open` action, which activates an agent and signals the chat
 * panel to become visible + focused.
 */
export function openChatWithAgent(id: string | null) {
    useChatAgentsStore.getState().open(id);
}

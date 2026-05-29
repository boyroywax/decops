import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/services/ai";
import {
    loadConversations, saveConversations,
    loadActiveId, saveActiveId,
    makeId, deriveTitle,
} from "@/components/chat/utils";
import type { Conversation } from "@/components/chat/types";
import { useChatAgentsStore } from "@/services/chat/agents";

/**
 * Hook that encapsulates conversation CRUD, persistence, and scroll management.
 *
 * Conversations are scoped per-workspace: when `workspaceId` changes, the hook
 * loads that workspace's saved conversations and active id from localStorage.
 */
export function useConversations(workspaceId?: string | null) {
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        const initial = loadConversations(workspaceId);
        // One-time migration: if this workspace has no convos yet but there
        // are legacy global ones, adopt them for this workspace.
        if (workspaceId && initial.length === 0) {
            const legacy = loadConversations(null);
            if (legacy.length > 0) {
                saveConversations(legacy, workspaceId);
                const legacyActive = loadActiveId(null);
                if (legacyActive) saveActiveId(legacyActive, workspaceId);
                // Clear legacy keys so future workspaces start clean
                try {
                    localStorage.removeItem("decops_chat_conversations");
                    localStorage.removeItem("decops_chat_active_id");
                } catch { /* ignore */ }
                return legacy;
            }
        }
        return initial;
    });
    const [activeId, setActiveId] = useState<string | null>(() => loadActiveId(workspaceId));
    const [showConvos, setShowConvos] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const initialScrollDone = useRef(false);

    // Track the workspace currently reflected in state so persistence effects
    // don't accidentally write the previous workspace's conversations into the
    // new workspace's storage key during the swap.
    const currentWorkspaceRef = useRef<string | null | undefined>(workspaceId);

    // ── Workspace switch: reload conversations and active id ──
    useEffect(() => {
        if (currentWorkspaceRef.current === workspaceId) return;
        currentWorkspaceRef.current = workspaceId;
        setConversations(loadConversations(workspaceId));
        setActiveId(loadActiveId(workspaceId));
        setShowConvos(false);
        initialScrollDone.current = false;
    }, [workspaceId]);

    // Derive active conversation
    const active = conversations.find(c => c.id === activeId) || null;
    const messages = active?.messages || [];

    // ── Persistence (only writes for the current workspace) ──
    useEffect(() => {
        if (currentWorkspaceRef.current !== workspaceId) return;
        saveConversations(conversations, workspaceId);
    }, [conversations, workspaceId]);

    useEffect(() => {
        if (currentWorkspaceRef.current !== workspaceId) return;
        saveActiveId(activeId, workspaceId);
    }, [activeId, workspaceId]);

    // ── Scroll management ──
    useEffect(() => { initialScrollDone.current = false; }, [activeId]);

    useEffect(() => {
        if (!initialScrollDone.current && messages.length > 0) {
            requestAnimationFrame(() => {
                endRef.current?.scrollIntoView({ behavior: "instant" });
            });
            initialScrollDone.current = true;
        }
    }, [messages.length]);

    // ── CRUD ──
    const updateConversation = useCallback((id: string, msgs: ChatMessage[]) => {
        // Stamp authorship + creation time on assistant messages that
        // haven't been tagged yet. Capturing this at persistence keeps
        // multi-bot conversations correctly themed even after the
        // operator switches the active chat agent.
        const activeAgentId = useChatAgentsStore.getState().activeAgentId;
        const now = Date.now();
        const stamped = msgs.map((m) => {
            if (m.role !== "assistant") return m;
            const next: ChatMessage = { ...m };
            if (next.agentId === undefined && activeAgentId) next.agentId = activeAgentId;
            if (next.createdAt === undefined) next.createdAt = now;
            return next;
        });
        setConversations(prev => prev.map(c =>
            c.id === id
                ? { ...c, messages: stamped, title: deriveTitle(stamped), updatedAt: Date.now() }
                : c
        ));
    }, []);

    const createNewChat = useCallback(() => {
        const id = makeId();
        const convo: Conversation = {
            id,
            title: "New Chat",
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        setConversations(prev => [convo, ...prev]);
        setActiveId(id);
        setShowConvos(false);
    }, []);

    const switchTo = useCallback((id: string) => {
        setActiveId(id);
        setShowConvos(false);
    }, []);

    /** Open (or create) the agent-DM conversation for `agentId`. Returns
     *  the conversation id that was activated. Ecosystem-tagged
     *  conversations are hidden from the regular Conversations list and
     *  are routed through the EcosystemPanel instead. */
    const openAgentDM = useCallback((agentId: string, agentName: string) => {
        let targetId: string | null = null;
        setConversations(prev => {
            const existing = prev.find(c =>
                c.ecosystemKind === "agent-dm" && c.ecosystemId === agentId
            );
            if (existing) {
                targetId = existing.id;
                return prev;
            }
            const id = makeId();
            targetId = id;
            const convo: Conversation = {
                id,
                title: `DM: ${agentName}`,
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                ecosystemKind: "agent-dm",
                ecosystemId: agentId,
            };
            return [convo, ...prev];
        });
        // setConversations is sync (React batches), but the setter above
        // captures targetId via closure — read it on next tick.
        queueMicrotask(() => {
            if (targetId) {
                setActiveId(targetId);
                setShowConvos(false);
                initialScrollDone.current = false;
            }
        });
    }, []);

    /** Open (or create) the group-broadcast conversation for `groupId`. */
    const openBroadcast = useCallback((groupId: string, groupName: string) => {
        let targetId: string | null = null;
        setConversations(prev => {
            const existing = prev.find(c =>
                c.ecosystemKind === "broadcast" && c.ecosystemId === groupId
            );
            if (existing) {
                targetId = existing.id;
                return prev;
            }
            const id = makeId();
            targetId = id;
            const convo: Conversation = {
                id,
                title: `Group: ${groupName}`,
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                ecosystemKind: "broadcast",
                ecosystemId: groupId,
            };
            return [convo, ...prev];
        });
        queueMicrotask(() => {
            if (targetId) {
                setActiveId(targetId);
                setShowConvos(false);
                initialScrollDone.current = false;
            }
        });
    }, []);

    const deleteConvo = useCallback((id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeId === id) {
            const remaining = conversations.filter(c => c.id !== id);
            setActiveId(remaining.length > 0 ? remaining[0].id : null);
        }
    }, [activeId, conversations]);

    return {
        conversations, setConversations,
        activeId, setActiveId,
        showConvos, setShowConvos,
        active, messages,
        endRef, inputRef, initialScrollDone,
        updateConversation, createNewChat, switchTo, deleteConvo,
        openAgentDM, openBroadcast,
    };
}

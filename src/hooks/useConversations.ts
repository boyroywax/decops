import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/services/ai";
import {
    loadConversations, saveConversations,
    loadActiveId, saveActiveId,
    makeId, deriveTitle,
} from "@/components/chat/utils";
import type { Conversation } from "@/components/chat/types";

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
        setConversations(prev => prev.map(c =>
            c.id === id
                ? { ...c, messages: msgs, title: deriveTitle(msgs), updatedAt: Date.now() }
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
    };
}

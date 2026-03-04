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
 */
export function useConversations() {
    const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
    const [activeId, setActiveId] = useState<string | null>(loadActiveId);
    const [showConvos, setShowConvos] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const initialScrollDone = useRef(false);

    // Derive active conversation
    const active = conversations.find(c => c.id === activeId) || null;
    const messages = active?.messages || [];

    // ── Persistence ──
    useEffect(() => { saveConversations(conversations); }, [conversations]);
    useEffect(() => { saveActiveId(activeId); }, [activeId]);

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

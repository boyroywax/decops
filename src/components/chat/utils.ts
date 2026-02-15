import type { ChatMessage } from "../../services/ai";
import type { Conversation, ParsedAction } from "./types";

const STORAGE_KEY = "decops_chat_conversations";
const ACTIVE_KEY = "decops_chat_active_id";

export function loadConversations(): Conversation[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch { return []; }
}

export function saveConversations(convos: Conversation[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

export function loadActiveId(): string | null {
    return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveId(id: string | null) {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
}

export function makeId(): string {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function deriveTitle(msgs: ChatMessage[]): string {
    const first = msgs.find(m => m.role === "user");
    if (!first) return "New Chat";
    const text = first.content.slice(0, 32);
    return text + (first.content.length > 32 ? "…" : "");
}

export function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
    const actions: ParsedAction[] = [];
    const cleanText = text.replace(/```action\n([\s\S]*?)```/g, (_, json) => {
        try {
            const action = JSON.parse(json.trim());
            actions.push(action);
            return "";
        } catch {
            return `\`\`\`\n${json}\`\`\``;
        }
    }).trim();
    return { cleanText, actions };
}

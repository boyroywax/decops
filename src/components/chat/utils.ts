import type { ChatMessage } from "@/services/ai";
import type { Conversation, ParsedAction } from "./types";

const STORAGE_KEY = "decops_chat_conversations";
const ACTIVE_KEY = "decops_chat_active_id";

/** Per-workspace storage key suffix. Falls back to global keys when no workspace is active. */
function convosKey(workspaceId?: string | null): string {
    return workspaceId ? `${STORAGE_KEY}:${workspaceId}` : STORAGE_KEY;
}
function activeKey(workspaceId?: string | null): string {
    return workspaceId ? `${ACTIVE_KEY}:${workspaceId}` : ACTIVE_KEY;
}

export function loadConversations(workspaceId?: string | null): Conversation[] {
    try {
        return JSON.parse(localStorage.getItem(convosKey(workspaceId)) || "[]");
    } catch { return []; }
}

export function saveConversations(convos: Conversation[], workspaceId?: string | null) {
    localStorage.setItem(convosKey(workspaceId), JSON.stringify(convos));
}

export function loadActiveId(workspaceId?: string | null): string | null {
    return localStorage.getItem(activeKey(workspaceId));
}

export function saveActiveId(id: string | null, workspaceId?: string | null) {
    if (id) localStorage.setItem(activeKey(workspaceId), id);
    else localStorage.removeItem(activeKey(workspaceId));
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

import type { ChatMessage } from "@/services/ai";
import type { Conversation, ParsedAction, ParsedThinking } from "./types";

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

export function parseActions(text: string): { cleanText: string; actions: ParsedAction[]; thinking: ParsedThinking[] } {
    const actions: ParsedAction[] = [];
    const thinking: ParsedThinking[] = [];

    // 1) Extract ```thinking blocks first — the model emits these before
    //    and between tool calls. We strip them from the visible prose
    //    and surface them via a dedicated UI card so the user sees the
    //    agent's confidence / plan / assessment as it works.
    let working = text.replace(/```thinking\s*\n([\s\S]*?)```/g, (_, body) => {
        const raw: string = String(body).trim();
        if (!raw) return "";
        const fields: Record<string, string> = {};
        let isError = false;
        for (const line of raw.split(/\r?\n/)) {
            const m = /^\s*([A-Za-z][A-Za-z _]*?)\s*:\s*(.*)$/.exec(line);
            if (!m) continue;
            const key = m[1].trim();
            const value = m[2].trim();
            if (!key) continue;
            fields[key] = value;
            if (key.toLowerCase() === "assess" && /^(error|unexpected)\b/i.test(value)) {
                isError = true;
            }
        }
        thinking.push({ raw, fields, isError });
        return "";
    });

    // 2) Then handle the existing ```action blocks.
    working = working.replace(/```action\n([\s\S]*?)```/g, (_, json) => {
        try {
            const action = JSON.parse(json.trim());
            actions.push(action);
            return "";
        } catch {
            return `\`\`\`\n${json}\`\`\``;
        }
    });

    // Collapse blank-line runs left behind by stripped blocks.
    const cleanText = working.replace(/\n{3,}/g, "\n\n").trim();
    return { cleanText, actions, thinking };
}

import type { ChatMessage } from "@/services/ai";
import type { Conversation, ParsedAction, ParsedThinking, ParsedSegment } from "./types";

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

/** Parse a ```thinking block body into a ParsedThinking. */
function parseThinkingBlock(body: string): ParsedThinking {
    const raw: string = String(body).trim();
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
    return { raw, fields, isError };
}

/**
 * Parse assistant output into ordered segments — thinking blocks and prose
 * interleaved in document order. This lets the renderer place each
 * ThinkingCard inline with the text that follows it, rather than dumping
 * all thoughts at the top of the bubble.
 *
 * Also extracts ```action blocks (kept for backward compat) and returns
 * the flat `cleanText` + `thinking` arrays for any legacy callers.
 */
export function parseActions(text: string): {
    cleanText: string;
    actions: ParsedAction[];
    thinking: ParsedThinking[];
    segments: ParsedSegment[];
} {
    const actions: ParsedAction[] = [];
    const thinking: ParsedThinking[] = [];
    const segments: ParsedSegment[] = [];

    // Regex that matches ```thinking blocks, ```action blocks, or plain text.
    // We split the input into alternating text / special-block segments.
    const blockRe = /```thinking\s*\n([\s\S]*?)```|```action\n([\s\S]*?)```/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = blockRe.exec(text)) !== null) {
        // Plain text before this block
        const before = text.slice(lastIndex, match.index).trim();
        if (before) {
            segments.push({ type: "text", text: before });
        }

        if (match[1] !== undefined) {
            // ```thinking block
            const t = parseThinkingBlock(match[1]);
            thinking.push(t);
            segments.push({ type: "thinking", thinking: t });
        } else if (match[2] !== undefined) {
            // ```action block
            try {
                const action = JSON.parse(match[2].trim());
                actions.push(action);
                segments.push({ type: "action", action });
            } catch {
                // Keep unparseable action blocks as visible text
                segments.push({ type: "text", text: match[0] });
            }
        }

        lastIndex = match.index + match[0].length;
    }

    // Trailing text after the last block
    const trailing = text.slice(lastIndex).trim();
    if (trailing) {
        segments.push({ type: "text", text: trailing });
    }

    // Collapse blank-line runs left behind by stripped blocks.
    const cleanText = text
        .replace(/```thinking\s*\n([\s\S]*?)```/g, "")
        .replace(/```action\n([\s\S]*?)```/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return { cleanText, actions, thinking, segments };
}

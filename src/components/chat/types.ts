import type { ChatMessage } from "@/services/ai";

export interface ParsedAction {
    type: string;
    [key: string]: any;
}

/** A reasoning block emitted by the agent inside a ```thinking fence.
 *  Lines are kept verbatim — rendering may parse "Key: value" pairs for
 *  per-line styling but raw text is the source of truth. */
export interface ParsedThinking {
    /** The raw text inside the fence, trimmed. */
    raw: string;
    /** Lightly structured fields recognized from common keys
     *  (Confidence, Needs tools, Plan, Assess, Next). Unknown keys
     *  fall through into `extras` so future protocol changes still
     *  render. */
    fields: Record<string, string>;
    /** Whether the block describes an error / unexpected outcome — the
     *  Assess line starts with ERROR: or UNEXPECTED:. Drives styling. */
    isError: boolean;
}

/** A segment of parsed assistant output — either a thinking block or a
 *  prose block. Segments are returned in document order so the renderer
 *  can interleave them faithfully instead of dumping all thoughts at the
 *  top. */
export type ParsedSegment =
  | { type: "thinking"; thinking: ParsedThinking }
  | { type: "text"; text: string };

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    /** When set, this conversation backs an ecosystem chat thread
     * (agent DM, group broadcast) rather than a general user/LLM chat.
     * Ecosystem-tagged conversations are hidden from the regular
     * Conversations list and are opened from the EcosystemPanel. */
    ecosystemKind?: "agent-dm" | "broadcast";
    /** Workspace entity id this conversation is bound to: agentId for
     * "agent-dm", groupId for "broadcast". */
    ecosystemId?: string;
}

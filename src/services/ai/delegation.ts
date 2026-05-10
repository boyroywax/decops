/**
 * Pluggable Chat Delegation Registry
 *
 * Allows toolkits (e.g. Studio Bot) to register delegation checks so that
 * the core AI chat/streaming service can delegate to specialized handlers
 * without directly importing toolkit code.
 *
 * The pattern:
 *   1. A toolkit calls `registerChatDelegation(...)` during init
 *   2. Before sending a user message to the LLM, chat.ts calls `getChatDelegation(msg)`
 *   3. If a delegation matches, the system prompt is enhanced and max rounds adjusted
 */

export interface ChatDelegation {
    /** Unique id — e.g. "studio-bot" */
    id: string;
    /** Return true if the user message should activate this delegation */
    check: (message: string) => boolean;
    /** Append extra instructions to the system prompt */
    enhance: (systemPrompt: string) => string;
    /** Override the default max tool-use rounds (default 8) */
    maxRounds?: number;
}

const delegations: ChatDelegation[] = [];

/**
 * Register a chat delegation. Returns a dispose function.
 */
export function registerChatDelegation(delegation: ChatDelegation): () => void {
    delegations.push(delegation);
    return () => {
        const idx = delegations.indexOf(delegation);
        if (idx >= 0) delegations.splice(idx, 1);
    };
}

/**
 * Find the first matching delegation for a user message, or null.
 */
export function getChatDelegation(message: string): ChatDelegation | null {
    return delegations.find(d => d.check(message)) ?? null;
}

/**
 * Get all registered delegations (for debugging/inspection).
 */
export function getAllDelegations(): readonly ChatDelegation[] {
    return delegations;
}

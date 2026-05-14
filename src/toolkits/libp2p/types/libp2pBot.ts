/**
 * libp2p Bot — specialized sub-agent types for libp2p networking control.
 *
 * The libp2p Bot is a system-level sub-agent invoked when the AI chat
 * needs to drive the in-browser libp2p node (start/stop, transports,
 * services, peer dialing, pubsub, identity, contacts, vault). It mirrors
 * the studio bot pattern.
 */

// ── Bot status ──

export type Libp2pBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

// ── Operations ──

export interface Libp2pBotOperation {
    command: string;
    args: Record<string, any>;
    description: string;
    /** Order in execution sequence */
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

// ── Configuration ──

export interface Libp2pBotConfig {
    /** Max tool-use rounds before stopping. */
    maxRounds: number;
    /** When true, the bot may auto-start the node if needed for an action. */
    autoStartIfStopped: boolean;
    /** When true, the bot will refuse to export private keys. */
    protectIdentities: boolean;
}

export const DEFAULT_LIBP2P_BOT_CONFIG: Libp2pBotConfig = {
    maxRounds: 12,
    autoStartIfStopped: true,
    protectIdentities: true,
};

// ── Request / response ──

export interface Libp2pBotRequest {
    /** Unique request id. */
    id: string;
    /** Natural language instruction. */
    instruction: string;
    /** Who initiated. */
    source: "user" | "agent";
    /** Timestamp. */
    timestamp: number;
}

export interface Libp2pBotResponse {
    requestId: string;
    summary: string;
    operations: Libp2pBotOperation[];
    suggestions: string[];
    success: boolean;
    error?: string;
    duration_ms: number;
}

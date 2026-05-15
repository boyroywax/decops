/**
 * Helia Bot types — specialized sub-agent for the Helia/IPFS toolkit.
 * Mirrors `libp2pBot` types one-to-one for parity.
 */

export type HeliaBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

export interface HeliaBotOperation {
    command: string;
    args: Record<string, any>;
    description: string;
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

export interface HeliaBotConfig {
    /** Max tool-use rounds before stopping. */
    maxRounds: number;
    /** When true, the bot may auto-start the helia node if needed. */
    autoStartIfStopped: boolean;
    /** When true, the bot may auto-create a new libp2p node when none is selected. */
    autoCreateLibp2p: boolean;
}

export const DEFAULT_HELIA_BOT_CONFIG: HeliaBotConfig = {
    maxRounds: 12,
    autoStartIfStopped: true,
    autoCreateLibp2p: true,
};

export interface HeliaBotRequest {
    id: string;
    instruction: string;
    source: "user" | "agent";
    timestamp: number;
}

export interface HeliaBotResponse {
    requestId: string;
    summary: string;
    operations: HeliaBotOperation[];
    suggestions: string[];
    success: boolean;
    error?: string;
    duration_ms: number;
}

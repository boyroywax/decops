/**
 * OrbitDB Bot types — specialized sub-agent for the OrbitDB toolkit.
 * Mirrors `heliaBot` types one-to-one for parity.
 */

export type OrbitdbBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

export interface OrbitdbBotOperation {
    command: string;
    args: Record<string, any>;
    description: string;
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

export interface OrbitdbBotConfig {
    /** Max tool-use rounds before stopping. */
    maxRounds: number;
    /** When true, the bot may auto-start the orbitdb node if needed. */
    autoStartIfStopped: boolean;
    /** When true, the bot may auto-start the underlying helia node if needed. */
    autoStartHelia: boolean;
}

export const DEFAULT_ORBITDB_BOT_CONFIG: OrbitdbBotConfig = {
    maxRounds: 12,
    autoStartIfStopped: true,
    autoStartHelia: true,
};

export interface OrbitdbBotRequest {
    id: string;
    instruction: string;
    source: "user" | "agent";
    timestamp: number;
}

export interface OrbitdbBotResponse {
    requestId: string;
    summary: string;
    operations: OrbitdbBotOperation[];
    suggestions: string[];
    success: boolean;
    error?: string;
    duration_ms: number;
}

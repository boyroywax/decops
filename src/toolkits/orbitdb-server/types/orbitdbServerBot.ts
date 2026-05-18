/**
 * OrbitDB Server Bot configuration & runtime types.
 */

export type OrbitdbServerBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

export interface OrbitdbServerBotConfig {
    /** Max LLM round-trips per request. */
    maxRounds: number;
    /** When true, the bot may connect a disconnected node before content actions. */
    autoConnectIfDisconnected: boolean;
    /**
     * When true, the bot may auto-create a database referenced by the user
     * if it isn't already open on the server.
     */
    autoCreateMissingDb: boolean;
}

export const DEFAULT_ORBITDB_SERVER_BOT_CONFIG: OrbitdbServerBotConfig = {
    maxRounds: 12,
    autoConnectIfDisconnected: true,
    autoCreateMissingDb: true,
};

export interface OrbitdbServerBotRequest {
    id: string;
    instruction: string;
}

export interface OrbitdbServerBotOperation {
    command: string;
    args: unknown;
    description: string;
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

export interface OrbitdbServerBotResponse {
    requestId: string;
    summary: string;
    operations: OrbitdbServerBotOperation[];
    suggestions: string[];
    success: boolean;
    error?: string;
    duration_ms: number;
}

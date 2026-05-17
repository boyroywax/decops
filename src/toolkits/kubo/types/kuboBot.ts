/**
 * Kubo Bot configuration & runtime types.
 */

export type KuboBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

export interface KuboBotConfig {
    /** Max LLM round-trips per request. */
    maxRounds: number;
    /** When true, the bot may connect a disconnected node before content actions. */
    autoConnectIfDisconnected: boolean;
    /**
     * When true, the bot will automatically pin every CID it successfully adds
     * (mirrors `kubo add --pin=true`, which is the daemon default).
     */
    autoPinOnAdd: boolean;
}

export const DEFAULT_KUBO_BOT_CONFIG: KuboBotConfig = {
    maxRounds: 12,
    autoConnectIfDisconnected: true,
    autoPinOnAdd: true,
};

export interface KuboBotRequest {
    id: string;
    instruction: string;
}

export interface KuboBotOperation {
    command: string;
    args: unknown;
    description: string;
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

export interface KuboBotResponse {
    requestId: string;
    summary: string;
    operations: KuboBotOperation[];
    suggestions: string[];
    success: boolean;
    error?: string;
    duration_ms: number;
}

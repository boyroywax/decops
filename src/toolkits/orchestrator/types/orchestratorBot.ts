/**
 * Orchestrator Bot configuration & runtime types.
 */

export type OrchestratorBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

export interface OrchestratorBotConfig {
    /** Max LLM round-trips per request. */
    maxRounds: number;
    /** When true, after applying a manifest the bot will reconcile and report drift. */
    reconcileAfterApply: boolean;
    /** When true, when no manifest is selected the bot may export the current state and save it as an artifact. */
    allowExportToArtifact: boolean;
}

export const DEFAULT_ORCHESTRATOR_BOT_CONFIG: OrchestratorBotConfig = {
    maxRounds: 15,
    reconcileAfterApply: true,
    allowExportToArtifact: true,
};

export interface OrchestratorBotRequest {
    id: string;
    instruction: string;
}

export interface OrchestratorBotOperation {
    command: string;
    args: unknown;
    description: string;
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

export interface OrchestratorBotResponse {
    requestId: string;
    summary: string;
    operations: OrchestratorBotOperation[];
    suggestions: string[];
    success: boolean;
    error?: string;
    duration_ms: number;
}

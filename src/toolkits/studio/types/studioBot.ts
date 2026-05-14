/**
 * Studio Bot — Specialized sub-agent types for Studio canvas management.
 *
 * The Studio Bot is a system-level sub-agent that is automatically invoked
 * when the AI chat bot needs to interact with the Studio canvas. It is an
 * expert in:
 *   - Studio commands (all 19+ commands)
 *   - Canvas layout & design (node positioning, parallel groups, connectors)
 *   - Job composition patterns (fan-out/fan-in, serial chains, data flow)
 *   - Deliverable/storage/input wiring
 */

// ── Bot Status ──

export type StudioBotStatus = "idle" | "planning" | "building" | "reviewing" | "error";

// ── Layout Analysis ──

export interface LayoutAnalysis {
    stepCount: number;
    groupCount: number;
    serialChainLength: number;
    maxParallelWidth: number;
    hasOverlaps: boolean;
    canvasExtent: { width: number; height: number };
    issues: LayoutIssue[];
}

export interface LayoutIssue {
    type: "overlap" | "orphan" | "disconnected" | "cramped" | "offscreen";
    stepIds: string[];
    message: string;
    severity: "warning" | "error";
}

// ── Studio Bot Plan ──

export interface StudioBotPlan {
    id: string;
    description: string;
    /** The sequence of studio commands the bot plans to execute */
    operations: StudioBotOperation[];
    /** Estimated canvas result */
    estimatedStepCount: number;
    estimatedGroupCount: number;
    status: "draft" | "approved" | "executing" | "completed" | "failed";
    createdAt: number;
}

export interface StudioBotOperation {
    command: string;
    args: Record<string, unknown>;
    description: string;
    /** Order in execution sequence */
    order: number;
    status: "pending" | "executing" | "completed" | "failed";
    result?: unknown;
    error?: string;
}

// ── Bot Configuration ──

export interface StudioBotConfig {
    /** Whether the bot auto-layouts after job creation */
    autoLayout: boolean;
    /** Whether the bot validates jobs before saving */
    validateBeforeSave: boolean;
    /** Whether the bot suggests optimizations */
    suggestOptimizations: boolean;
    /** Maximum parallel group depth */
    maxParallelDepth: number;
    /** Preferred layout direction */
    layoutDirection: "horizontal" | "vertical";
}

export const DEFAULT_STUDIO_BOT_CONFIG: StudioBotConfig = {
    autoLayout: true,
    validateBeforeSave: true,
    suggestOptimizations: true,
    maxParallelDepth: 2,
    layoutDirection: "horizontal",
};

// ── Bot Request/Response (for delegation from main AI chat) ──

export interface StudioBotRequest {
    /** Unique request ID */
    id: string;
    /** The natural language instruction from the user (or main AI) */
    instruction: string;
    /** Current studio state snapshot */
    studioState?: unknown;
    /** Who initiated: "user" from chat, "agent" from AI delegation */
    source: "user" | "agent";
    /** The agent ID that delegated (if source is "agent") */
    delegatingAgentId?: string;
    /** Timestamp */
    timestamp: number;
}

export interface StudioBotResponse {
    requestId: string;
    /** What the bot did */
    summary: string;
    /** Operations executed */
    operations: StudioBotOperation[];
    /** Any layout issues found and fixed */
    layoutFixes: string[];
    /** Suggestions for the user */
    suggestions: string[];
    /** Whether it succeeded */
    success: boolean;
    error?: string;
    /** Duration in ms */
    duration_ms: number;
}

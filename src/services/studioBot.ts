/**
 * Studio Bot Service — Specialized sub-agent for Studio canvas management.
 *
 * This service acts as a system-level sub-agent that the main AI chat bot
 * delegates to whenever Studio operations are needed. It:
 *
 *   1. Receives natural language instructions about job building
 *   2. Plans the sequence of studio commands needed
 *   3. Executes them against the StudioAPI
 *   4. Auto-layouts the canvas
 *   5. Validates the result
 *   6. Returns a summary to the delegating agent
 *
 * The bot has a specialized system prompt with deep knowledge of:
 *   - All 20+ studio commands
 *   - Canvas layout best practices
 *   - Parallel workflow patterns (fan-out/fan-in)
 *   - Data flow (storage, deliverables, input bindings, output mappings)
 *   - Job lifecycle (save, run, load, clear)
 */

import type { StudioAPI, StudioState } from "@/context/StudioContext";
import type {
    StudioBotStatus,
    StudioBotConfig,
    StudioBotRequest,
    StudioBotResponse,
    StudioBotOperation,
    LayoutAnalysis,
    LayoutIssue,
} from "@/types/studioBot";
import { isParallelGroup, NODE_SPACING_X, NODE_SPACING_Y, NODE_WIDTH, NODE_HEIGHT } from "@/types/studio";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider, buildProviderRequest, parseProviderResponse, parseToolUseBlocks, buildToolResultMessages } from "@/services/ai/providers";
import { getAllTools, executeToolCall } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module State ──

let botStatus: StudioBotStatus = "idle";
let botConfig: StudioBotConfig = {
    autoLayout: true,
    validateBeforeSave: true,
    suggestOptimizations: true,
    maxParallelDepth: 2,
    layoutDirection: "horizontal",
};
const requestLog: StudioBotResponse[] = [];

// ── Status & Config ──

export function getStudioBotStatus(): StudioBotStatus {
    return botStatus;
}

export function getStudioBotConfig(): StudioBotConfig {
    return { ...botConfig };
}

export function updateStudioBotConfig(patch: Partial<StudioBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}

export function getStudioBotLog(): StudioBotResponse[] {
    return [...requestLog];
}

// ── Layout Analysis ──

export function analyzeLayout(studioApi: StudioAPI): LayoutAnalysis {
    const state = studioApi.getState();
    const steps = state.steps;

    const groups = steps.filter(s => isParallelGroup(s));
    const issues: LayoutIssue[] = [];

    // Check for overlapping nodes
    for (let i = 0; i < steps.length; i++) {
        for (let j = i + 1; j < steps.length; j++) {
            const a = steps[i];
            const b = steps[j];
            if (
                Math.abs(a.x - b.x) < NODE_WIDTH * 0.8 &&
                Math.abs(a.y - b.y) < NODE_HEIGHT * 0.8
            ) {
                issues.push({
                    type: "overlap",
                    stepIds: [a.id, b.id],
                    message: `Steps "${a.commandId}" and "${b.commandId}" are overlapping`,
                    severity: "error",
                });
            }
        }
    }

    // Check for orphaned steps (parentId points to non-existent step)
    const stepIds = new Set(steps.map(s => s.id));
    for (const step of steps) {
        if (step.parentId && !stepIds.has(step.parentId)) {
            issues.push({
                type: "orphan",
                stepIds: [step.id],
                message: `Step "${step.commandId}" has orphaned parent reference`,
                severity: "error",
            });
        }
    }

    // Check for cramped nodes
    for (let i = 0; i < steps.length; i++) {
        for (let j = i + 1; j < steps.length; j++) {
            const a = steps[i];
            const b = steps[j];
            const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            if (dist > 0 && dist < 100 && !issues.some(iss => iss.type === "overlap" && iss.stepIds.includes(a.id))) {
                issues.push({
                    type: "cramped",
                    stepIds: [a.id, b.id],
                    message: `Steps "${a.commandId}" and "${b.commandId}" are too close together`,
                    severity: "warning",
                });
            }
        }
    }

    // Compute serial chain length
    let maxChain = 0;
    const roots = steps.filter(s => s.parentId === null);
    function chainLen(stepId: string): number {
        const children = steps.filter(s => s.parentId === stepId && !s.isGroupChild);
        if (children.length === 0) return 1;
        return 1 + Math.max(...children.map(c => chainLen(c.id)));
    }
    for (const root of roots) {
        maxChain = Math.max(maxChain, chainLen(root.id));
    }

    // Compute max parallel width
    let maxParallel = 0;
    for (const group of groups) {
        const children = steps.filter(s => s.parentId === group.id && s.isGroupChild);
        maxParallel = Math.max(maxParallel, children.length);
    }

    // Canvas extent
    const maxX = steps.length > 0 ? Math.max(...steps.map(s => s.x)) + NODE_WIDTH : 0;
    const maxY = steps.length > 0 ? Math.max(...steps.map(s => s.y)) + NODE_HEIGHT : 0;

    return {
        stepCount: steps.filter(s => !isParallelGroup(s)).length,
        groupCount: groups.length,
        serialChainLength: maxChain,
        maxParallelWidth: maxParallel,
        hasOverlaps: issues.some(i => i.type === "overlap"),
        canvasExtent: { width: maxX, height: maxY },
        issues,
    };
}

// ── Studio Bot System Prompt ──

function buildStudioBotSystemPrompt(studioState: StudioState | null): string {
    const stateSection = studioState
        ? `
CURRENT STUDIO STATE:
- Job name: "${studioState.name || "(unnamed)"}"
- Description: "${studioState.description || "(none)"}"
- Mode: ${studioState.mode}
- Steps: ${studioState.steps.length} (${studioState.steps.filter(s => isParallelGroup(s)).length} parallel groups)
- Deliverables: ${studioState.deliverables.length}
- Storage entries: ${studioState.storageEntries.length}
- Inputs: ${studioState.inputs.length}

Step details:
${studioState.steps.map((s, i) => {
    const args = Object.entries(s.args).filter(([_, v]) => v).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
    return `  ${i + 1}. [${s.id.slice(0, 12)}] ${s.commandId}${s.isGroupChild ? " (parallel child)" : ""}${args ? ` — ${args}` : ""}`;
}).join("\n") || "  (empty canvas)"}
`
        : "\nSTUDIO STATE: Not available (Studio tab not open)\n";

    return `You are the **Studio Bot**, a specialized system sub-agent expert in the Mesh Studio canvas and job builder.

YOUR ROLE:
You are the dedicated Studio expert. When the main AI assistant needs to create, modify, or manage jobs on the Studio canvas, it delegates to you. You have deep expertise in:

1. **Studio Commands** — You know all 20+ studio commands and their exact signatures
2. **Canvas Layout** — You ensure steps are properly positioned, never overlapping
3. **Workflow Patterns** — Fan-out/fan-in, serial chains, conditional execution, error handling
4. **Data Flow** — Input bindings, output mappings, storage keys, deliverable wiring
5. **Job Design** — You design clean, efficient jobs with proper data flow

STUDIO COMMANDS YOU CAN USE:
═══════════════════════════

**Job Creation (preferred for new jobs):**
- studio_create_job(name, description, steps[], parallelGroups[], deliverables[], storageDefaults{}, inputs[], triggers[], save?, run?)
  → Creates a complete job in one call. Clears canvas first.
  → Steps: [{ commandId, args?, inputBindings?, outputMappings?, condition?, parallelGroup?, modelId?, onSuccess?, onFailure? }]
  → parallelGroups: ["Group Label 1", "Group Label 2"] — steps reference by index
  → This is the PREFERRED command for creating new jobs from scratch

**Step Management:**
- studio_add_step(commandId, args?) → Add a single step
- studio_remove_step(stepId) → Remove a step
- studio_set_step_args(stepId, args) → Set step arguments
- studio_add_parallel_group() → Add a parallel container
- studio_set_step_condition(stepId, condition) → Set pre-condition

**Data Flow:**
- studio_set_input_bindings(stepId, bindings) → Bind args to storage/deliverables
- studio_set_output_mappings(stepId, mappings) → Route outputs to storage/deliverables

**Resources:**
- studio_add_deliverable(key, label, type, description?) → Declare job output
- studio_remove_deliverable(index) → Remove deliverable
- studio_add_storage(key, value) → Add storage default
- studio_remove_storage(index) → Remove storage entry

**Lifecycle:**
- studio_save_job() → Save to catalog
- studio_run_job() → Execute immediately
- studio_load_job(jobId) → Load from catalog
- studio_clear_canvas() → Full reset
- studio_auto_layout() → Recompute positions to fix layout

**State:**
- studio_get_state() → Get full canvas state

LAYOUT RULES:
═════════════
1. Serial steps flow LEFT → RIGHT with ${NODE_SPACING_X}px spacing
2. Parallel group children stack TOP → BOTTOM with ${NODE_SPACING_Y}px spacing
3. ALWAYS call studio_auto_layout after building a job to fix any positioning issues
4. Node width is ${NODE_WIDTH}px, height is ${NODE_HEIGHT}px — ensure no overlaps

DATA FLOW BEST PRACTICES:
════════════════════════
1. Each step that produces data should have output mappings (outputKey: "*" captures everything)
2. Subsequent steps should use input bindings to read from storage/deliverables
3. For parallel workflows: each parallel step writes to a UNIQUE storage key
4. A consolidation step after the parallel group merges all results
5. Pre-declare storage defaults for keys that need initial values

JOB DESIGN PATTERNS:
═══════════════════
**Simple Serial:** Step A → Step B → Step C (each chains to the next)
**Fan-Out/Fan-In:** Step A → Parallel[B1, B2, B3] → Step C (merge results)
**Conditional:** Step A → Step B (condition: storage.flag === true) → Step C
**Research Pipeline:** create_agent → send_message (research) → create_artifact (report)
**Multi-Agent Collaboration:** create_agents → parallel[send_message to each] → merge → create_artifact

${stateSection}
IMPORTANT RULES:
1. ALWAYS use studio_create_job for building new jobs from scratch — it's atomic and cleaner
2. ALWAYS include output mappings for steps that produce data
3. ALWAYS auto-layout after modifications
4. Use descriptive storage keys: "research_results", "analysis_output", etc.
5. When creating parallel workflows, ALWAYS use the fan-out/fan-in pattern
6. Give jobs clear names and descriptions
7. Add appropriate deliverables for any job that produces artifacts
8. Validate your plan before executing — check data flow connections are complete`;
}

// ── Studio-Only Tools Filter ──

function getStudioTools() {
    const studioCommandIds = new Set([
        "studio_get_state", "studio_set_job_meta", "studio_save_job", "studio_run_job",
        "studio_load_job", "studio_clear_canvas", "studio_create_job",
        "studio_add_trigger", "studio_remove_trigger",
        "studio_add_step", "studio_remove_step", "studio_set_step_args",
        "studio_add_parallel_group", "studio_set_step_condition",
        "studio_set_input_bindings", "studio_set_output_mappings",
        "studio_add_deliverable", "studio_remove_deliverable",
        "studio_add_storage", "studio_remove_storage",
        "studio_add_input", "studio_remove_input", "studio_update_input",
        "studio_auto_layout",
    ]);

    return getAllTools().filter(t => studioCommandIds.has(t.name));
}

// ── Main Delegation Entry Point ──

/**
 * Handle a Studio Bot request — the main entry point for delegation.
 * Called by the main AI chat when it detects the user wants studio operations.
 */
export async function handleStudioBotRequest(
    request: StudioBotRequest,
    studioApi: StudioAPI | null,
    commandContext: CommandContext,
): Promise<StudioBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";

    if (!studioApi) {
        botStatus = "error";
        const response: StudioBotResponse = {
            requestId: request.id,
            summary: "Studio is not available. Navigate to the Studio tab first.",
            operations: [],
            layoutFixes: [],
            suggestions: ["Switch to the Studio tab and try again"],
            success: false,
            error: "Studio not available",
            duration_ms: Date.now() - startTime,
        };
        requestLog.push(response);
        return response;
    }

    const operations: StudioBotOperation[] = [];
    const layoutFixes: string[] = [];
    const suggestions: string[] = [];

    try {
        // Get current studio state for context
        const studioState = studioApi.getState();
        const model = getSelectedModel();
        const provider = getModelProvider(model);

        // Build the specialized system prompt
        const systemPrompt = buildStudioBotSystemPrompt(studioState);

        // Get only studio tools
        const tools = (provider === "anthropic" || provider === "openai") ? getStudioTools() : [];

        // Build messages
        const apiMessages: any[] = [
            { role: "user", content: `${request.instruction}\n\nIMPORTANT: After building the job, always call studio_auto_layout to fix the canvas layout.` },
        ];

        botStatus = "building";

        // Multi-round tool use loop (same pattern as main chat)
        const MAX_ROUNDS = 12;
        let finalText = "";

        for (let round = 0; round < MAX_ROUNDS; round++) {
            const req = buildProviderRequest(model, systemPrompt, apiMessages, 4096, tools.length > 0 ? tools : undefined);
            const response = await fetch(req.url, {
                method: "POST",
                headers: req.headers,
                body: JSON.stringify(req.body),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
            }

            const data = await response.json();
            const toolUseBlocks = parseToolUseBlocks(model, data);

            if (toolUseBlocks.length === 0) {
                finalText = parseProviderResponse(model, data);
                break;
            }

            // Execute tool calls
            const rawAssistant = provider === "openai"
                ? data.choices?.[0]?.message?.tool_calls
                : data.content;

            const toolResults: { id: string; content: string; isError?: boolean }[] = [];
            for (const block of toolUseBlocks) {
                const opIndex = operations.length;
                operations.push({
                    command: block.name,
                    args: block.input || {},
                    description: `Execute ${block.name}`,
                    order: opIndex,
                    status: "executing",
                });

                const result = await executeToolCall(
                    block.id,
                    block.name,
                    block.input || {},
                    commandContext,
                );

                operations[opIndex].status = result.error ? "failed" : "completed";
                operations[opIndex].result = result.result;
                operations[opIndex].error = result.error;

                const content = result.error
                    ? JSON.stringify({ error: result.error })
                    : JSON.stringify(result.result ?? { success: true });

                toolResults.push({
                    id: block.id,
                    content,
                    isError: !!result.error,
                });
            }

            const resultMsgs = buildToolResultMessages(model, rawAssistant, toolResults);
            apiMessages.push(...resultMsgs);
        }

        // Post-execution: analyze layout and fix if needed
        botStatus = "reviewing";
        const analysis = analyzeLayout(studioApi);

        if (analysis.hasOverlaps || analysis.issues.length > 0) {
            studioApi.autoLayout();
            layoutFixes.push(`Auto-layout applied: fixed ${analysis.issues.length} issue(s)`);
            for (const issue of analysis.issues) {
                layoutFixes.push(`  - ${issue.message}`);
            }
        }

        // Generate suggestions
        const postState = studioApi.getState();
        if (postState.steps.length > 0 && postState.deliverables.length === 0) {
            suggestions.push("Consider adding deliverables to capture job outputs as artifacts");
        }
        if (postState.steps.length > 5 && postState.storageEntries.length === 0) {
            suggestions.push("Complex jobs benefit from storage entries for inter-step data sharing");
        }

        botStatus = "idle";
        const response: StudioBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} studio operation(s)`,
            operations,
            layoutFixes,
            suggestions,
            success: true,
            duration_ms: Date.now() - startTime,
        };
        requestLog.push(response);
        return response;
    } catch (err) {
        botStatus = "error";
        const msg = err instanceof Error ? err.message : String(err);
        const response: StudioBotResponse = {
            requestId: request.id,
            summary: `Studio Bot error: ${msg}`,
            operations,
            layoutFixes,
            suggestions,
            success: false,
            error: msg,
            duration_ms: Date.now() - startTime,
        };
        requestLog.push(response);

        // Reset to idle after error
        setTimeout(() => { botStatus = "idle"; }, 2000);
        return response;
    }
}

/**
 * Check if a user message should be delegated to the Studio Bot.
 * Returns true if the message is about building/modifying studio jobs.
 */
export function shouldDelegateToStudioBot(message: string): boolean {
    const lowerMsg = message.toLowerCase();

    // Strong indicators — explicit studio/job creation requests
    const strongPatterns = [
        /\bstudio\b/,
        /\bcreate\s+(a\s+)?job\b/,
        /\bbuild\s+(a\s+)?job\b/,
        /\bmake\s+(a\s+)?job\b/,
        /\bdesign\s+(a\s+)?job\b/,
        /\bjob\s+(that|which|to)\b/,
        /\bworkflow\s+(that|which|to|for)\b/,
        /\bpipeline\s+(that|which|to|for)\b/,
        /\badd\s+(a\s+)?step\b/,
        /\bcanvas\b/,
        /\blayout\b.*\b(step|node|job)\b/,
        /\bparallel\s+(group|task|step)\b/,
        /\bfan.?out\b/,
        /\bfan.?in\b/,
        /\bauto.?layout\b/,
        /\bfix\s+(the\s+)?layout\b/,
        /\bclear\s+(the\s+)?canvas\b/,
        /\bsave\s+(the\s+)?job\b/,
        /\brun\s+(the\s+)?job\b/,
        /\bload\s+(the\s+)?job\b/,
        /\bstep.*deliverable\b/,
        /\bstorage\s+key\b/,
        /\binput\s+binding\b/,
        /\boutput\s+mapping\b/,
    ];

    return strongPatterns.some(p => p.test(lowerMsg));
}

// ── Self-registration with the core AI delegation system ──
// This runs when the studioBot module is first imported, connecting Studio's
// delegation logic to the pluggable core chat service without core needing
// to know about Studio directly.

registerChatDelegation({
    id: "studio-bot",
    check: shouldDelegateToStudioBot,
    enhance: (systemPrompt) =>
        systemPrompt +
        "\n\n[STUDIO BOT ACTIVE] This request involves Studio operations. " +
        "ALWAYS call studio_auto_layout after creating or modifying jobs to ensure clean canvas layout. " +
        "Use studio_create_job for building complete jobs in one call. " +
        "Ensure all parallel steps write to unique storage keys.",
    maxRounds: 12,
});

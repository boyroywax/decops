/**
 * Studio-specific types, constants, and helpers.
 *
 * These were originally defined inside StudioView.tsx and are consumed by
 * JobCanvas, StepCardModal, NodeEditor, StudioContext, and test files.
 */

// ── Output / Input binding types ──

export interface OutputMapping {
    outputKey: string;       // key from the command's outputSchema (or "*" for entire output)
    target: "storage" | "deliverable";
    targetKey: string;       // storage key or deliverable key to write to
}

export interface InputBinding {
    source: "storage" | "deliverable" | "input";
    sourceKey: string;       // storage key or deliverable key or input name to read from
}

// ── Parallel-group sentinel ──

/**
 * Sentinel commandId for parallel-group container steps.
 * A parallel group is not a real task — it groups child steps that execute concurrently.
 * Children whose parentId points to a parallel-group step run in parallel.
 */
export const PARALLEL_GROUP_CMD = "__parallel__";

/** Returns true if the step is a parallel-group container (not a real task). */
export function isParallelGroup(step: StudioStep): boolean {
    return step.commandId === PARALLEL_GROUP_CMD;
}

// ── Anchor / connector sides ──

export type AnchorSide = "top" | "right" | "bottom" | "left";

// ── Studio step (canvas node) ──

export interface StudioStep {
    id: string;
    commandId: string;  // PARALLEL_GROUP_CMD for parallel containers
    args: Record<string, any>;
    inputBindings: Record<string, InputBinding>;  // argName → source binding
    preCondition: string;
    postCondition: string;
    parentId: string | null;
    outputMappings: OutputMapping[];
    modelId?: string;  // LLM model override for this step
    label?: string;    // display label for parallel groups
    connectorOut?: AnchorSide;  // Where outgoing connector leaves this node (default: right)
    connectorIn?: AnchorSide;   // Where incoming connector enters this node (default: left)
    /** True when this step runs inside a parallel group (concurrent sibling).
     *  False/undefined means serial successor even if parentId points to a group. */
    isGroupChild?: boolean;
    x: number;
    y: number;
}

// ── Selection model ──

export type SelectedElement =
    | { type: "step"; id: string }
    | { type: "deliverable"; index: number }
    | { type: "storage"; index: number }
    | { type: "input"; index: number }
    | null;

// ── Layout constants ──

export const NODE_SPACING_X = 320;
export const NODE_SPACING_Y = 180;
export const INITIAL_X = 60;
export const INITIAL_Y = 80;

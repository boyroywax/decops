import type { StudioStep, AnchorSide } from "../../types/studio";
import { isParallelGroup } from "../../types/studio";
import {
    NODE_WIDTH,
    NODE_HEIGHT,
    DELIV_WIDTH,
    DELIV_HEIGHT,
    STORAGE_WIDTH,
    STORAGE_HEIGHT,
    INPUT_WIDTH,
    INPUT_HEIGHT,
    anchorPoint,
} from "./canvasGeometry";

// ── Connector types ──

export interface StepConnector {
    key: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    mid: { x: number; y: number };
    isParallel: boolean;
    isVertical: boolean;
    parentId: string;
}

export interface SimpleConnector {
    key: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
}

export interface CanvasLayout {
    groupBounds: Map<string, { x: number; y: number; w: number; h: number }>;
    connectors: StepConnector[];
    leafSteps: StudioStep[];
    delivPositions: { x: number; y: number }[];
    storagePositions: { x: number; y: number }[];
    inputPositions: { x: number; y: number }[];
    delivConnectors: SimpleConnector[];
    storageConnectors: SimpleConnector[];
    inputConnectors: SimpleConnector[];
    maxX: number;
    maxY: number;
}

/**
 * Pure computation of all canvas layout data: group bounds, connectors,
 * node positions for deliverables/storage/inputs, and canvas extents.
 */
export function computeCanvasLayout(
    steps: StudioStep[],
    deliverables: { label?: string; key?: string; type: string; description?: string }[],
    storageEntries: { key: string; value: string }[],
    inputs: { name: string; type: string; entityId?: string; source?: { kind: string } }[],
    deliverableNodePositions?: Record<number, { x: number; y: number }>,
    storageNodePositions?: Record<number, { x: number; y: number }>,
    inputNodePositions?: Record<number, { x: number; y: number }>,
): CanvasLayout {
    // ── Pre-compute parallel-group bounding boxes ──
    const groupBounds = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const group of steps.filter(s => isParallelGroup(s))) {
        const children = steps.filter(s => s.parentId === group.id && s.isGroupChild);
        const padding = 24;
        const headerH = 34;
        if (children.length > 0) {
            const minX = Math.min(...children.map(c => c.x));
            const maxX = Math.max(...children.map(c => c.x + NODE_WIDTH));
            const minY = Math.min(...children.map(c => c.y));
            const maxY = Math.max(...children.map(c => c.y + NODE_HEIGHT));
            groupBounds.set(group.id, {
                x: minX - padding,
                y: minY - padding - headerH,
                w: Math.max(300, maxX - minX + NODE_WIDTH + padding * 2),
                h: maxY - minY + NODE_HEIGHT + padding * 2 + headerH,
            });
        } else {
            groupBounds.set(group.id, { x: group.x, y: group.y, w: 300, h: headerH + padding * 2 });
        }
    }

    // ── Build graph-based connectors from parentId ──
    const connectors = steps
        .filter(s => s.parentId !== null)
        .filter(s => {
            const parent = steps.find(p => p.id === s.parentId);
            return parent && !(isParallelGroup(parent) && s.isGroupChild);
        })
        .map(step => {
            const parent = steps.find(p => p.id === step.parentId);
            if (!parent) return null;
            const isGroupStep = isParallelGroup(step);
            const outSide: AnchorSide = parent.connectorOut || "right";

            let from: { x: number; y: number };
            let to: { x: number; y: number };
            const parentIsGroup = isParallelGroup(parent);

            if (isGroupStep) {
                from = anchorPoint(parent.x, parent.y, NODE_WIDTH, NODE_HEIGHT, outSide);
                const bounds = groupBounds.get(step.id);
                if (bounds) {
                    const inSide: AnchorSide = step.connectorIn || (outSide === "right" ? "left" : outSide === "bottom" ? "top" : outSide === "left" ? "right" : "bottom");
                    to = anchorPoint(bounds.x, bounds.y, bounds.w, bounds.h, inSide);
                } else {
                    to = anchorPoint(step.x, step.y, NODE_WIDTH, NODE_HEIGHT, step.connectorIn || "left");
                }
            } else if (parentIsGroup) {
                const parentBounds = groupBounds.get(parent.id);
                if (parentBounds) {
                    from = anchorPoint(parentBounds.x, parentBounds.y, parentBounds.w, parentBounds.h, outSide);
                } else {
                    from = anchorPoint(parent.x, parent.y, NODE_WIDTH, NODE_HEIGHT, outSide);
                }
                const inSide: AnchorSide = step.connectorIn || (outSide === "right" ? "left" : outSide === "bottom" ? "top" : outSide === "left" ? "right" : "bottom");
                to = anchorPoint(step.x, step.y, NODE_WIDTH, NODE_HEIGHT, inSide);
            } else {
                from = anchorPoint(parent.x, parent.y, NODE_WIDTH, NODE_HEIGHT, outSide);
                const inSide: AnchorSide = step.connectorIn || (outSide === "right" ? "left" : outSide === "bottom" ? "top" : outSide === "left" ? "right" : "bottom");
                to = anchorPoint(step.x, step.y, NODE_WIDTH, NODE_HEIGHT, inSide);
            }

            const isVertical = outSide === "top" || outSide === "bottom";

            return {
                key: `${parent.id}-${step.id}`,
                from,
                to,
                mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
                isParallel: false,
                isVertical,
                parentId: parent.id,
            };
        })
        .filter(Boolean) as StepConnector[];

    // ── Leaf steps (steps with no children) for deliverable connections ──
    const idsBeingParent = new Set(steps.filter(s => s.parentId !== null).map(s => s.parentId!));
    const leafSteps = steps.filter(s => !idsBeingParent.has(s.id) && !isParallelGroup(s));
    const leafMaxX = leafSteps.length > 0 ? Math.max(...leafSteps.map(s => s.x + NODE_WIDTH)) : 60;
    const leafAvgY = leafSteps.length > 0
        ? leafSteps.reduce((sum, s) => sum + s.y, 0) / leafSteps.length + NODE_HEIGHT / 2
        : 80;

    // ── Deliverable positions (custom override or auto-computed) ──
    const delivStartX = steps.length > 0 ? leafMaxX + 120 : 400;
    const delivBlockHeight = deliverables.length * (DELIV_HEIGHT + 12) - 12;
    const delivStartY = Math.max(20, leafAvgY - delivBlockHeight / 2);
    const delivPositions = deliverables.map((_, i) =>
        deliverableNodePositions?.[i] ?? { x: delivStartX, y: delivStartY + i * (DELIV_HEIGHT + 12) }
    );

    // ── Storage positions (custom override or auto-computed) ──
    const storageStartX = 60;
    const storagePositions = storageEntries.map((_, i) =>
        storageNodePositions?.[i] ?? { x: storageStartX + i * (STORAGE_WIDTH + 16), y: 10 }
    );

    // ── Input positions (custom override or auto-computed) ──
    const inputStartX = storageEntries.length > 0
        ? storageStartX + storageEntries.length * (STORAGE_WIDTH + 16) + 24
        : 60;
    const inputPositions = inputs.map((_, i) =>
        inputNodePositions?.[i] ?? { x: inputStartX + i * (INPUT_WIDTH + 16), y: 10 }
    );

    // ── Canvas bounds ──
    const allXs = [800, ...steps.map(s => s.x + NODE_WIDTH + 100), ...delivPositions.map(p => p.x + DELIV_WIDTH + 60), ...inputPositions.map(p => p.x + INPUT_WIDTH + 60), ...storagePositions.map(p => p.x + STORAGE_WIDTH + 60)];
    const allYs = [400, ...steps.map(s => s.y + NODE_HEIGHT + 100), ...delivPositions.map(p => p.y + DELIV_HEIGHT + 60), ...storagePositions.map(p => p.y + STORAGE_HEIGHT + 60), ...inputPositions.map(p => p.y + INPUT_HEIGHT + 60)];
    const maxX = Math.max(...allXs);
    const maxY = Math.max(...allYs);

    // ── Deliverable connectors (leaf steps → deliverable nodes) ──
    const delivConnectors = deliverables.flatMap((_, di) => {
        const dp = delivPositions[di];
        if (!dp) return [];
        return leafSteps.map(leaf => ({
            key: `deliv-${leaf.id}-${di}`,
            from: { x: leaf.x + NODE_WIDTH, y: leaf.y + NODE_HEIGHT / 2 },
            to: { x: dp.x, y: dp.y + DELIV_HEIGHT / 2 },
        }));
    });

    // ── Storage connectors (storage → first root step) ──
    const rootSteps = steps.filter(s => s.parentId === null && !isParallelGroup(s));
    const storageConnectors = storageEntries.flatMap((_, si) => {
        const sp = storagePositions[si];
        if (!sp) return [];
        return rootSteps.slice(0, 1).map(rs => ({
            key: `storage-${si}-${rs.id}`,
            from: { x: sp.x + STORAGE_WIDTH / 2, y: sp.y + STORAGE_HEIGHT },
            to: { x: rs.x + NODE_WIDTH / 2, y: rs.y },
        }));
    });

    // ── Input connectors (input → first root step) ──
    const inputConnectors = inputs.flatMap((_, ii) => {
        const ip = inputPositions[ii];
        if (!ip) return [];
        return rootSteps.slice(0, 1).map(rs => ({
            key: `input-${ii}-${rs.id}`,
            from: { x: ip.x + INPUT_WIDTH / 2, y: ip.y + INPUT_HEIGHT },
            to: { x: rs.x + NODE_WIDTH / 2, y: rs.y },
        }));
    });

    return {
        groupBounds,
        connectors,
        leafSteps,
        delivPositions,
        storagePositions,
        inputPositions,
        delivConnectors,
        storageConnectors,
        inputConnectors,
        maxX,
        maxY,
    };
}

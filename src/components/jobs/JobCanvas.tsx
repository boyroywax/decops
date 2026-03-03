import { useRef, useState, useEffect, useCallback } from "react";
import { Workflow, Package, Database, Tag, X, GitFork } from "lucide-react";
import { JobNode } from "./JobNode";
import type { StudioStep, SelectedElement, AnchorSide } from "../views/StudioView";
import { isParallelGroup, PARALLEL_GROUP_CMD } from "../views/StudioView";
import type { JobDeliverable, EntityInput } from "../../types";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 140;
const DELIV_WIDTH = 180;
const DELIV_HEIGHT = 70;
const STORAGE_WIDTH = 160;
const STORAGE_HEIGHT = 56;
const INPUT_WIDTH = 170;
const INPUT_HEIGHT = 72;

const ANCHOR_ORDER: AnchorSide[] = ["right", "bottom", "left", "top"];

function nextAnchor(current: AnchorSide | undefined): AnchorSide {
    const idx = ANCHOR_ORDER.indexOf(current || "right");
    return ANCHOR_ORDER[(idx + 1) % ANCHOR_ORDER.length];
}

/** Compute the (x,y) point on a node's edge for a given anchor side. */
function anchorPoint(nodeX: number, nodeY: number, w: number, h: number, side: AnchorSide): { x: number; y: number } {
    switch (side) {
        case "top":    return { x: nodeX + w / 2, y: nodeY };
        case "bottom": return { x: nodeX + w / 2, y: nodeY + h };
        case "left":   return { x: nodeX,         y: nodeY + h / 2 };
        case "right":  return { x: nodeX + w,      y: nodeY + h / 2 };
    }
}

function rectsIntersect(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

interface JobCanvasProps {
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    selectedElement: SelectedElement;
    onSelect: (el: SelectedElement) => void;
    onRemoveStep: (id: string) => void;
    onRemoveDeliverable: (idx: number) => void;
    onRemoveStorage: (idx: number) => void;
    onRemoveInput: (idx: number) => void;
    onUpdatePosition: (stepId: string, x: number, y: number) => void;
    onMoveGroup: (groupId: string, dx: number, dy: number) => void;
    onUpdateAnchor: (stepId: string, which: "connectorOut" | "connectorIn", side: AnchorSide) => void;
    selectedElements: NonNullable<SelectedElement>[];
    onMultiSelect: (items: NonNullable<SelectedElement>[]) => void;
    onDeleteSelected: () => void;
    onOpenStepCard?: (stepId: string) => void;
    // Special node position overrides & callbacks
    storageNodePositions?: Record<number, { x: number; y: number }>;
    inputNodePositions?: Record<number, { x: number; y: number }>;
    deliverableNodePositions?: Record<number, { x: number; y: number }>;
    onUpdateStoragePosition?: (index: number, x: number, y: number) => void;
    onUpdateInputPosition?: (index: number, x: number, y: number) => void;
    onUpdateDeliverablePosition?: (index: number, x: number, y: number) => void;
    // Double-click edit modals
    onOpenStorageCard?: (index: number) => void;
    onOpenInputCard?: (index: number) => void;
    onOpenDeliverableCard?: (index: number) => void;
}

export function JobCanvas({
    steps, deliverables, storageEntries, inputs, selectedElement,
    onSelect, onRemoveStep, onRemoveDeliverable, onRemoveStorage, onRemoveInput,
    onUpdatePosition, onMoveGroup, onUpdateAnchor, selectedElements, onMultiSelect, onDeleteSelected,
    onOpenStepCard,
    storageNodePositions, inputNodePositions, deliverableNodePositions,
    onUpdateStoragePosition, onUpdateInputPosition, onUpdateDeliverablePosition,
    onOpenStorageCard, onOpenInputCard, onOpenDeliverableCard,
}: JobCanvasProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<{
        stepId: string;
        offsetX: number;
        offsetY: number;
        isGroup?: boolean;
        specialKind?: "storage" | "input" | "deliverable";
        specialIndex?: number;
    } | null>(null);
    const lastGroupPos = useRef<{ x: number; y: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const marqueeStart = useRef({ x: 0, y: 0 });
    const marqueeEndRef = useRef({ x: 0, y: 0 });
    const marqueeDataRef = useRef<{
        steps: StudioStep[];
        delivPositions: { x: number; y: number }[];
        storagePositions: { x: number; y: number }[];
        inputPositions: { x: number; y: number }[];
    }>({ steps: [], delivPositions: [], storagePositions: [], inputPositions: [] });
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onMultiSelectRef = useRef(onMultiSelect);
    onMultiSelectRef.current = onMultiSelect;

    const isInMultiSelect = useCallback((type: string, idOrIndex: string | number): boolean => {
        return selectedElements.some(s => {
            if (s.type !== type) return false;
            if (type === "step") return (s as { type: "step"; id: string }).id === idOrIndex;
            return (s as { index: number }).index === idOrIndex;
        });
    }, [selectedElements]);

    const handleNodeMouseDown = useCallback((e: React.MouseEvent, stepId: string) => {
        if ((e.target as HTMLElement).closest('.jm-node__action-btn')) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const step = steps.find(s => s.id === stepId);
        if (!step) return;
        const rect = canvas.getBoundingClientRect();
        const isGroup = isParallelGroup(step);
        if (isGroup) {
            lastGroupPos.current = { x: step.x, y: step.y };
        }
        setDragging({
            stepId,
            offsetX: e.clientX - rect.left + canvas.scrollLeft - step.x,
            offsetY: e.clientY - rect.top + canvas.scrollTop - step.y,
            isGroup,
        });
        onSelect({ type: "step", id: stepId });
        e.preventDefault();
    }, [steps, onSelect]);

    const handleSpecialNodeMouseDown = useCallback((
        e: React.MouseEvent,
        kind: "storage" | "input" | "deliverable",
        index: number,
        nodeX: number,
        nodeY: number,
    ) => {
        if ((e.target as HTMLElement).closest('.jm-node__action-btn')) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setDragging({
            stepId: "",
            offsetX: e.clientX - rect.left + canvas.scrollLeft - nodeX,
            offsetY: e.clientY - rect.top + canvas.scrollTop - nodeY,
            specialKind: kind,
            specialIndex: index,
        });
        const type = kind === "deliverable" ? "deliverable" : kind;
        onSelect({ type, index } as any);
        e.preventDefault();
    }, [onSelect]);

    useEffect(() => {
        if (!dragging) return;
        const handleMove = (e: MouseEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = Math.max(0, e.clientX - rect.left + canvas.scrollLeft - dragging.offsetX);
            const y = Math.max(0, e.clientY - rect.top + canvas.scrollTop - dragging.offsetY);

            if (dragging.specialKind && dragging.specialIndex !== undefined) {
                // Dragging a special node (storage / input / deliverable)
                if (dragging.specialKind === "storage") onUpdateStoragePosition?.(dragging.specialIndex, x, y);
                else if (dragging.specialKind === "input") onUpdateInputPosition?.(dragging.specialIndex, x, y);
                else if (dragging.specialKind === "deliverable") onUpdateDeliverablePosition?.(dragging.specialIndex, x, y);
            } else if (dragging.isGroup && lastGroupPos.current) {
                const dx = x - lastGroupPos.current.x;
                const dy = y - lastGroupPos.current.y;
                lastGroupPos.current = { x, y };
                // Move group + all children in one batch
                onMoveGroup(dragging.stepId, dx, dy);
            } else {
                onUpdatePosition(dragging.stepId, x, y);
            }
        };
        const handleUp = () => {
            lastGroupPos.current = null;
            setDragging(null);
        };
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [dragging, onUpdatePosition, onMoveGroup, onUpdateStoragePosition, onUpdateInputPosition, onUpdateDeliverablePosition]);

    // ── Marquee multi-select ──
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('.jm-node, .jm-deliverable-node, .jm-storage-node, .jm-input-node, .jm-parallel-group')) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + canvas.scrollLeft;
        const y = e.clientY - rect.top + canvas.scrollTop;
        marqueeStart.current = { x, y };
        marqueeEndRef.current = { x, y };
        setIsSelecting(true);
        setSelectionRect(null);
        canvas.focus();
        e.preventDefault();
    }, []);

    useEffect(() => {
        if (!isSelecting) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const start = marqueeStart.current;

        const handleMove = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            const endX = e.clientX - r.left + canvas.scrollLeft;
            const endY = e.clientY - r.top + canvas.scrollTop;
            marqueeEndRef.current = { x: endX, y: endY };
            setSelectionRect({
                left: Math.min(start.x, endX),
                top: Math.min(start.y, endY),
                width: Math.abs(endX - start.x),
                height: Math.abs(endY - start.y),
            });
        };

        const handleUp = () => {
            const end = marqueeEndRef.current;
            const sr = {
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                w: Math.abs(end.x - start.x),
                h: Math.abs(end.y - start.y),
            };
            const isClick = sr.w < 5 && sr.h < 5;
            if (isClick) {
                onSelectRef.current(null);
            } else {
                const data = marqueeDataRef.current;
                const items: NonNullable<SelectedElement>[] = [];
                data.steps.forEach(step => {
                    if (rectsIntersect(sr, { x: step.x, y: step.y, w: NODE_WIDTH, h: NODE_HEIGHT }))
                        items.push({ type: "step", id: step.id });
                });
                data.delivPositions.forEach((pos, idx) => {
                    if (rectsIntersect(sr, { x: pos.x, y: pos.y, w: DELIV_WIDTH, h: DELIV_HEIGHT }))
                        items.push({ type: "deliverable", index: idx });
                });
                data.storagePositions.forEach((pos, idx) => {
                    if (rectsIntersect(sr, { x: pos.x, y: pos.y, w: STORAGE_WIDTH, h: STORAGE_HEIGHT }))
                        items.push({ type: "storage", index: idx });
                });
                data.inputPositions.forEach((pos, idx) => {
                    if (rectsIntersect(sr, { x: pos.x, y: pos.y, w: INPUT_WIDTH, h: INPUT_HEIGHT }))
                        items.push({ type: "input", index: idx });
                });
                if (items.length > 0) {
                    onMultiSelectRef.current(items);
                } else {
                    onSelectRef.current(null);
                }
            }
            setIsSelecting(false);
            setSelectionRect(null);
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [isSelecting]);

    // ── Keyboard shortcuts ──
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onDeleteSelected();
        }
        if (e.key === "Escape") {
            onSelect(null);
        }
    }, [onDeleteSelected, onSelect]);

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
            // Skip children of parallel groups — they're visually inside the container
            // Serial successors of a group (isGroupChild=false) DO get connectors
            const parent = steps.find(p => p.id === s.parentId);
            return parent && !(isParallelGroup(parent) && s.isGroupChild);
        })
        .map(step => {
            const parent = steps.find(p => p.id === step.parentId);
            if (!parent) return null;
            const isGroupStep = isParallelGroup(step);

            // Determine anchor sides from step properties
            const outSide: AnchorSide = parent.connectorOut || "right";

            let from: { x: number; y: number };
            let to: { x: number; y: number };

            const parentIsGroup = isParallelGroup(parent);

            if (isGroupStep) {
                // Connect from parent node's outgoing anchor to the parallel container edge
                from = anchorPoint(parent.x, parent.y, NODE_WIDTH, NODE_HEIGHT, outSide);
                const bounds = groupBounds.get(step.id);
                if (bounds) {
                    const inSide: AnchorSide = step.connectorIn || (outSide === "right" ? "left" : outSide === "bottom" ? "top" : outSide === "left" ? "right" : "bottom");
                    to = anchorPoint(bounds.x, bounds.y, bounds.w, bounds.h, inSide);
                } else {
                    to = anchorPoint(step.x, step.y, NODE_WIDTH, NODE_HEIGHT, step.connectorIn || "left");
                }
            } else if (parentIsGroup) {
                // Serial successor OF a group — connect from the group bounds outgoing edge
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
                isParallel: false,  // unified styling now
                isVertical,
                parentId: parent.id,
            };
        })
        .filter(Boolean) as Array<{
            key: string;
            from: { x: number; y: number };
            to: { x: number; y: number };
            mid: { x: number; y: number };
            isParallel: boolean;
            isVertical: boolean;
            parentId: string;
        }>;

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

    // Update ref for marquee intersection checks
    marqueeDataRef.current = { steps, delivPositions, storagePositions, inputPositions };

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

    if (steps.length === 0 && deliverables.length === 0 && storageEntries.length === 0 && inputs.length === 0) {
        return (
            <div className="jm-canvas" ref={canvasRef} tabIndex={0} onKeyDown={handleKeyDown}>
                <div className="jm-canvas__empty">
                    <Workflow size={40} className="jm-canvas__empty-icon" />
                    <div className="jm-canvas__empty-title">No Steps Yet</div>
                    <div className="jm-canvas__empty-desc">
                        Open Actions → Commands below and click + to add steps.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`jm-canvas ${dragging ? "jm-canvas--dragging" : ""} ${isSelecting ? "jm-canvas--selecting" : ""}`}
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            <div className="jm-canvas__inner" style={{ minWidth: maxX, minHeight: maxY }}>
                {/* SVG connector lines */}
                <svg className="jm-canvas__connectors" style={{ width: maxX, height: maxY }}>
                    <defs>
                        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="var(--border-medium)" />
                        </marker>
                        <marker id="arrowhead-parallel" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#a78bfa" />
                        </marker>
                        <marker id="arrowhead-deliv" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#c084fc" />
                        </marker>
                        <marker id="arrowhead-input" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#22d3ee" />
                        </marker>
                    </defs>

                    {/* Step→Step connectors */}
                    {connectors.map(conn => {
                        const cpOffset = 50;
                        const d = conn.isVertical
                            ? `M ${conn.from.x} ${conn.from.y} C ${conn.from.x} ${conn.from.y + cpOffset}, ${conn.to.x} ${conn.to.y - cpOffset}, ${conn.to.x} ${conn.to.y}`
                            : `M ${conn.from.x} ${conn.from.y} C ${conn.from.x + cpOffset} ${conn.from.y}, ${conn.to.x - cpOffset} ${conn.to.y}, ${conn.to.x} ${conn.to.y}`;
                        return (
                            <path
                                key={conn.key}
                                d={d}
                                className="jm-canvas__connector-line"
                                markerEnd="url(#arrowhead)"
                            />
                        );
                    })}

                    {/* Leaf→Deliverable connectors */}
                    {delivConnectors.map(conn => {
                        const d = `M ${conn.from.x} ${conn.from.y} C ${conn.from.x + 30} ${conn.from.y}, ${conn.to.x - 30} ${conn.to.y}, ${conn.to.x} ${conn.to.y}`;
                        return (
                            <path
                                key={conn.key}
                                d={d}
                                className="jm-canvas__connector-line jm-canvas__connector-line--deliverable"
                                markerEnd="url(#arrowhead-deliv)"
                            />
                        );
                    })}

                    {/* Storage→Root connectors */}
                    {storageConnectors.map(conn => {
                        const d = `M ${conn.from.x} ${conn.from.y} L ${conn.to.x} ${conn.to.y}`;
                        return (
                            <path
                                key={conn.key}
                                d={d}
                                className="jm-canvas__connector-line jm-canvas__connector-line--storage"
                            />
                        );
                    })}

                    {/* Input→Root connectors */}
                    {inputConnectors.map(conn => {
                        const d = `M ${conn.from.x} ${conn.from.y} L ${conn.to.x} ${conn.to.y}`;
                        return (
                            <path
                                key={conn.key}
                                d={d}
                                className="jm-canvas__connector-line jm-canvas__connector-line--input"
                            />
                        );
                    })}
                </svg>

                {/* ── Storage Nodes (top area) ── */}
                {storageEntries.map((entry, idx) => {
                    const pos = storagePositions[idx];
                    if (!pos) return null;
                    const isSelected = (selectedElement?.type === "storage" && selectedElement.index === idx) || isInMultiSelect("storage", idx);
                    return (
                        <div
                            key={`storage-${idx}`}
                            className={`jm-storage-node ${isSelected ? "jm-storage-node--selected" : ""} ${dragging?.specialKind === "storage" && dragging.specialIndex === idx ? "jm-storage-node--dragging" : ""}`}
                            style={{ position: "absolute", left: pos.x, top: pos.y, cursor: "grab", zIndex: dragging?.specialKind === "storage" && dragging.specialIndex === idx ? 10 : 1 }}
                            onMouseDown={(e) => handleSpecialNodeMouseDown(e, "storage", idx, pos.x, pos.y)}
                            onDoubleClick={() => onOpenStorageCard?.(idx)}
                        >
                            <div className="jm-storage-node__header">
                                <Database size={12} className="jm-storage-node__icon" />
                                <span className="jm-storage-node__key">{entry.key || "untitled"}</span>
                                <button
                                    className="jm-node__action-btn jm-node__action-btn--danger"
                                    onClick={(e) => { e.stopPropagation(); onRemoveStorage(idx); }}
                                    title="Remove"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                            <div className="jm-storage-node__value">
                                {entry.value ? entry.value.slice(0, 24) : "—"}
                            </div>
                        </div>
                    );
                })}

                {/* ── Input Nodes (top area, next to storage) ── */}
                {inputs.map((inp, idx) => {
                    const pos = inputPositions[idx];
                    if (!pos) return null;
                    const isSelected = (selectedElement?.type === "input" && selectedElement.index === idx) || isInMultiSelect("input", idx);
                    const sourceKind = inp.source?.kind || "hardcoded";
                    const sourceLabel: Record<string, string> = {
                        prompt: "⌨ prompt",
                        storage: "⛁ storage",
                        hardcoded: "⊙ literal",
                        artifact: "◆ artifact",
                    };
                    return (
                        <div
                            key={`input-${idx}`}
                            className={`jm-input-node ${isSelected ? "jm-input-node--selected" : ""} ${dragging?.specialKind === "input" && dragging.specialIndex === idx ? "jm-input-node--dragging" : ""}`}
                            style={{ position: "absolute", left: pos.x, top: pos.y, cursor: "grab", zIndex: dragging?.specialKind === "input" && dragging.specialIndex === idx ? 10 : 1 }}
                            onMouseDown={(e) => handleSpecialNodeMouseDown(e, "input", idx, pos.x, pos.y)}
                            onDoubleClick={() => onOpenInputCard?.(idx)}
                        >
                            <div className="jm-input-node__header">
                                <Tag size={12} className="jm-input-node__icon" />
                                <span className="jm-input-node__name">{inp.name || "untitled"}</span>
                                <button
                                    className="jm-node__action-btn jm-node__action-btn--danger"
                                    onClick={(e) => { e.stopPropagation(); onRemoveInput(idx); }}
                                    title="Remove"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                            <div className="jm-input-node__meta">
                                <span className="jm-input-node__type">{inp.type}</span>
                                <span className={`jm-input-node__source jm-input-node__source--${sourceKind}`}>
                                    {sourceLabel[sourceKind] || sourceKind}
                                </span>
                            </div>
                            <div className="jm-input-node__id">{inp.entityId ? inp.entityId.slice(0, 16) + "…" : "—"}</div>
                        </div>
                    );
                })}

                {/* ── Parallel Group Containers ── */}
                {steps.filter(s => isParallelGroup(s)).map(group => {
                    const children = steps.filter(s => s.parentId === group.id && s.isGroupChild);
                    const padding = 24;
                    const headerH = 34;
                    let boxX = group.x;
                    let boxY = group.y;
                    let boxW = 300;
                    let boxH = headerH + padding * 2;
                    if (children.length > 0) {
                        const minX = Math.min(...children.map(c => c.x));
                        const maxX = Math.max(...children.map(c => c.x + NODE_WIDTH));
                        const minY = Math.min(...children.map(c => c.y));
                        const maxY = Math.max(...children.map(c => c.y + NODE_HEIGHT));
                        boxX = minX - padding;
                        boxY = minY - padding - headerH;
                        boxW = Math.max(300, maxX - minX + NODE_WIDTH + padding * 2);
                        boxH = maxY - minY + NODE_HEIGHT + padding * 2 + headerH;
                    }
                    const isSelected = (selectedElement?.type === "step" && selectedElement.id === group.id) || isInMultiSelect("step", group.id);
                    const isDraggingGroup = dragging?.stepId === group.id;
                    return (
                        <div
                            key={`pg-${group.id}`}
                            className={`jm-parallel-group ${isSelected ? "jm-parallel-group--selected" : ""} ${isDraggingGroup ? "jm-parallel-group--dragging" : ""}`}
                            style={{
                                position: "absolute",
                                left: boxX,
                                top: boxY,
                                width: boxW,
                                height: boxH,
                                zIndex: isDraggingGroup ? 5 : 0,
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, group.id)}
                        >
                            <div className="jm-parallel-group__header">
                                <GitFork size={12} />
                                <span className="jm-parallel-group__label">{group.label || "Parallel"}</span>
                                <span className="jm-parallel-group__count">{children.length} {children.length === 1 ? "task" : "tasks"}</span>
                                <button
                                    className="jm-node__action-btn jm-node__action-btn--danger"
                                    onClick={(e) => { e.stopPropagation(); onRemoveStep(group.id); }}
                                    title="Remove parallel group"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                            {children.length === 0 && (
                                <div className="jm-parallel-group__empty">
                                    Drag steps here or set their parent to this group
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ── Step Nodes (draggable) ── */}
                {steps.filter(s => !isParallelGroup(s)).map((step, idx) => {
                    const stepIndex = steps.filter(s => {
                        // BFS order index based on parentId tree
                        return steps.indexOf(s) <= steps.indexOf(step);
                    }).length;
                    const isSelected = (selectedElement?.type === "step" && selectedElement.id === step.id) || isInMultiSelect("step", step.id);
                    return (
                        <div
                            key={step.id}
                            style={{
                                position: "absolute",
                                left: step.x,
                                top: step.y,
                                zIndex: dragging?.stepId === step.id ? 10 : 1,
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, step.id)}
                            onDoubleClick={() => onOpenStepCard?.(step.id)}
                        >
                            <JobNode
                                step={step}
                                index={idx}
                                total={steps.filter(s => !isParallelGroup(s)).length}
                                selected={isSelected}
                                isDragging={dragging?.stepId === step.id}
                                onRemove={() => onRemoveStep(step.id)}
                                childCount={steps.filter(s => s.parentId === step.id).length}
                            />
                            {/* Anchor dots — visible when selected */}
                            {isSelected && (
                                <>
                                    {(["top", "right", "bottom", "left"] as AnchorSide[]).map(side => {
                                        const isOut = step.connectorOut === side || (!step.connectorOut && side === "right");
                                        const isIn = step.connectorIn === side || (!step.connectorIn && side === "left");
                                        const pos = (() => {
                                            switch (side) {
                                                case "top":    return { left: NODE_WIDTH / 2 - 6, top: -6 };
                                                case "bottom": return { left: NODE_WIDTH / 2 - 6, top: NODE_HEIGHT - 6 };
                                                case "left":   return { left: -6, top: NODE_HEIGHT / 2 - 6 };
                                                case "right":  return { left: NODE_WIDTH - 6, top: NODE_HEIGHT / 2 - 6 };
                                            }
                                        })();
                                        return (
                                            <div
                                                key={`anchor-${side}`}
                                                className={`jm-anchor-dot ${isOut ? "jm-anchor-dot--out" : ""} ${isIn ? "jm-anchor-dot--in" : ""}`}
                                                style={{ position: "absolute", ...pos }}
                                                title={`${side}: ${isOut ? "OUT" : ""}${isIn ? "IN" : ""}${!isOut && !isIn ? "click to set" : ""}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Left click cycles outgoing anchor, right-click would cycle incoming
                                                    if (isOut) {
                                                        // Cycle out to next side
                                                        onUpdateAnchor(step.id, "connectorOut", nextAnchor(step.connectorOut));
                                                    } else if (isIn) {
                                                        onUpdateAnchor(step.id, "connectorIn", nextAnchor(step.connectorIn));
                                                    } else {
                                                        // Set this side as outgoing
                                                        onUpdateAnchor(step.id, "connectorOut", side);
                                                    }
                                                }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    // Right click sets incoming anchor
                                                    onUpdateAnchor(step.id, "connectorIn", side);
                                                }}
                                            />
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    );
                })}

                {/* ── Deliverable Nodes (end of flow) ── */}
                {deliverables.map((d, idx) => {
                    const pos = delivPositions[idx];
                    if (!pos) return null;
                    const isSelected = (selectedElement?.type === "deliverable" && selectedElement.index === idx) || isInMultiSelect("deliverable", idx);
                    return (
                        <div
                            key={`deliv-${idx}`}
                            className={`jm-deliverable-node ${isSelected ? "jm-deliverable-node--selected" : ""} ${dragging?.specialKind === "deliverable" && dragging.specialIndex === idx ? "jm-deliverable-node--dragging" : ""}`}
                            style={{ position: "absolute", left: pos.x, top: pos.y, cursor: "grab", zIndex: dragging?.specialKind === "deliverable" && dragging.specialIndex === idx ? 10 : 1 }}
                            onMouseDown={(e) => handleSpecialNodeMouseDown(e, "deliverable", idx, pos.x, pos.y)}
                            onDoubleClick={() => onOpenDeliverableCard?.(idx)}
                        >
                            <div className="jm-deliverable-node__header">
                                <Package size={12} className="jm-deliverable-node__icon" />
                                <span className="jm-deliverable-node__label">{d.label || d.key || "Untitled"}</span>
                                <button
                                    className="jm-node__action-btn jm-node__action-btn--danger"
                                    onClick={(e) => { e.stopPropagation(); onRemoveDeliverable(idx); }}
                                    title="Remove"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                            <div className="jm-deliverable-node__meta">
                                <span className="jm-deliverable-node__type">{d.type}</span>
                                {d.description && (
                                    <span className="jm-deliverable-node__desc">{d.description.slice(0, 30)}</span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Marquee selection overlay */}
                {selectionRect && (
                    <div
                        className="jm-canvas__marquee"
                        style={{
                            position: "absolute",
                            left: selectionRect.left,
                            top: selectionRect.top,
                            width: selectionRect.width,
                            height: selectionRect.height,
                        }}
                    />
                )}
            </div>
        </div>
    );
}

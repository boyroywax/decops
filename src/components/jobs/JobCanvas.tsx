import { useRef, useState, useEffect, useCallback } from "react";
import { Workflow, Package, Database, Tag, X } from "lucide-react";
import { JobNode } from "./JobNode";
import type { StudioStep, SelectedElement } from "../views/StudioView";
import type { JobDeliverable, EntityInput } from "../../types";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 140;
const DELIV_WIDTH = 180;
const DELIV_HEIGHT = 70;
const STORAGE_WIDTH = 160;
const STORAGE_HEIGHT = 56;
const INPUT_WIDTH = 170;
const INPUT_HEIGHT = 56;

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
    onUpdateFlowType: (stepId: string, flowType: "serial" | "parallel") => void;
    selectedElements: NonNullable<SelectedElement>[];
    onMultiSelect: (items: NonNullable<SelectedElement>[]) => void;
    onDeleteSelected: () => void;
}

export function JobCanvas({
    steps, deliverables, storageEntries, inputs, selectedElement,
    onSelect, onRemoveStep, onRemoveDeliverable, onRemoveStorage, onRemoveInput,
    onUpdatePosition, onUpdateFlowType, selectedElements, onMultiSelect, onDeleteSelected,
}: JobCanvasProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<{ stepId: string; offsetX: number; offsetY: number } | null>(null);
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
        if ((e.target as HTMLElement).closest('.jm-node__action-btn, .jm-canvas__flow-badge')) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const step = steps.find(s => s.id === stepId);
        if (!step) return;
        const rect = canvas.getBoundingClientRect();
        setDragging({
            stepId,
            offsetX: e.clientX - rect.left + canvas.scrollLeft - step.x,
            offsetY: e.clientY - rect.top + canvas.scrollTop - step.y,
        });
        onSelect({ type: "step", id: stepId });
        e.preventDefault();
    }, [steps, onSelect]);

    useEffect(() => {
        if (!dragging) return;
        const handleMove = (e: MouseEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = Math.max(0, e.clientX - rect.left + canvas.scrollLeft - dragging.offsetX);
            const y = Math.max(0, e.clientY - rect.top + canvas.scrollTop - dragging.offsetY);
            onUpdatePosition(dragging.stepId, x, y);
        };
        const handleUp = () => setDragging(null);
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [dragging, onUpdatePosition]);

    // ── Marquee multi-select ──
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('.jm-node, .jm-deliverable-node, .jm-storage-node, .jm-input-node, .jm-canvas__flow-badge')) return;
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

    // ── Build graph-based connectors from parentId ──
    const connectors = steps
        .filter(s => s.parentId !== null)
        .map(step => {
            const parent = steps.find(p => p.id === step.parentId);
            if (!parent) return null;
            const siblings = steps.filter(s => s.parentId === step.parentId);
            const isParallel = parent.flowType === "parallel" && siblings.length > 1;

            // Determine direction: vertical if child is more below than to the right
            const parentCX = parent.x + NODE_WIDTH / 2;
            const parentCY = parent.y + NODE_HEIGHT / 2;
            const childCX = step.x + NODE_WIDTH / 2;
            const childCY = step.y + NODE_HEIGHT / 2;
            const isVertical = Math.abs(childCY - parentCY) > Math.abs(childCX - parentCX);

            let fromX: number, fromY: number, toX: number, toY: number;
            if (isVertical) {
                // Bottom-center of parent → top-center of child
                fromX = parentCX;
                fromY = parent.y + NODE_HEIGHT;
                toX = childCX;
                toY = step.y;
            } else {
                // Right-center of parent → left-center of child
                fromX = parent.x + NODE_WIDTH;
                fromY = parent.y + NODE_HEIGHT / 2;
                toX = step.x;
                toY = step.y + NODE_HEIGHT / 2;
            }

            return {
                key: `${parent.id}-${step.id}`,
                from: { x: fromX, y: fromY },
                to: { x: toX, y: toY },
                mid: { x: (fromX + toX) / 2, y: (fromY + toY) / 2 },
                isParallel,
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

    // ── Flow type badges — show on every connector so user can always toggle ──
    const flowBadges = connectors.map(conn => ({
        key: `flow-${conn.key}`,
        parentId: conn.parentId,
        flowType: steps.find(s => s.id === conn.parentId)?.flowType || "serial",
        x: conn.mid.x,
        y: conn.mid.y,
        isVertical: conn.isVertical,
    }));

    // ── Leaf steps (steps with no children) for deliverable connections ──
    const idsBeingParent = new Set(steps.filter(s => s.parentId !== null).map(s => s.parentId!));
    const leafSteps = steps.filter(s => !idsBeingParent.has(s.id));
    const leafMaxX = leafSteps.length > 0 ? Math.max(...leafSteps.map(s => s.x + NODE_WIDTH)) : 60;
    const leafAvgY = leafSteps.length > 0
        ? leafSteps.reduce((sum, s) => sum + s.y, 0) / leafSteps.length + NODE_HEIGHT / 2
        : 80;

    // ── Deliverable positions ──
    const delivStartX = steps.length > 0 ? leafMaxX + 120 : 400;
    const delivBlockHeight = deliverables.length * (DELIV_HEIGHT + 12) - 12;
    const delivStartY = Math.max(20, leafAvgY - delivBlockHeight / 2);
    const delivPositions = deliverables.map((_, i) => ({
        x: delivStartX,
        y: delivStartY + i * (DELIV_HEIGHT + 12),
    }));

    // ── Storage positions ──
    const storageStartX = 60;
    const storagePositions = storageEntries.map((_, i) => ({
        x: storageStartX + i * (STORAGE_WIDTH + 16),
        y: 10,
    }));

    // ── Input positions (top area, right of storage) ──
    const inputStartX = storageEntries.length > 0
        ? storageStartX + storageEntries.length * (STORAGE_WIDTH + 16) + 24
        : 60;
    const inputPositions = inputs.map((_, i) => ({
        x: inputStartX + i * (INPUT_WIDTH + 16),
        y: 10,
    }));

    // Update ref for marquee intersection checks
    marqueeDataRef.current = { steps, delivPositions, storagePositions, inputPositions };

    // ── Canvas bounds ──
    const allXs = [800, ...steps.map(s => s.x + NODE_WIDTH + 100), ...delivPositions.map(p => p.x + DELIV_WIDTH + 60), ...inputPositions.map(p => p.x + INPUT_WIDTH + 60)];
    const allYs = [400, ...steps.map(s => s.y + NODE_HEIGHT + 100), ...delivPositions.map(p => p.y + DELIV_HEIGHT + 60)];
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
    const rootSteps = steps.filter(s => s.parentId === null);
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
                        const cpOffset = 40;
                        const d = conn.isVertical
                            ? `M ${conn.from.x} ${conn.from.y} C ${conn.from.x} ${conn.from.y + cpOffset}, ${conn.to.x} ${conn.to.y - cpOffset}, ${conn.to.x} ${conn.to.y}`
                            : `M ${conn.from.x} ${conn.from.y} C ${conn.from.x + cpOffset} ${conn.from.y}, ${conn.to.x - cpOffset} ${conn.to.y}, ${conn.to.x} ${conn.to.y}`;
                        return (
                            <path
                                key={conn.key}
                                d={d}
                                className={`jm-canvas__connector-line ${conn.isParallel ? "jm-canvas__connector-line--parallel" : ""}`}
                                markerEnd={conn.isParallel ? "url(#arrowhead-parallel)" : "url(#arrowhead)"}
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

                {/* Flow type toggle badges (only on parents with multiple children / fan-out) */}
                {flowBadges.map(badge => (
                    <button
                        key={badge.key}
                        className={`jm-canvas__flow-badge jm-canvas__flow-badge--${badge.flowType}${badge.isVertical ? " jm-canvas__flow-badge--vertical" : ""}`}
                        style={{
                            left: badge.isVertical ? badge.x : badge.x - 28,
                            top: badge.y - 10,
                        }}
                        onClick={() => onUpdateFlowType(badge.parentId, badge.flowType === "serial" ? "parallel" : "serial")}
                        title={`Children run: ${badge.flowType}. Click to toggle.`}
                    >
                        {badge.isVertical
                            ? (badge.flowType === "serial" ? "↓ serial" : "⇊ parallel")
                            : (badge.flowType === "serial" ? "→ serial" : "⇉ parallel")
                        }
                    </button>
                ))}

                {/* ── Storage Nodes (top area) ── */}
                {storageEntries.map((entry, idx) => {
                    const pos = storagePositions[idx];
                    if (!pos) return null;
                    const isSelected = (selectedElement?.type === "storage" && selectedElement.index === idx) || isInMultiSelect("storage", idx);
                    return (
                        <div
                            key={`storage-${idx}`}
                            className={`jm-storage-node ${isSelected ? "jm-storage-node--selected" : ""}`}
                            style={{ position: "absolute", left: pos.x, top: pos.y }}
                            onClick={() => onSelect({ type: "storage", index: idx })}
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
                    return (
                        <div
                            key={`input-${idx}`}
                            className={`jm-input-node ${isSelected ? "jm-input-node--selected" : ""}`}
                            style={{ position: "absolute", left: pos.x, top: pos.y }}
                            onClick={() => onSelect({ type: "input", index: idx })}
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
                                <span className="jm-input-node__id">{inp.entityId ? inp.entityId.slice(0, 12) + "…" : "—"}</span>
                            </div>
                        </div>
                    );
                })}

                {/* ── Step Nodes (draggable) ── */}
                {steps.map((step, idx) => {
                    const stepIndex = steps.filter(s => {
                        // BFS order index based on parentId tree
                        return steps.indexOf(s) <= steps.indexOf(step);
                    }).length;
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
                        >
                            <JobNode
                                step={step}
                                index={idx}
                                total={steps.length}
                                selected={(selectedElement?.type === "step" && selectedElement.id === step.id) || isInMultiSelect("step", step.id)}
                                isDragging={dragging?.stepId === step.id}
                                onRemove={() => onRemoveStep(step.id)}
                                childCount={steps.filter(s => s.parentId === step.id).length}
                            />
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
                            className={`jm-deliverable-node ${isSelected ? "jm-deliverable-node--selected" : ""}`}
                            style={{ position: "absolute", left: pos.x, top: pos.y }}
                            onClick={() => onSelect({ type: "deliverable", index: idx })}
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

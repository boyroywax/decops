import type { AnchorSide } from "@/types/studio";

// Re-exported from types/studio.ts — canonical source of truth
export { NODE_WIDTH, NODE_HEIGHT, DELIV_WIDTH, DELIV_HEIGHT, STORAGE_WIDTH, STORAGE_HEIGHT, INPUT_WIDTH, INPUT_HEIGHT } from "@/types/studio";

// ── Anchor cycling ──
export const ANCHOR_ORDER: AnchorSide[] = ["right", "bottom", "left", "top"];

export function nextAnchor(current: AnchorSide | undefined): AnchorSide {
    const idx = ANCHOR_ORDER.indexOf(current || "right");
    return ANCHOR_ORDER[(idx + 1) % ANCHOR_ORDER.length];
}

/** Compute the (x,y) point on a node's edge for a given anchor side. */
export function anchorPoint(
    nodeX: number,
    nodeY: number,
    w: number,
    h: number,
    side: AnchorSide,
): { x: number; y: number } {
    switch (side) {
        case "top":    return { x: nodeX + w / 2, y: nodeY };
        case "bottom": return { x: nodeX + w / 2, y: nodeY + h };
        case "left":   return { x: nodeX,         y: nodeY + h / 2 };
        case "right":  return { x: nodeX + w,      y: nodeY + h / 2 };
    }
}

/** Check if two axis-aligned rectangles intersect. */
export function rectsIntersect(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Auto-save / restore the Studio workspace draft in localStorage.
 *
 * Extracted from StudioView.tsx to reduce file size.
 */
import type { StudioStep } from "@/types/studio";
import type { JobDeliverable, EntityInput, JobTrigger } from "@/types";

// ── Constants ──

export const STUDIO_DRAFT_KEY = "decops_studio_draft";
export const DRAFT_SAVE_DELAY = 800; // ms debounce

// ── Draft shape ──

export interface StudioDraft {
    name: string;
    description: string;
    editingJobId: string | null;
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    triggers: JobTrigger[];
    storageNodePositions: Record<number, { x: number; y: number }>;
    inputNodePositions: Record<number, { x: number; y: number }>;
    deliverableNodePositions: Record<number, { x: number; y: number }>;
    savedAt: number;
}

// ── Helpers ──

export function readDraft(): StudioDraft | null {
    try {
        const raw = localStorage.getItem(STUDIO_DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as StudioDraft;
    } catch {
        return null;
    }
}

export function clearDraft(): void {
    try { localStorage.removeItem(STUDIO_DRAFT_KEY); } catch { /* noop */ }
}

export function saveDraft(draft: StudioDraft): void {
    try {
        localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
    } catch { /* storage full — silently skip */ }
}

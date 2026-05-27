/**
 * useStudioDraft — encapsulates Studio's autosave-to-localStorage effect.
 *
 * Extracted from StudioView.tsx per §3.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 *
 * Usage:
 *   const { initialDraft } = useStudioDraft(draftValues);
 *
 * Consumer seeds initial state from `initialDraft` (read once on mount) and
 * passes the live values back in via `draftValues`. The hook debounces writes
 * to localStorage and clears storage when the canvas becomes empty.
 *
 * Imports the underlying I/O from `../utils/studioDraft`.
 */
import { useEffect, useRef } from "react";
import {
    readDraft,
    clearDraft,
    saveDraft,
    DRAFT_SAVE_DELAY,
    type StudioDraft,
} from "@/toolkits/studio/utils/studioDraft";

export interface UseStudioDraftValues {
    name: string;
    description: string;
    editingJobId: string | null;
    steps: StudioDraft["steps"];
    deliverables: StudioDraft["deliverables"];
    storageEntries: StudioDraft["storageEntries"];
    inputs: StudioDraft["inputs"];
    triggers: StudioDraft["triggers"];
    storageNodePositions: StudioDraft["storageNodePositions"];
    inputNodePositions: StudioDraft["inputNodePositions"];
    deliverableNodePositions: StudioDraft["deliverableNodePositions"];
}

export interface UseStudioDraftResult {
    /** Draft read once on mount; consumer uses this to seed initial state. */
    initialDraft: StudioDraft | null;
}

export function useStudioDraft(values: UseStudioDraftValues): UseStudioDraftResult {
    // Read draft exactly once for initial state seeding.
    const initialRef = useRef<StudioDraft | null>(null);
    if (initialRef.current === null) {
        initialRef.current = readDraft();
    }

    // Debounced autosave whenever any draft field changes.
    useEffect(() => {
        const timer = setTimeout(() => {
            const hasSomething = values.name
                || values.description
                || values.steps.length
                || values.deliverables.length
                || values.storageEntries.length
                || values.inputs.length
                || values.triggers.length;
            if (!hasSomething) {
                clearDraft();
                return;
            }
            saveDraft({
                name: values.name,
                description: values.description,
                editingJobId: values.editingJobId,
                steps: values.steps,
                deliverables: values.deliverables,
                storageEntries: values.storageEntries,
                inputs: values.inputs,
                triggers: values.triggers,
                storageNodePositions: values.storageNodePositions,
                inputNodePositions: values.inputNodePositions,
                deliverableNodePositions: values.deliverableNodePositions,
                savedAt: Date.now(),
            });
        }, DRAFT_SAVE_DELAY);
        return () => clearTimeout(timer);
    }, [
        values.name, values.description, values.editingJobId,
        values.steps, values.deliverables, values.storageEntries,
        values.inputs, values.triggers,
        values.storageNodePositions, values.inputNodePositions, values.deliverableNodePositions,
    ]);

    return { initialDraft: initialRef.current };
}

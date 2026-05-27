/**
 * useStudioJobBuilder — encapsulates Studio's job serialization handlers.
 *
 * Extracted from StudioView.tsx per §3.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 *
 * Provides `handleRun`, `handleSave`, `handleNew`, and `loadJob` — the four
 * UI verbs that translate between Studio state and a `JobDefinition`. The
 * underlying pure helpers live in `../utils/studioJobBuilder`.
 *
 * Consumer passes its state + setters in; the hook returns memoized
 * callbacks that are stable for the lifetime of the inputs.
 */
import { useCallback } from "react";
import type {
    Job,
    JobDefinition,
    JobDeliverable,
    EntityInput,
    JobTrigger,
} from "@/types";
import type {
    StudioStep,
    SelectedElement,
} from "@/toolkits/studio/types/studio";
import {
    buildJobDef as buildJobDefFn,
    loadJobToStudioState,
} from "@/toolkits/studio/utils/studioJobBuilder";
import { clearDraft } from "@/toolkits/studio/utils/studioDraft";

export interface UseStudioJobBuilderParams {
    // ── State ──
    name: string;
    description: string;
    editingJobId: string | null;
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    triggers: JobTrigger[];
    derivedMode: "serial" | "parallel" | "mixed";

    // ── Setters ──
    setName: (v: string) => void;
    setDescription: (v: string) => void;
    setEditingJobId: (v: string | null) => void;
    setSteps: (v: StudioStep[]) => void;
    setDeliverables: (v: JobDeliverable[]) => void;
    setStorageEntries: (v: Array<{ key: string; value: string }>) => void;
    setInputs: (v: EntityInput[]) => void;
    setTriggers: (v: JobTrigger[]) => void;
    setSelectedElement: (v: SelectedElement) => void;
    setSelectedElements: (v: NonNullable<SelectedElement>[]) => void;
    setShowCatalog: (v: boolean) => void;
    setStorageNodePositions: (v: Record<number, { x: number; y: number }>) => void;
    setInputNodePositions: (v: Record<number, { x: number; y: number }>) => void;
    setDeliverableNodePositions: (v: Record<number, { x: number; y: number }>) => void;

    // ── External callbacks ──
    onSaveJob: (job: JobDefinition) => void;
    onRunJob: (job: JobDefinition) => Job;
}

export interface UseStudioJobBuilderResult {
    buildJobDef: () => JobDefinition | null;
    handleRun: () => void;
    handleSave: () => void;
    handleNew: () => void;
    loadJob: (job: JobDefinition) => void;
}

export function useStudioJobBuilder(p: UseStudioJobBuilderParams): UseStudioJobBuilderResult {
    const buildJobDef = useCallback((): JobDefinition | null => {
        return buildJobDefFn({
            name: p.name,
            description: p.description,
            editingJobId: p.editingJobId,
            steps: p.steps,
            deliverables: p.deliverables,
            storageEntries: p.storageEntries,
            inputs: p.inputs,
            triggers: p.triggers,
            derivedMode: p.derivedMode,
        });
    }, [
        p.name, p.description, p.editingJobId,
        p.steps, p.deliverables, p.storageEntries,
        p.inputs, p.triggers, p.derivedMode,
    ]);

    const handleRun = useCallback(() => {
        const job = buildJobDef();
        if (job) p.onRunJob(job);
    }, [buildJobDef, p.onRunJob]);

    const handleSave = useCallback(() => {
        const job = buildJobDef();
        if (job) {
            p.onSaveJob(job);
            p.setEditingJobId(job.id);
            clearDraft(); // saved — no longer a draft
        }
    }, [buildJobDef, p.onSaveJob, p.setEditingJobId]);

    const loadJob = useCallback((job: JobDefinition) => {
        const result = loadJobToStudioState(job);
        p.setName(job.name);
        p.setDescription(job.description);
        p.setEditingJobId(job.id);
        p.setSteps(result.steps);
        p.setDeliverables(result.deliverables);
        p.setStorageEntries(result.storageEntries);
        p.setInputs(result.inputs);
        p.setTriggers(result.triggers);
        p.setSelectedElement(null);
        p.setSelectedElements([]);
        p.setShowCatalog(false);
        p.setStorageNodePositions({});
        p.setInputNodePositions({});
        p.setDeliverableNodePositions({});
    }, [
        p.setName, p.setDescription, p.setEditingJobId,
        p.setSteps, p.setDeliverables, p.setStorageEntries, p.setInputs, p.setTriggers,
        p.setSelectedElement, p.setSelectedElements, p.setShowCatalog,
        p.setStorageNodePositions, p.setInputNodePositions, p.setDeliverableNodePositions,
    ]);

    const handleNew = useCallback(() => {
        p.setName("");
        p.setDescription("");
        p.setEditingJobId(null);
        p.setSteps([]);
        p.setSelectedElement(null);
        p.setSelectedElements([]);
        p.setDeliverables([]);
        p.setStorageEntries([]);
        p.setInputs([]);
        p.setTriggers([]);
        p.setStorageNodePositions({});
        p.setInputNodePositions({});
        p.setDeliverableNodePositions({});
        clearDraft(); // reset — discard any saved draft
    }, [
        p.setName, p.setDescription, p.setEditingJobId,
        p.setSteps, p.setSelectedElement, p.setSelectedElements,
        p.setDeliverables, p.setStorageEntries, p.setInputs, p.setTriggers,
        p.setStorageNodePositions, p.setInputNodePositions, p.setDeliverableNodePositions,
    ]);

    return { buildJobDef, handleRun, handleSave, handleNew, loadJob };
}

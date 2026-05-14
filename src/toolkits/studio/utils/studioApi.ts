/**
 * Factory for building the `StudioAPI` object that gets registered with StudioContext.
 *
 * This was a ~250-line block inside the StudioView component's `useEffect`.
 * Extracted to keep StudioView focused on state + UI.
 */
import { registry } from "@/services/commands/registry";
import type { StudioAPI, StudioState } from "@/toolkits/studio/StudioContext";
import type { JobDefinition, JobDeliverable, EntityInput, JobTrigger, StepHandler } from "@/types";
import type { StudioStep, OutputMapping, InputBinding } from "@/toolkits/studio/types/studio";
import { isParallelGroup, NODE_SPACING_X, NODE_SPACING_Y, INITIAL_X, INITIAL_Y } from "@/toolkits/studio/types/studio";
import { buildJobDefFromRefs } from "./studioJobBuilder";

export interface StudioRefs {
    // State refs
    name: React.MutableRefObject<string>;
    description: React.MutableRefObject<string>;
    editingJobId: React.MutableRefObject<string | null>;
    derivedMode: React.MutableRefObject<string>;
    steps: React.MutableRefObject<StudioStep[]>;
    deliverables: React.MutableRefObject<JobDeliverable[]>;
    storageEntries: React.MutableRefObject<Array<{ key: string; value: string }>>;
    inputs: React.MutableRefObject<EntityInput[]>;
    triggers: React.MutableRefObject<JobTrigger[]>;
    savedJobs: React.MutableRefObject<JobDefinition[]>;

    // Callback refs
    addStep: React.MutableRefObject<(cid: string) => string>;
    removeStep: React.MutableRefObject<(id: string) => void>;
    updateStepArg: React.MutableRefObject<(sid: string, arg: string, val: unknown) => void>;
    updateStepPreCondition: React.MutableRefObject<(sid: string, cond: string) => void>;
    updateStepPostCondition: React.MutableRefObject<(sid: string, cond: string) => void>;
    updateStepPosition: React.MutableRefObject<(sid: string, x: number, y: number) => void>;
    addParallelGroup: React.MutableRefObject<() => string>;
    updateStepOutputMappings: React.MutableRefObject<(sid: string, m: OutputMapping[]) => void>;
    updateStepInputBindings: React.MutableRefObject<(sid: string, b: Record<string, InputBinding>) => void>;
    updateStepModel: React.MutableRefObject<(sid: string, modelId: string | undefined) => void>;
    updateStepOnSuccess: React.MutableRefObject<(sid: string, handler: StepHandler | undefined) => void>;
    updateStepOnFailure: React.MutableRefObject<(sid: string, handler: StepHandler | undefined) => void>;
    buildJobDef: React.MutableRefObject<() => JobDefinition | null>;
    handleRun: React.MutableRefObject<() => void>;
    handleSave: React.MutableRefObject<() => void>;
    loadJob: React.MutableRefObject<(job: JobDefinition) => void>;
    handleNew: React.MutableRefObject<() => void>;
}

export interface StudioSetters {
    setName: (n: string) => void;
    setDescription: (d: string) => void;
    setEditingJobId: (id: string | null) => void;
    setSteps: React.Dispatch<React.SetStateAction<StudioStep[]>>;
    setDeliverables: React.Dispatch<React.SetStateAction<JobDeliverable[]>>;
    setStorageEntries: React.Dispatch<React.SetStateAction<Array<{ key: string; value: string }>>>;
    setInputs: React.Dispatch<React.SetStateAction<EntityInput[]>>;
    setTriggers: React.Dispatch<React.SetStateAction<JobTrigger[]>>;
}

export function createStudioAPI(
    refs: StudioRefs,
    setters: StudioSetters,
    onSaveJob: (job: JobDefinition) => void,
    onRunJob: (job: JobDefinition) => { id?: string } | undefined,
): StudioAPI {
    return {
        getState: (): StudioState => ({
            name: refs.name.current,
            description: refs.description.current,
            editingJobId: refs.editingJobId.current,
            mode: refs.derivedMode.current as "serial" | "parallel",
            steps: refs.steps.current,
            deliverables: refs.deliverables.current,
            storageEntries: refs.storageEntries.current,
            inputs: refs.inputs.current,
        }),
        setName: (n) => { setters.setName(n); refs.name.current = n; },
        setDescription: (d) => { setters.setDescription(d); refs.description.current = d; },
        addStep: (cid) => {
            const stepId = refs.addStep.current(cid);
            if (stepId) {
                // Sync refs from React state after a microtask so the updater has run
                // For immediate reads, compute position from refs.steps.current
                const prev = refs.steps.current;
                const command = registry.get(cid);
                const args: Record<string, unknown> = {};
                if (command) {
                    Object.entries(command.args).forEach(([key, def]) => {
                        if (def.defaultValue !== undefined) args[key] = def.defaultValue;
                        else if (def.type === "boolean") args[key] = false;
                        else if (def.type === "string") args[key] = "";
                        else if (def.type === "number") args[key] = 0;
                        else args[key] = null;
                    });
                }
                // Compute position consistent with what StudioView's addStep does
                let parentId: string | null = null;
                if (prev.length > 0) {
                    const idsBeingParent = new Set(prev.filter(s => s.parentId !== null).map(s => s.parentId!));
                    const serialSteps = prev.filter(s => !s.isGroupChild);
                    const leaves = serialSteps.filter(s => !idsBeingParent.has(s.id));
                    const candidates = leaves.length > 0 ? leaves : serialSteps;
                    parentId = candidates.length > 0 ? candidates[candidates.length - 1].id : prev[prev.length - 1].id;
                }
                const parent = parentId ? prev.find(s => s.id === parentId) : null;
                const siblings = parentId ? prev.filter(s => s.parentId === parentId && !s.isGroupChild) : [];
                const x = parent ? parent.x + NODE_SPACING_X : INITIAL_X;
                const y = siblings.length > 0
                    ? Math.max(...siblings.map(s => s.y)) + NODE_SPACING_Y
                    : (parent ? parent.y : INITIAL_Y);

                refs.steps.current = [...refs.steps.current, {
                    id: stepId, commandId: cid, args, inputBindings: {},
                    preCondition: "", postCondition: "",
                    parentId, outputMappings: [], x, y,
                }];
            }
            return stepId;
        },
        removeStep: (id) => refs.removeStep.current(id),
        updateStepArg: (sid, arg, val) => {
            refs.updateStepArg.current(sid, arg, val);
            refs.steps.current = refs.steps.current.map(s =>
                s.id === sid ? { ...s, args: { ...s.args, [arg]: val } } : s
            );
        },
        updateStepPreCondition: (sid, cond) => refs.updateStepPreCondition.current(sid, cond),
        updateStepPostCondition: (sid, cond) => refs.updateStepPostCondition.current(sid, cond),
        updateStepPosition: (sid, x, y) => refs.updateStepPosition.current(sid, x, y),
        addParallelGroup: () => refs.addParallelGroup.current(),
        reparentStep: (stepId, newParentId, asGroupChild = false) => {
            // When reparenting into a parallel group, reposition the step
            setters.setSteps(prev => {
                const parent = newParentId ? prev.find(s => s.id === newParentId) : null;
                const step = prev.find(s => s.id === stepId);
                if (!step) return prev;

                let x = step.x;
                let y = step.y;
                if (asGroupChild && parent && isParallelGroup(parent)) {
                    const groupChildren = prev.filter(s => s.parentId === newParentId && s.isGroupChild && s.id !== stepId);
                    x = parent.x;
                    y = groupChildren.length > 0
                        ? Math.max(...groupChildren.map(s => s.y)) + NODE_SPACING_Y
                        : parent.y;
                }
                return prev.map(s => s.id === stepId ? { ...s, parentId: newParentId, isGroupChild: asGroupChild, x, y } : s);
            });
            // Mirror in refs
            const parent = newParentId ? refs.steps.current.find(s => s.id === newParentId) : null;
            const step = refs.steps.current.find(s => s.id === stepId);
            if (step) {
                let x = step.x;
                let y = step.y;
                if (asGroupChild && parent && isParallelGroup(parent)) {
                    const groupChildren = refs.steps.current.filter(s => s.parentId === newParentId && s.isGroupChild && s.id !== stepId);
                    x = parent.x;
                    y = groupChildren.length > 0
                        ? Math.max(...groupChildren.map(s => s.y)) + NODE_SPACING_Y
                        : parent.y;
                }
                refs.steps.current = refs.steps.current.map(s => s.id === stepId ? { ...s, parentId: newParentId, isGroupChild: asGroupChild, x, y } : s);
            }
        },
        updateStepOutputMappings: (sid, m) => refs.updateStepOutputMappings.current(sid, m),
        updateStepInputBindings: (sid, b) => refs.updateStepInputBindings.current(sid, b),
        updateStepModel: (sid, modelId) => {
            refs.updateStepModel.current(sid, modelId || undefined);
            refs.steps.current = refs.steps.current.map(s =>
                s.id === sid ? { ...s, modelId: modelId || undefined } : s
            );
        },
        updateStepOnSuccess: (sid, handler) => {
            refs.updateStepOnSuccess.current(sid, handler);
            refs.steps.current = refs.steps.current.map(s =>
                s.id === sid ? { ...s, onSuccess: handler } : s
            );
        },
        updateStepOnFailure: (sid, handler) => {
            refs.updateStepOnFailure.current(sid, handler);
            refs.steps.current = refs.steps.current.map(s =>
                s.id === sid ? { ...s, onFailure: handler } : s
            );
        },
        addDeliverableEntry: (d) => {
            setters.setDeliverables(prev => [...prev, d]);
            refs.deliverables.current = [...refs.deliverables.current, d];
        },
        updateDeliverable: (index, field, value) => {
            setters.setDeliverables(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
        },
        removeDeliverableEntry: (index) => {
            setters.setDeliverables(prev => prev.filter((_, i) => i !== index));
        },
        addStorageEntryWithValues: (key, value) => {
            setters.setStorageEntries(prev => [...prev, { key, value }]);
            refs.storageEntries.current = [...refs.storageEntries.current, { key, value }];
        },
        updateStorageEntry: (index, field, val) => {
            setters.setStorageEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: val } : e));
        },
        removeStorageEntry: (index) => {
            setters.setStorageEntries(prev => prev.filter((_, i) => i !== index));
        },
        addInput: (inp: EntityInput) => {
            setters.setInputs(prev => [...prev, inp]);
            refs.inputs.current = [...refs.inputs.current, inp];
        },
        updateInput: (index, field, value) => {
            setters.setInputs(prev => prev.map((inp, i) => i === index ? { ...inp, [field]: value } : inp));
            refs.inputs.current = refs.inputs.current.map((inp, i) => i === index ? { ...inp, [field]: value } : inp);
        },
        removeInput: (index) => {
            setters.setInputs(prev => prev.filter((_, i) => i !== index));
            refs.inputs.current = refs.inputs.current.filter((_, i) => i !== index);
        },
        addTrigger: (event, id, filter, label, cron) => {
            const triggerId = id || `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const newTrigger: JobTrigger = { id: triggerId, event, enabled: true, filter, label, cron };
            setters.setTriggers(prev => [...prev, newTrigger]);
            refs.triggers.current = [...refs.triggers.current, newTrigger];
        },
        updateTrigger: (id, patch) => {
            setters.setTriggers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
            refs.triggers.current = refs.triggers.current.map(t => t.id === id ? { ...t, ...patch } : t);
        },
        removeTrigger: (id) => {
            setters.setTriggers(prev => prev.filter(t => t.id !== id));
            refs.triggers.current = refs.triggers.current.filter(t => t.id !== id);
        },
        saveJob: () => {
            const result = buildJobDefFromRefs({
                name: refs.name.current,
                description: refs.description.current,
                editingJobId: refs.editingJobId.current,
                steps: refs.steps.current,
                deliverables: refs.deliverables.current,
                storageEntries: refs.storageEntries.current,
                inputs: refs.inputs.current,
                triggers: refs.triggers.current,
            });
            if ("error" in result) return result;
            onSaveJob(result);
            setters.setEditingJobId(result.id);
            refs.editingJobId.current = result.id;
            return { saved: true, id: result.id, name: result.name };
        },
        runJob: () => {
            const result = buildJobDefFromRefs({
                name: refs.name.current,
                description: refs.description.current,
                editingJobId: refs.editingJobId.current,
                steps: refs.steps.current,
                deliverables: refs.deliverables.current,
                storageEntries: refs.storageEntries.current,
                inputs: refs.inputs.current,
                triggers: refs.triggers.current,
            });
            if ("error" in result) return result;
            const runtimeJob = onRunJob(result);
            return {
                running: true,
                id: result.id,
                name: result.name,
                stepCount: result.steps.length,
                ...(runtimeJob?.id ? { runtimeJobId: runtimeJob.id } : {}),
            };
        },
        loadJobById: (id) => {
            const catalog = refs.savedJobs.current;
            const job = catalog.find(j => j.id === id);
            if (!job) return { error: `Job definition "${id}" not found in catalog.` };
            refs.loadJob.current(job);
            return { loaded: true, id: job.id, name: job.name };
        },
        clearCanvas: () => {
            refs.handleNew.current();
            refs.name.current = "";
            refs.description.current = "";
            refs.editingJobId.current = null;
            refs.steps.current = [];
            refs.deliverables.current = [];
            refs.storageEntries.current = [];
            refs.inputs.current = [];
            refs.triggers.current = [];
        },
        autoLayout: () => {
            setters.setSteps(prev => autoLayoutSteps(prev));
            refs.steps.current = autoLayoutSteps(refs.steps.current);
        },
    };
}

/**
 * Pure function: recompute step positions based on the parent-child graph.
 * - Root steps (no parent, or serial successors) go left→right.
 * - Parallel group children stack vertically under their group.
 * - Serial successors of groups go to the right of the group's rightmost edge.
 */
function autoLayoutSteps(steps: StudioStep[]): StudioStep[] {
    if (steps.length === 0) return steps;

    const positioned = steps.map(s => ({ ...s }));
    const byId = new Map(positioned.map(s => [s.id, s]));

    // Find root steps (parentId is null)
    const roots = positioned.filter(s => s.parentId === null);

    // Find the serial chain order starting from roots
    // Build adjacency: parent → children (serial successors, not group children)
    const serialChildren = new Map<string, StudioStep[]>();
    const groupChildren = new Map<string, StudioStep[]>();

    for (const s of positioned) {
        if (!s.parentId) continue;
        if (s.isGroupChild) {
            const list = groupChildren.get(s.parentId) || [];
            list.push(s);
            groupChildren.set(s.parentId, list);
        } else {
            const list = serialChildren.get(s.parentId) || [];
            list.push(s);
            serialChildren.set(s.parentId, list);
        }
    }

    // Traverse the serial chain, positioning each node
    function layoutSerial(step: StudioStep, x: number, y: number): number {
        step.x = x;
        step.y = y;

        let nextX = x + NODE_SPACING_X;
        let maxBottomY = y;

        // If this is a parallel group, layout its concurrent children vertically
        if (isParallelGroup(step)) {
            const children = groupChildren.get(step.id) || [];
            let childY = y;
            for (const child of children) {
                child.x = x;
                child.y = childY;
                childY += NODE_SPACING_Y;
            }
            if (children.length > 0) {
                maxBottomY = Math.max(maxBottomY, children[children.length - 1].y);
            }
        }

        // Layout serial successors to the right
        const successors = serialChildren.get(step.id) || [];
        for (let i = 0; i < successors.length; i++) {
            const bottomY = layoutSerial(successors[i], nextX, y + i * NODE_SPACING_Y);
            maxBottomY = Math.max(maxBottomY, bottomY);
        }

        return maxBottomY;
    }

    let currentY = INITIAL_Y;
    for (const root of roots) {
        const bottomY = layoutSerial(root, INITIAL_X, currentY);
        currentY = bottomY + NODE_SPACING_Y;
    }

    return positioned;
}

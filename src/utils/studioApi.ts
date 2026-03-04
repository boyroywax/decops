/**
 * Factory for building the `StudioAPI` object that gets registered with StudioContext.
 *
 * This was a ~250-line block inside the StudioView component's `useEffect`.
 * Extracted to keep StudioView focused on state + UI.
 */
import { registry } from "@/services/commands/registry";
import type { StudioAPI, StudioState } from "@/context/StudioContext";
import type { JobDefinition, JobDeliverable, EntityInput, JobTrigger, StepHandler } from "@/types";
import type { StudioStep, OutputMapping, InputBinding } from "@/types/studio";
import { isParallelGroup } from "@/types/studio";
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
    updateStepArg: React.MutableRefObject<(sid: string, arg: string, val: any) => void>;
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
    onRunJob: (job: JobDefinition) => void,
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
                const command = registry.get(cid);
                if (command) {
                    const args: Record<string, any> = {};
                    Object.entries(command.args).forEach(([key, def]) => {
                        if (def.defaultValue !== undefined) args[key] = def.defaultValue;
                        else if (def.type === "boolean") args[key] = false;
                        else if (def.type === "string") args[key] = "";
                        else if (def.type === "number") args[key] = 0;
                        else args[key] = null;
                    });
                    refs.steps.current = [...refs.steps.current, {
                        id: stepId, commandId: cid, args, inputBindings: {},
                        preCondition: "", postCondition: "",
                        parentId: null, outputMappings: [], x: 0, y: 0,
                    }];
                }
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
            setters.setSteps(prev => prev.map(s => s.id === stepId ? { ...s, parentId: newParentId, isGroupChild: asGroupChild } : s));
            refs.steps.current = refs.steps.current.map(s => s.id === stepId ? { ...s, parentId: newParentId, isGroupChild: asGroupChild } : s);
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
            onRunJob(result);
            return { running: true, id: result.id, name: result.name, stepCount: result.steps.length };
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
    };
}

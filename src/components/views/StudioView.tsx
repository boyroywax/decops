import { useState, useCallback, useEffect, useRef } from "react";
import { Play, Save, FolderOpen, Plus, X, Package, Database, Tag } from "lucide-react";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "../shared/DeleteConfirmInline";
import { registry } from "../../services/commands/registry";
import { JobCanvas } from "../jobs/JobCanvas";
import { NodeEditor } from "../jobs/NodeEditor";
import { isSeedJob } from "../../services/jobs/seedCatalog";
import { useStudioContext } from "../../context/StudioContext";
import { useLLM } from "../../context/LLMContext";
import type { StudioAPI } from "../../context/StudioContext";
import type { JobDefinition, JobStep, JobDeliverable, EntityInput } from "../../types";
import "../../styles/components/job-manager.css";

interface StudioViewProps {
    savedJobs: JobDefinition[];
    onSaveJob: (job: JobDefinition) => void;
    onDeleteJob: (id: string) => void;
    onRunJob: (job: JobDefinition) => void;
}

export interface OutputMapping {
    outputKey: string;       // key from the command's outputSchema (or "*" for entire output)
    target: "storage" | "deliverable";
    targetKey: string;       // storage key or deliverable key to write to
}

export interface InputBinding {
    source: "storage" | "deliverable" | "input";
    sourceKey: string;       // storage key or deliverable key or input name to read from
}

export interface StudioStep {
    id: string;
    commandId: string;
    args: Record<string, any>;
    inputBindings: Record<string, InputBinding>;  // argName → source binding
    preCondition: string;
    postCondition: string;
    flowType: "serial" | "parallel";
    parentId: string | null;
    outputMappings: OutputMapping[];
    modelId?: string;  // LLM model override for this step
    x: number;
    y: number;
}

export type SelectedElement =
    | { type: "step"; id: string }
    | { type: "deliverable"; index: number }
    | { type: "storage"; index: number }
    | { type: "input"; index: number }
    | null;

const NODE_SPACING_X = 320;
const NODE_SPACING_Y = 180;
const INITIAL_X = 60;
const INITIAL_Y = 80;

export function StudioView({ savedJobs, onSaveJob, onDeleteJob, onRunJob }: StudioViewProps) {
    const llm = useLLM();
    // ── Job metadata ──
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [editingJobId, setEditingJobId] = useState<string | null>(null);

    // ── Steps ──
    const [steps, setSteps] = useState<StudioStep[]>([]);
    const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
    const [selectedElements, setSelectedElements] = useState<NonNullable<SelectedElement>[]>([]);

    // ── Properties drawer ──
    const [propertiesOpen, setPropertiesOpen] = useState(false);

    // ── Deliverables ──
    const [deliverables, setDeliverables] = useState<JobDeliverable[]>([]);

    // ── Storage defaults ──
    const [storageEntries, setStorageEntries] = useState<Array<{ key: string; value: string }>>([]);

    // ── Entity Inputs (name → ID mappings) ──
    const [inputs, setInputs] = useState<EntityInput[]>([]);

    // ── Catalog modal ──
    const [showCatalog, setShowCatalog] = useState(false);
    const del = useDeleteConfirm();

    const effectiveStepId = selectedElement?.type === "step" ? selectedElement.id : null;
    const selectedStep = effectiveStepId ? steps.find(s => s.id === effectiveStepId) || null : null;

    // ── Step CRUD ──
    const addStep = useCallback((commandId: string): string => {
        const command = registry.get(commandId);
        if (!command) return "";
        const args: Record<string, any> = {};
        Object.entries(command.args).forEach(([key, def]) => {
            if (def.defaultValue !== undefined) args[key] = def.defaultValue;
            else if (def.type === "boolean") args[key] = false;
            else if (def.type === "string") args[key] = "";
            else if (def.type === "number") args[key] = 0;
            else args[key] = null;
        });
        const newId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        setSteps(prev => {
            // Determine parent: selected step, or last leaf, or null
            let parentId: string | null = null;
            if (effectiveStepId && prev.find(s => s.id === effectiveStepId)) {
                parentId = effectiveStepId;
            } else if (prev.length > 0) {
                const idsBeingParent = new Set(prev.filter(s => s.parentId !== null).map(s => s.parentId!));
                const leaves = prev.filter(s => !idsBeingParent.has(s.id));
                parentId = leaves.length > 0 ? leaves[leaves.length - 1].id : prev[prev.length - 1].id;
            }

            const parent = parentId ? prev.find(s => s.id === parentId) : null;
            const siblings = parentId ? prev.filter(s => s.parentId === parentId) : [];

            const x = parent ? parent.x + NODE_SPACING_X : INITIAL_X;
            const y = siblings.length > 0
                ? Math.max(...siblings.map(s => s.y)) + NODE_SPACING_Y
                : (parent ? parent.y : INITIAL_Y);

            return [...prev, {
                id: newId,
                commandId,
                args,
                inputBindings: {},
                preCondition: "",
                postCondition: "",
                flowType: "serial" as const,
                parentId,
                outputMappings: [],
                x,
                y,
            }];
        });
        setSelectedElement({ type: "step", id: newId });
        setSelectedElements([]);
        return newId;
    }, [effectiveStepId]);

    // Listen for studio:add-command events from footer Commands panel
    useEffect(() => {
        const handler = (e: Event) => {
            const { commandId } = (e as CustomEvent).detail;
            addStep(commandId);
        };
        window.addEventListener("studio:add-command", handler);
        return () => window.removeEventListener("studio:add-command", handler);
    }, [addStep]);

    const updateStepArg = useCallback((stepId: string, argName: string, value: any) => {
        setSteps(prev => prev.map(s =>
            s.id === stepId ? { ...s, args: { ...s.args, [argName]: value } } : s
        ));
    }, []);

    const updateStepPreCondition = useCallback((stepId: string, preCondition: string) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, preCondition } : s));
    }, []);

    const updateStepPostCondition = useCallback((stepId: string, postCondition: string) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, postCondition } : s));
    }, []);

    const updateStepPosition = useCallback((stepId: string, x: number, y: number) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, x, y } : s));
    }, []);

    const updateStepFlowType = useCallback((stepId: string, flowType: "serial" | "parallel") => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, flowType } : s));
    }, []);

    const updateStepOutputMappings = useCallback((stepId: string, outputMappings: OutputMapping[]) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, outputMappings } : s));
    }, []);

    const updateStepInputBindings = useCallback((stepId: string, inputBindings: Record<string, InputBinding>) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, inputBindings } : s));
    }, []);

    const updateStepModel = useCallback((stepId: string, modelId: string | undefined) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, modelId } : s));
    }, []);

    const removeStep = useCallback((id: string) => {
        setSteps(prev => {
            const step = prev.find(s => s.id === id);
            if (!step) return prev;
            // Reparent children to grandparent
            return prev
                .filter(s => s.id !== id)
                .map(s => s.parentId === id ? { ...s, parentId: step.parentId } : s);
        });
        if (selectedElement?.type === "step" && selectedElement.id === id) {
            setSelectedElement(null);
            setSelectedElements([]);
        }
    }, [selectedElement]);

    // ── Deliverables CRUD ──
    const addDeliverable = () => {
        setDeliverables(prev => [...prev, { key: "", label: "", type: "json", description: "" }]);
    };
    const updateDeliverable = (index: number, field: keyof JobDeliverable, value: any) => {
        setDeliverables(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
    };
    const removeDeliverable = (index: number) => {
        setDeliverables(prev => prev.filter((_, i) => i !== index));
    };

    // ── Storage CRUD ──
    const addStorageEntry = () => {
        setStorageEntries(prev => [...prev, { key: "", value: "" }]);
    };
    const updateStorageEntry = (index: number, field: "key" | "value", val: string) => {
        setStorageEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: val } : e));
    };
    const removeStorageEntry = (index: number) => {
        setStorageEntries(prev => prev.filter((_, i) => i !== index));
    };

    // ── Entity Inputs CRUD ──
    const addInput = () => {
        setInputs(prev => [...prev, { name: "", type: "agent", entityId: "" }]);
    };
    const updateInput = (index: number, field: keyof EntityInput, value: any) => {
        setInputs(prev => prev.map((inp, i) => i === index ? { ...inp, [field]: value } : inp));
    };
    const removeInput = (index: number) => {
        setInputs(prev => prev.filter((_, i) => i !== index));
    };

    // ── Selection handlers ──
    const handleSelect = useCallback((el: SelectedElement) => {
        setSelectedElement(el);
        setSelectedElements([]);
        if (el) setPropertiesOpen(true);
    }, []);

    const handleCloseProperties = useCallback(() => {
        setPropertiesOpen(false);
    }, []);

    const handleMultiSelect = useCallback((items: NonNullable<SelectedElement>[]) => {
        setSelectedElements(items);
        setSelectedElement(items.length === 1 ? items[0] : null);
    }, []);

    const handleDeleteSelected = useCallback(() => {
        const items = selectedElements.length > 0
            ? selectedElements
            : (selectedElement ? [selectedElement] : []);
        if (items.length === 0) return;

        const stepIds = new Set(
            items.filter((e): e is { type: "step"; id: string } => e.type === "step").map(e => e.id)
        );
        const delivIndices = new Set(
            items.filter((e): e is { type: "deliverable"; index: number } => e.type === "deliverable").map(e => e.index)
        );
        const storageIndices = new Set(
            items.filter((e): e is { type: "storage"; index: number } => e.type === "storage").map(e => e.index)
        );
        const inputIndices = new Set(
            items.filter((e): e is { type: "input"; index: number } => e.type === "input").map(e => e.index)
        );

        if (stepIds.size > 0) {
            setSteps(prev => {
                let result = [...prev];
                for (const id of stepIds) {
                    const step = result.find(s => s.id === id);
                    if (!step) continue;
                    result = result
                        .filter(s => s.id !== id)
                        .map(s => s.parentId === id ? { ...s, parentId: step.parentId } : s);
                }
                return result;
            });
        }
        if (delivIndices.size > 0) setDeliverables(prev => prev.filter((_, i) => !delivIndices.has(i)));
        if (storageIndices.size > 0) setStorageEntries(prev => prev.filter((_, i) => !storageIndices.has(i)));
        if (inputIndices.size > 0) setInputs(prev => prev.filter((_, i) => !inputIndices.has(i)));

        setSelectedElement(null);
        setSelectedElements([]);
    }, [selectedElements, selectedElement]);

    const buildStorageDefaults = (): Record<string, any> | undefined => {
        const entries = storageEntries.filter(e => e.key.trim());
        if (entries.length === 0) return undefined;
        const obj: Record<string, any> = {};
        entries.forEach(({ key, value }) => {
            try { obj[key] = JSON.parse(value); }
            catch { obj[key] = value; }
        });
        return obj;
    };

    // ── Derive exec mode from steps ──
    const derivedMode = steps.some(s => s.flowType === "parallel") ? "parallel" : "serial";

    // ── Build job definition ──
    const buildJobDef = (): JobDefinition | null => {
        if (!name.trim()) { alert("Job name is required"); return null; }
        if (steps.length === 0) { alert("Add at least one step"); return null; }
        const validDeliverables = deliverables.filter(d => d.key.trim() && d.label.trim());
        return {
            id: editingJobId || `job-def-${Date.now()}`,
            name,
            description,
            mode: derivedMode,
            steps: steps.map(s => {
                // Merge inputBindings into args as $storage.key / $deliverable.key refs
                const mergedArgs = { ...s.args };
                for (const [argName, binding] of Object.entries(s.inputBindings)) {
                    if (binding.sourceKey) {
                        mergedArgs[argName] = `$${binding.source}.${binding.sourceKey}`;
                    }
                }
                return {
                    id: s.id,
                    commandId: s.commandId,
                    args: mergedArgs,
                    condition: s.preCondition || undefined,
                    name: s.commandId,
                    modelId: s.modelId || undefined,
                    outputMappings: s.outputMappings.length > 0 ? s.outputMappings : undefined,
                    inputBindings: Object.keys(s.inputBindings).length > 0 ? s.inputBindings : undefined,
                };
            }) as JobStep[],
            deliverables: validDeliverables.length > 0 ? validDeliverables : undefined,
            storageDefaults: buildStorageDefaults(),
            inputDefaults: inputs.filter(inp => inp.name.trim() && inp.entityId.trim()).length > 0
                ? inputs.filter(inp => inp.name.trim() && inp.entityId.trim())
                : undefined,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    };

    const handleRun = () => {
        const job = buildJobDef();
        if (job) onRunJob(job);
    };

    const handleSave = () => {
        const job = buildJobDef();
        if (job) {
            onSaveJob(job);
            setEditingJobId(job.id);
        }
    };

    // ── Load from catalog ──
    const loadJob = (job: JobDefinition) => {
        setName(job.name);
        setDescription(job.description);
        setEditingJobId(job.id);
        setSteps(job.steps.map((s, i) => {
            // Restore inputBindings: either from saved field, or reverse-engineer from $storage./$deliverable. args
            const savedBindings: Record<string, InputBinding> = (s as any).inputBindings || {};
            const cleanArgs: Record<string, any> = {};
            const bindings: Record<string, InputBinding> = { ...savedBindings };
            for (const [k, v] of Object.entries(s.args || {})) {
                if (typeof v === "string" && v.startsWith("$storage.") && !bindings[k]) {
                    bindings[k] = { source: "storage", sourceKey: v.slice("$storage.".length) };
                } else if (typeof v === "string" && v.startsWith("$deliverable.") && !bindings[k]) {
                    bindings[k] = { source: "deliverable", sourceKey: v.slice("$deliverable.".length) };
                } else {
                    cleanArgs[k] = v;
                }
            }
            // For bound args not in cleanArgs, keep a placeholder
            for (const argName of Object.keys(bindings)) {
                if (!(argName in cleanArgs)) cleanArgs[argName] = "";
            }
            return {
                id: s.id || crypto.randomUUID(),
                commandId: s.commandId,
                args: cleanArgs,
                inputBindings: bindings,
                preCondition: s.condition || "",
                postCondition: "",
                flowType: (job.mode === "parallel" ? "parallel" : "serial") as "serial" | "parallel",
                parentId: i > 0 ? (job.steps[i - 1].id || null) : null,
                outputMappings: s.outputMappings || [],
                modelId: s.modelId,
                x: INITIAL_X + i * NODE_SPACING_X,
                y: INITIAL_Y,
            };
        }));
        setDeliverables(job.deliverables || []);
        setStorageEntries(
            Object.entries(job.storageDefaults || {}).map(([key, value]) => ({
                key,
                value: typeof value === "string" ? value : JSON.stringify(value)
            }))
        );
        setInputs(job.inputDefaults || []);
        setSelectedElement(null);
        setSelectedElements([]);
        setShowCatalog(false);
    };

    const handleNew = () => {
        setName("");
        setDescription("");
        setEditingJobId(null);
        setSteps([]);
        setSelectedElement(null);
        setSelectedElements([]);
        setDeliverables([]);
        setStorageEntries([]);
        setInputs([]);
    };

    // ── Register Studio API with context for external access (commands/AI) ──
    const { register, unregister } = useStudioContext();

    // Use refs to always get fresh closures without re-registering
    const stepsRef = useRef(steps);
    stepsRef.current = steps;
    const nameRef = useRef(name);
    nameRef.current = name;
    const descRef = useRef(description);
    descRef.current = description;
    const editingIdRef = useRef(editingJobId);
    editingIdRef.current = editingJobId;
    const deliverablesRef = useRef(deliverables);
    deliverablesRef.current = deliverables;
    const storageRef = useRef(storageEntries);
    storageRef.current = storageEntries;
    const inputsRef = useRef(inputs);
    inputsRef.current = inputs;
    const derivedModeRef = useRef(derivedMode);
    derivedModeRef.current = derivedMode;
    const savedJobsRef = useRef(savedJobs);
    savedJobsRef.current = savedJobs;

    // Refs for callbacks so the API always calls the latest version
    const addStepRef = useRef(addStep);
    addStepRef.current = addStep;
    const removeStepRef = useRef(removeStep);
    removeStepRef.current = removeStep;
    const updateStepArgRef = useRef(updateStepArg);
    updateStepArgRef.current = updateStepArg;
    const updateStepPreConditionRef = useRef(updateStepPreCondition);
    updateStepPreConditionRef.current = updateStepPreCondition;
    const updateStepPostConditionRef = useRef(updateStepPostCondition);
    updateStepPostConditionRef.current = updateStepPostCondition;
    const updateStepPositionRef = useRef(updateStepPosition);
    updateStepPositionRef.current = updateStepPosition;
    const updateStepFlowTypeRef = useRef(updateStepFlowType);
    updateStepFlowTypeRef.current = updateStepFlowType;
    const updateStepOutputMappingsRef = useRef(updateStepOutputMappings);
    updateStepOutputMappingsRef.current = updateStepOutputMappings;
    const updateStepInputBindingsRef = useRef(updateStepInputBindings);
    updateStepInputBindingsRef.current = updateStepInputBindings;
    const updateStepModelRef = useRef(updateStepModel);
    updateStepModelRef.current = updateStepModel;
    const buildJobDefRef = useRef(buildJobDef);
    buildJobDefRef.current = buildJobDef;
    const handleRunRef = useRef(handleRun);
    handleRunRef.current = handleRun;
    const handleSaveRef = useRef(handleSave);
    handleSaveRef.current = handleSave;
    const loadJobRef = useRef(loadJob);
    loadJobRef.current = loadJob;
    const handleNewRef = useRef(handleNew);
    handleNewRef.current = handleNew;

    useEffect(() => {
        const api: StudioAPI = {
            getState: () => ({
                name: nameRef.current,
                description: descRef.current,
                editingJobId: editingIdRef.current,
                mode: derivedModeRef.current as "serial" | "parallel",
                steps: stepsRef.current,
                deliverables: deliverablesRef.current,
                storageEntries: storageRef.current,
                inputs: inputsRef.current,
            }),
            setName: (n) => { setName(n); nameRef.current = n; },
            setDescription: (d) => { setDescription(d); descRef.current = d; },
            addStep: (cid) => {
                const stepId = addStepRef.current(cid);
                // Sync ref: addStep uses setSteps(prev => [...prev, newStep]) so we need to
                // push to the ref manually for same-tick reads
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
                        stepsRef.current = [...stepsRef.current, {
                            id: stepId, commandId: cid, args, inputBindings: {},
                            preCondition: "", postCondition: "", flowType: "serial" as const,
                            parentId: null, outputMappings: [], x: 0, y: 0,
                        }];
                    }
                }
                return stepId;
            },
            removeStep: (id) => removeStepRef.current(id),
            updateStepArg: (sid, arg, val) => {
                updateStepArgRef.current(sid, arg, val);
                stepsRef.current = stepsRef.current.map(s =>
                    s.id === sid ? { ...s, args: { ...s.args, [arg]: val } } : s
                );
            },
            updateStepPreCondition: (sid, cond) => updateStepPreConditionRef.current(sid, cond),
            updateStepPostCondition: (sid, cond) => updateStepPostConditionRef.current(sid, cond),
            updateStepPosition: (sid, x, y) => updateStepPositionRef.current(sid, x, y),
            updateStepFlowType: (sid, ft) => updateStepFlowTypeRef.current(sid, ft),
            updateStepOutputMappings: (sid, m) => updateStepOutputMappingsRef.current(sid, m),
            updateStepInputBindings: (sid, b) => updateStepInputBindingsRef.current(sid, b),
            updateStepModel: (sid, modelId) => {
                updateStepModelRef.current(sid, modelId || undefined);
                stepsRef.current = stepsRef.current.map(s =>
                    s.id === sid ? { ...s, modelId: modelId || undefined } : s
                );
            },
            addDeliverableEntry: (d) => {
                setDeliverables(prev => [...prev, d]);
                deliverablesRef.current = [...deliverablesRef.current, d];
            },
            updateDeliverable: (index, field, value) => {
                setDeliverables(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
            },
            removeDeliverableEntry: (index) => {
                setDeliverables(prev => prev.filter((_, i) => i !== index));
            },
            addStorageEntryWithValues: (key, value) => {
                setStorageEntries(prev => [...prev, { key, value }]);
                storageRef.current = [...storageRef.current, { key, value }];
            },
            updateStorageEntry: (index, field, val) => {
                setStorageEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: val } : e));
            },
            removeStorageEntry: (index) => {
                setStorageEntries(prev => prev.filter((_, i) => i !== index));
            },
            addInput: (inp: EntityInput) => {
                setInputs(prev => [...prev, inp]);
                inputsRef.current = [...inputsRef.current, inp];
            },
            updateInput: (index, field, value) => {
                setInputs(prev => prev.map((inp, i) => i === index ? { ...inp, [field]: value } : inp));
                inputsRef.current = inputsRef.current.map((inp, i) => i === index ? { ...inp, [field]: value } : inp);
            },
            removeInput: (index) => {
                setInputs(prev => prev.filter((_, i) => i !== index));
                inputsRef.current = inputsRef.current.filter((_, i) => i !== index);
            },
            saveJob: () => {
                // Build job from refs (not closure state) to avoid stale reads
                const jobName = nameRef.current;
                const jobSteps = stepsRef.current;
                if (!jobName.trim()) return { error: "Cannot save job — name is required." };
                if (jobSteps.length === 0) return { error: "Cannot save job — add at least one step." };
                const validDeliverables = deliverablesRef.current.filter(d => d.key.trim() && d.label.trim());
                const storageObj = storageRef.current.filter(e => e.key.trim()).reduce((acc, { key, value }) => {
                    try { acc[key] = JSON.parse(value); } catch { acc[key] = value; }
                    return acc;
                }, {} as Record<string, any>);
                const mode = jobSteps.some(s => s.flowType === "parallel") ? "parallel" : "serial";
                const job: JobDefinition = {
                    id: editingIdRef.current || `job-def-${Date.now()}`,
                    name: jobName,
                    description: descRef.current,
                    mode,
                    steps: jobSteps.map(s => {
                        const mergedArgs = { ...s.args };
                        for (const [argName, binding] of Object.entries(s.inputBindings)) {
                            if (binding.sourceKey) mergedArgs[argName] = `$${binding.source}.${binding.sourceKey}`;
                        }
                        return {
                            id: s.id, commandId: s.commandId, args: mergedArgs,
                            condition: s.preCondition || undefined, name: s.commandId,
                            modelId: s.modelId || undefined,
                            outputMappings: s.outputMappings.length > 0 ? s.outputMappings : undefined,
                            inputBindings: Object.keys(s.inputBindings).length > 0 ? s.inputBindings : undefined,
                        };
                    }) as JobStep[],
                    deliverables: validDeliverables.length > 0 ? validDeliverables : undefined,
                    storageDefaults: Object.keys(storageObj).length > 0 ? storageObj : undefined,
                    inputDefaults: inputsRef.current.filter(inp => inp.name.trim() && inp.entityId.trim()).length > 0
                        ? inputsRef.current.filter(inp => inp.name.trim() && inp.entityId.trim())
                        : undefined,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                onSaveJob(job);
                setEditingJobId(job.id);
                editingIdRef.current = job.id;
                return { saved: true, id: job.id, name: job.name };
            },
            runJob: () => {
                // Build job from refs (not closure state) to avoid stale reads
                const jobName = nameRef.current;
                const jobSteps = stepsRef.current;
                if (!jobName.trim()) return { error: "Cannot run job — name is required." };
                if (jobSteps.length === 0) return { error: "Cannot run job — add at least one step." };
                const validDeliverables = deliverablesRef.current.filter(d => d.key.trim() && d.label.trim());
                const storageObj = storageRef.current.filter(e => e.key.trim()).reduce((acc, { key, value }) => {
                    try { acc[key] = JSON.parse(value); } catch { acc[key] = value; }
                    return acc;
                }, {} as Record<string, any>);
                const mode = jobSteps.some(s => s.flowType === "parallel") ? "parallel" : "serial";
                const job: JobDefinition = {
                    id: editingIdRef.current || `job-def-${Date.now()}`,
                    name: jobName,
                    description: descRef.current,
                    mode,
                    steps: jobSteps.map(s => {
                        const mergedArgs = { ...s.args };
                        for (const [argName, binding] of Object.entries(s.inputBindings)) {
                            if (binding.sourceKey) mergedArgs[argName] = `$${binding.source}.${binding.sourceKey}`;
                        }
                        return {
                            id: s.id, commandId: s.commandId, args: mergedArgs,
                            condition: s.preCondition || undefined, name: s.commandId,
                            modelId: s.modelId || undefined,
                            outputMappings: s.outputMappings.length > 0 ? s.outputMappings : undefined,
                            inputBindings: Object.keys(s.inputBindings).length > 0 ? s.inputBindings : undefined,
                        };
                    }) as JobStep[],
                    deliverables: validDeliverables.length > 0 ? validDeliverables : undefined,
                    storageDefaults: Object.keys(storageObj).length > 0 ? storageObj : undefined,
                    inputDefaults: inputsRef.current.filter(inp => inp.name.trim() && inp.entityId.trim()).length > 0
                        ? inputsRef.current.filter(inp => inp.name.trim() && inp.entityId.trim())
                        : undefined,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                onRunJob(job);
                return { running: true, id: job.id, name: job.name, stepCount: job.steps.length };
            },
            loadJobById: (id) => {
                const catalog = savedJobsRef.current;
                const job = catalog.find(j => j.id === id);
                if (!job) return { error: `Job definition "${id}" not found in catalog.` };
                loadJobRef.current(job);
                return { loaded: true, id: job.id, name: job.name };
            },
            clearCanvas: () => {
                handleNewRef.current();
                // Sync refs immediately so subsequent API calls in the same tick see empty state
                nameRef.current = "";
                descRef.current = "";
                editingIdRef.current = null;
                stepsRef.current = [];
                deliverablesRef.current = [];
                storageRef.current = [];
                inputsRef.current = [];
            },
        };
        register(api);
        return () => unregister();
    }, []); // stable — uses refs for fresh closures

    return (
        <div className="job-manager">
            {/* ═══ TOOLBAR ═══ */}
            <div className="jm-toolbar">
                {/* ── Row 1: Job identity + file actions ── */}
                <div className="jm-toolbar__row jm-toolbar__row--top">
                    <div className="jm-toolbar__identity">
                        <input
                            type="text"
                            className="jm-toolbar__name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Job Name"
                        />
                        <div className="jm-toolbar__mode-badge">
                            <span className={`jm-toolbar__mode-indicator jm-toolbar__mode-indicator--${derivedMode}`}>
                                {derivedMode}
                            </span>
                        </div>
                    </div>
                    <div className="jm-toolbar__file-actions">
                        <button className="jm-toolbar__icon-btn" onClick={handleNew} title="New job">
                            <Plus size={14} />
                        </button>
                        <button className="jm-toolbar__icon-btn" onClick={() => setShowCatalog(true)} title="Load from catalog">
                            <FolderOpen size={14} />
                        </button>
                        <button className="jm-toolbar__icon-btn" onClick={handleSave} title="Save job">
                            <Save size={14} />
                        </button>
                        <div className="jm-toolbar__divider" />
                        <button className="jm-toolbar__run-btn" onClick={handleRun}>
                            <Play size={13} /> Run
                        </button>
                    </div>
                </div>

                {/* ── Row 2: Description + canvas nodes + model ── */}
                <div className="jm-toolbar__row jm-toolbar__row--bottom">
                    <input
                        type="text"
                        className="jm-toolbar__desc"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Description (optional)"
                    />
                    <div className="jm-toolbar__canvas-tools">
                        <button className="jm-toolbar__tool-btn" onClick={addDeliverable} title="Add deliverable node">
                            <Package size={12} /> <span>Deliverable</span>
                        </button>
                        <button className="jm-toolbar__tool-btn" onClick={addStorageEntry} title="Add storage node">
                            <Database size={12} /> <span>Storage</span>
                        </button>
                        <button className="jm-toolbar__tool-btn" onClick={addInput} title="Add entity input">
                            <Tag size={12} /> <span>Input</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ BODY: Canvas + Editor ═══ */}
            <div className="jm-body">
                <JobCanvas
                    steps={steps}
                    deliverables={deliverables}
                    storageEntries={storageEntries}
                    inputs={inputs}
                    selectedElement={selectedElement}
                    onSelect={handleSelect}
                    onRemoveStep={removeStep}
                    onRemoveDeliverable={removeDeliverable}
                    onRemoveStorage={removeStorageEntry}
                    onRemoveInput={removeInput}
                    onUpdatePosition={updateStepPosition}
                    onUpdateFlowType={updateStepFlowType}
                    selectedElements={selectedElements}
                    onMultiSelect={handleMultiSelect}
                    onDeleteSelected={handleDeleteSelected}
                />

                {/* Right-side node editor */}
                <NodeEditor
                    selectedElement={selectedElement}
                    step={selectedStep}
                    deliverable={selectedElement?.type === "deliverable" ? deliverables[selectedElement.index] ?? null : null}
                    deliverableIndex={selectedElement?.type === "deliverable" ? selectedElement.index : null}
                    storageEntry={selectedElement?.type === "storage" ? storageEntries[selectedElement.index] ?? null : null}
                    storageIndex={selectedElement?.type === "storage" ? selectedElement.index : null}
                    inputEntry={selectedElement?.type === "input" ? inputs[selectedElement.index] ?? null : null}
                    inputIndex={selectedElement?.type === "input" ? selectedElement.index : null}
                    deliverables={deliverables}
                    storageEntries={storageEntries}
                    inputs={inputs}
                    allSteps={steps}
                    onUpdateArg={updateStepArg}
                    onUpdatePreCondition={updateStepPreCondition}
                    onUpdatePostCondition={updateStepPostCondition}
                    onUpdateDeliverable={updateDeliverable}
                    onUpdateStorage={updateStorageEntry}
                    onUpdateInput={updateInput}
                    onUpdateOutputMappings={updateStepOutputMappings}
                    onUpdateInputBindings={updateStepInputBindings}
                    onUpdateStepModel={updateStepModel}
                    allModels={llm.allModels}
                    isOpen={propertiesOpen}
                    onClose={handleCloseProperties}
                />
            </div>

            {/* ═══ CATALOG MODAL ═══ */}
            {showCatalog && (
                <div className="jm-catalog-overlay" onClick={() => setShowCatalog(false)}>
                    <div className="jm-catalog-modal" onClick={e => e.stopPropagation()}>
                        <div className="jm-catalog-modal__header">
                            <div className="jm-catalog-modal__title">Job Catalog</div>
                            <button className="jm-catalog-modal__close" onClick={() => setShowCatalog(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="jm-catalog-modal__body">
                            {savedJobs.length === 0 ? (
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-ghost)", textAlign: "center", padding: 32 }}>
                                    No saved jobs. Create and save one first.
                                </div>
                            ) : (
                                savedJobs.map(job => (
                                    <div key={job.id} className="jm-catalog-modal__item" onClick={() => loadJob(job)}>
                                        <div className="jm-catalog-modal__item-info">
                                            <div className="jm-catalog-modal__item-name">
                                                {job.name}
                                                {isSeedJob(job.id) && <span style={{ fontSize: 9, marginLeft: 6, opacity: 0.5 }}>Built-in</span>}
                                            </div>
                                            <div className="jm-catalog-modal__item-meta">
                                                {job.steps.length} steps • {job.mode}
                                            </div>
                                        </div>
                                        <div className="jm-catalog-modal__item-actions">
                                            {!isSeedJob(job.id) && (
                                                del.isPending(job.id) ? (
                                                    <DeleteConfirmInline
                                                        entityName="Job"
                                                        entityLabel={job.name}
                                                        onConfirm={() => del.confirm(() => onDeleteJob(job.id))}
                                                        onCancel={del.cancel}
                                                        compact
                                                    />
                                                ) : (
                                                    <button
                                                        className="jm-meta-panel__remove"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            del.requestDelete(job.id);
                                                        }}
                                                        title="Delete"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

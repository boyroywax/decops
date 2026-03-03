import { useState, useCallback, useEffect, useRef } from "react";
import { Play, Save, FolderOpen, Plus, X, Package, Database, Tag, GitFork, Zap } from "lucide-react";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "../shared/DeleteConfirmInline";
import { registry } from "../../services/commands/registry";
import { JobCanvas } from "../jobs/JobCanvas";
import { NodeEditor } from "../jobs/NodeEditor";
import { StepCardModal } from "../jobs/StepCardModal";
import { isSeedJob } from "../../services/jobs/seedCatalog";
import { useStudioContext } from "../../context/StudioContext";
import { useLLM } from "../../context/LLMContext";
import type { StudioAPI } from "../../context/StudioContext";
import type { JobDefinition, JobStep, JobDeliverable, EntityInput, JobTrigger, TriggerEvent } from "../../types";
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

/**
 * Sentinel commandId for parallel-group container steps.
 * A parallel group is not a real task — it groups child steps that execute concurrently.
 * Children whose parentId points to a parallel-group step run in parallel.
 */
export const PARALLEL_GROUP_CMD = "__parallel__";

/** Returns true if the step is a parallel-group container (not a real task). */
export function isParallelGroup(step: StudioStep): boolean {
    return step.commandId === PARALLEL_GROUP_CMD;
}

export type AnchorSide = "top" | "right" | "bottom" | "left";

export interface StudioStep {
    id: string;
    commandId: string;  // PARALLEL_GROUP_CMD for parallel containers
    args: Record<string, any>;
    inputBindings: Record<string, InputBinding>;  // argName → source binding
    preCondition: string;
    postCondition: string;
    parentId: string | null;
    outputMappings: OutputMapping[];
    modelId?: string;  // LLM model override for this step
    label?: string;    // display label for parallel groups
    connectorOut?: AnchorSide;  // Where outgoing connector leaves this node (default: right)
    connectorIn?: AnchorSide;   // Where incoming connector enters this node (default: left)
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

    // ── Step card modal ──
    const [modalStepId, setModalStepId] = useState<string | null>(null);

    // ── Deliverables ──
    const [deliverables, setDeliverables] = useState<JobDeliverable[]>([]);

    // ── Storage defaults ──
    const [storageEntries, setStorageEntries] = useState<Array<{ key: string; value: string }>>([]);

    // ── Entity Inputs (name → ID mappings) ──
    const [inputs, setInputs] = useState<EntityInput[]>([]);

    // ── Triggers (automated job execution rules) ──
    const [triggers, setTriggers] = useState<JobTrigger[]>([]);
    const [showTriggerPanel, setShowTriggerPanel] = useState(false);

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
            // Determine parent: selected step, or last leaf (excluding parallel group internals), or null
            let parentId: string | null = null;
            // Collect IDs of all parallel groups
            const parallelGroupIds = new Set(prev.filter(s => s.commandId === PARALLEL_GROUP_CMD).map(s => s.id));

            if (effectiveStepId && prev.find(s => s.id === effectiveStepId)) {
                const sel = prev.find(s => s.id === effectiveStepId)!;
                // If the selected step is inside a parallel group, parent to the group instead
                if (sel.parentId && parallelGroupIds.has(sel.parentId)) {
                    parentId = sel.parentId; // add as sibling inside the group
                } else {
                    parentId = effectiveStepId;
                }
            } else if (prev.length > 0) {
                // Find last leaf that is NOT a child of a parallel group
                const idsBeingParent = new Set(prev.filter(s => s.parentId !== null).map(s => s.parentId!));
                const leaves = prev.filter(s => !idsBeingParent.has(s.id) && !parallelGroupIds.has(s.parentId ?? ""));
                // Also include parallel groups themselves as potential parents
                const candidates = leaves.length > 0 ? leaves : prev.filter(s => !parallelGroupIds.has(s.parentId ?? ""));
                parentId = candidates.length > 0 ? candidates[candidates.length - 1].id : prev[prev.length - 1].id;
            }

            const parent = parentId ? prev.find(s => s.id === parentId) : null;
            const isParentAGroup = parent ? parent.commandId === PARALLEL_GROUP_CMD : false;
            const siblings = parentId ? prev.filter(s => s.parentId === parentId) : [];

            let x: number, y: number;
            if (isParentAGroup) {
                // Place inside the parallel group, stacked vertically
                x = parent!.x;
                y = siblings.length > 0
                    ? Math.max(...siblings.map(s => s.y)) + NODE_SPACING_Y
                    : parent!.y;
            } else {
                x = parent ? parent.x + NODE_SPACING_X : INITIAL_X;
                y = siblings.length > 0
                    ? Math.max(...siblings.map(s => s.y)) + NODE_SPACING_Y
                    : (parent ? parent.y : INITIAL_Y);
            }

            return [...prev, {
                id: newId,
                commandId,
                args,
                inputBindings: {},
                preCondition: "",
                postCondition: "",
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

    const moveGroup = useCallback((groupId: string, dx: number, dy: number) => {
        setSteps(prev => prev.map(s => {
            if (s.id === groupId || s.parentId === groupId) {
                return { ...s, x: Math.max(0, s.x + dx), y: Math.max(0, s.y + dy) };
            }
            return s;
        }));
    }, []);

    const updateStepAnchor = useCallback((stepId: string, which: "connectorOut" | "connectorIn", side: AnchorSide) => {
        setSteps(prev => prev.map(s => s.id === stepId ? { ...s, [which]: side } : s));
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

    // ── Triggers CRUD ──
    const addTrigger = (event: TriggerEvent = "artifact:updated") => {
        const id = `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        setTriggers(prev => [...prev, { id, event, enabled: true }]);
    };
    const updateTrigger = (id: string, patch: Partial<JobTrigger>) => {
        setTriggers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    };
    const removeTrigger = (id: string) => {
        setTriggers(prev => prev.filter(t => t.id !== id));
    };

    // ── Parallel Group CRUD ──
    const addParallelGroup = useCallback((): string => {
        const newId = `pgroup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        setSteps(prev => {
            // Determine parent: selected step or last leaf (excluding parallel group internals)
            let parentId: string | null = null;
            const parallelGroupIds = new Set(prev.filter(s => s.commandId === PARALLEL_GROUP_CMD).map(s => s.id));

            if (effectiveStepId && prev.find(s => s.id === effectiveStepId)) {
                const sel = prev.find(s => s.id === effectiveStepId)!;
                // If selected step is inside a parallel group, parent the new group to the group's parent
                if (sel.parentId && parallelGroupIds.has(sel.parentId)) {
                    parentId = prev.find(s => s.id === sel.parentId)?.parentId ?? null;
                } else if (parallelGroupIds.has(sel.id)) {
                    // Selected step IS a parallel group — parent to its parent
                    parentId = sel.parentId;
                } else {
                    parentId = effectiveStepId;
                }
            } else if (prev.length > 0) {
                const idsBeingParent = new Set(prev.filter(s => s.parentId !== null).map(s => s.parentId!));
                const leaves = prev.filter(s => !idsBeingParent.has(s.id) && !parallelGroupIds.has(s.parentId ?? ""));
                parentId = leaves.length > 0 ? leaves[leaves.length - 1].id : prev[prev.length - 1].id;
            }
            const parent = parentId ? prev.find(s => s.id === parentId) : null;
            const x = parent ? parent.x + NODE_SPACING_X : INITIAL_X;
            const y = parent ? parent.y : INITIAL_Y;
            return [...prev, {
                id: newId,
                commandId: PARALLEL_GROUP_CMD,
                args: {},
                inputBindings: {},
                preCondition: "",
                postCondition: "",
                parentId,
                outputMappings: [],
                label: "Parallel",
                x,
                y,
            }];
        });
        setSelectedElement({ type: "step", id: newId });
        return newId;
    }, [effectiveStepId]);

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

    const handleOpenStepCard = useCallback((stepId: string) => {
        setModalStepId(stepId);
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
    const hasParallelGroups = steps.some(s => isParallelGroup(s));
    const derivedMode: "serial" | "parallel" | "mixed" = hasParallelGroups ? "mixed" : "serial";

    // ── Build job definition ──
    const buildJobDef = (): JobDefinition | null => {
        if (!name.trim()) { alert("Job name is required"); return null; }
        const taskSteps = steps.filter(s => !isParallelGroup(s));
        if (taskSteps.length === 0) { alert("Add at least one step"); return null; }
        const validDeliverables = deliverables.filter(d => d.key.trim() && d.label.trim());
        // Build parallel group metadata for serialization
        const pGroups = steps.filter(s => isParallelGroup(s)).map(g => ({
            id: g.id,
            label: g.label || "Parallel",
            stepIds: steps.filter(s => s.parentId === g.id && !isParallelGroup(s)).map(s => s.id),
        }));
        return {
            id: editingJobId || `job-def-${Date.now()}`,
            name,
            description,
            mode: derivedMode,
            steps: taskSteps.map(s => {
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
            parallelGroups: pGroups.length > 0 ? pGroups : undefined,
            triggers: triggers.length > 0 ? triggers : undefined,
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

        // Reconstruct task steps
        const taskSteps: StudioStep[] = job.steps.map((s, i) => {
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
                parentId: i > 0 ? (job.steps[i - 1].id || null) : null,
                outputMappings: s.outputMappings || [],
                modelId: s.modelId,
                x: INITIAL_X + i * NODE_SPACING_X,
                y: INITIAL_Y,
            };
        });

        // Reconstruct parallel groups from saved metadata
        const pGroups: StudioStep[] = (job.parallelGroups || []).map((g, gi) => {
            // Re-parent the group's child steps
            const groupStep: StudioStep = {
                id: g.id,
                commandId: PARALLEL_GROUP_CMD,
                args: {},
                inputBindings: {},
                preCondition: "",
                postCondition: "",
                parentId: null,
                outputMappings: [],
                label: g.label || "Parallel",
                x: INITIAL_X + (job.steps.length + gi) * NODE_SPACING_X,
                y: INITIAL_Y,
            };
            // Reparent child tasks to this group
            for (const sid of g.stepIds) {
                const child = taskSteps.find(ts => ts.id === sid);
                if (child) child.parentId = g.id;
            }
            return groupStep;
        });

        setSteps([...taskSteps, ...pGroups]);
        setDeliverables(job.deliverables || []);
        setStorageEntries(
            Object.entries(job.storageDefaults || {}).map(([key, value]) => ({
                key,
                value: typeof value === "string" ? value : JSON.stringify(value)
            }))
        );
        setInputs(job.inputDefaults || []);
        setTriggers(job.triggers || []);
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
        setTriggers([]);
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
    const triggersRef = useRef(triggers);
    triggersRef.current = triggers;
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
    const addParallelGroupRef = useRef(addParallelGroup);
    addParallelGroupRef.current = addParallelGroup;
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
                            preCondition: "", postCondition: "",
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
            addParallelGroup: () => addParallelGroupRef.current(),
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
            addTrigger: (event, id, filter, label, cron) => {
                const triggerId = id || `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                const newTrigger: JobTrigger = { id: triggerId, event, enabled: true, filter, label, cron };
                setTriggers(prev => [...prev, newTrigger]);
                triggersRef.current = [...triggersRef.current, newTrigger];
            },
            updateTrigger: (id, patch) => {
                setTriggers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
                triggersRef.current = triggersRef.current.map(t => t.id === id ? { ...t, ...patch } : t);
            },
            removeTrigger: (id) => {
                setTriggers(prev => prev.filter(t => t.id !== id));
                triggersRef.current = triggersRef.current.filter(t => t.id !== id);
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
                const taskSteps = jobSteps.filter(s => !isParallelGroup(s));
                const hasGroups = jobSteps.some(s => isParallelGroup(s));
                const mode = hasGroups ? "mixed" : "serial";
                const pGroups = jobSteps.filter(s => isParallelGroup(s)).map(g => ({
                    id: g.id,
                    label: g.label || "Parallel",
                    stepIds: jobSteps.filter(s => s.parentId === g.id && !isParallelGroup(s)).map(s => s.id),
                }));
                const job: JobDefinition = {
                    id: editingIdRef.current || `job-def-${Date.now()}`,
                    name: jobName,
                    description: descRef.current,
                    mode,
                    steps: taskSteps.map(s => {
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
                    parallelGroups: pGroups.length > 0 ? pGroups : undefined,
                    triggers: triggersRef.current.length > 0 ? triggersRef.current : undefined,
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
                const taskSteps = jobSteps.filter(s => !isParallelGroup(s));
                const hasGroups = jobSteps.some(s => isParallelGroup(s));
                const mode = hasGroups ? "mixed" : "serial";
                const pGroups = jobSteps.filter(s => isParallelGroup(s)).map(g => ({
                    id: g.id,
                    label: g.label || "Parallel",
                    stepIds: jobSteps.filter(s => s.parentId === g.id && !isParallelGroup(s)).map(s => s.id),
                }));
                const job: JobDefinition = {
                    id: editingIdRef.current || `job-def-${Date.now()}`,
                    name: jobName,
                    description: descRef.current,
                    mode,
                    steps: taskSteps.map(s => {
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
                    parallelGroups: pGroups.length > 0 ? pGroups : undefined,
                    triggers: triggersRef.current.length > 0 ? triggersRef.current : undefined,
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
                triggersRef.current = [];
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
                        <button className="jm-toolbar__tool-btn jm-toolbar__tool-btn--parallel" onClick={addParallelGroup} title="Add parallel group container">
                            <GitFork size={12} /> <span>Parallel</span>
                        </button>
                        <div className="jm-toolbar__divider" />
                        <button
                            className={`jm-toolbar__tool-btn jm-toolbar__tool-btn--trigger ${triggers.length > 0 ? "jm-toolbar__tool-btn--active" : ""}`}
                            onClick={() => setShowTriggerPanel(p => !p)}
                            title="Configure automated triggers"
                        >
                            <Zap size={12} />
                            <span>Triggers</span>
                            {triggers.length > 0 && <span className="jm-toolbar__badge">{triggers.length}</span>}
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ TRIGGER PANEL (collapsible) ═══ */}
            {showTriggerPanel && (
                <div className="jm-trigger-panel">
                    <div className="jm-trigger-panel__header">
                        <span className="jm-trigger-panel__title"><Zap size={12} /> Automated Triggers</span>
                        <button className="jm-trigger-panel__add" onClick={() => addTrigger()}>
                            <Plus size={12} /> Add Trigger
                        </button>
                    </div>
                    {triggers.length === 0 ? (
                        <div className="jm-trigger-panel__empty">
                            No triggers configured. Add one to run this job automatically on workspace events.
                        </div>
                    ) : (
                        <div className="jm-trigger-panel__list">
                            {triggers.map(t => (
                                <div key={t.id} className={`jm-trigger-panel__item ${t.enabled ? "" : "jm-trigger-panel__item--disabled"}`}>
                                    <label className="jm-trigger-panel__toggle" title={t.enabled ? "Enabled" : "Disabled"}>
                                        <input
                                            type="checkbox"
                                            checked={t.enabled}
                                            onChange={e => updateTrigger(t.id, { enabled: e.target.checked })}
                                        />
                                    </label>
                                    <select
                                        className="jm-trigger-panel__event-select"
                                        value={t.event}
                                        onChange={e => updateTrigger(t.id, { event: e.target.value as TriggerEvent })}
                                    >
                                        <optgroup label="Artifacts">
                                            <option value="artifact:created">Artifact Created</option>
                                            <option value="artifact:updated">Artifact Updated</option>
                                            <option value="artifact:deleted">Artifact Deleted</option>
                                        </optgroup>
                                        <optgroup label="Agents">
                                            <option value="agent:created">Agent Created</option>
                                            <option value="agent:updated">Agent Updated</option>
                                        </optgroup>
                                        <optgroup label="Groups">
                                            <option value="group:created">Group Created</option>
                                            <option value="group:updated">Group Updated</option>
                                        </optgroup>
                                        <optgroup label="Channels">
                                            <option value="channel:created">Channel Created</option>
                                            <option value="channel:updated">Channel Updated</option>
                                        </optgroup>
                                        <optgroup label="Networks">
                                            <option value="network:created">Network Created</option>
                                            <option value="network:updated">Network Updated</option>
                                        </optgroup>
                                        <optgroup label="Jobs">
                                            <option value="job:completed">Job Completed</option>
                                            <option value="job:failed">Job Failed</option>
                                        </optgroup>
                                        <optgroup label="Schedule">
                                            <option value="schedule:cron">Cron Schedule</option>
                                        </optgroup>
                                    </select>
                                    <input
                                        type="text"
                                        className="jm-trigger-panel__filter"
                                        placeholder={t.event === "schedule:cron" ? "Cron expr (e.g. 0 */6 * * *)" : "Filter (name, tag, or ID)"}
                                        value={t.event === "schedule:cron" ? (t.cron || "") : (t.filter?.tag || t.filter?.name || t.filter?.entityId || "")}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (t.event === "schedule:cron") {
                                                updateTrigger(t.id, { cron: val || undefined });
                                            } else {
                                                // Detect filter type: IDs contain dashes, tags start with "type:", rest is name
                                                const isId = /^[a-z0-9-]{8,}$/i.test(val);
                                                const isTag = val.includes(":");
                                                updateTrigger(t.id, {
                                                    filter: val ? {
                                                        entityId: isId ? val : undefined,
                                                        tag: isTag ? val : undefined,
                                                        name: (!isId && !isTag) ? val : undefined,
                                                    } : undefined,
                                                });
                                            }
                                        }}
                                    />
                                    <input
                                        type="text"
                                        className="jm-trigger-panel__label"
                                        placeholder="Label"
                                        value={t.label || ""}
                                        onChange={e => updateTrigger(t.id, { label: e.target.value || undefined })}
                                    />
                                    <button
                                        className="jm-node__action-btn jm-node__action-btn--danger"
                                        onClick={() => removeTrigger(t.id)}
                                        title="Remove trigger"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ BODY: Canvas ═══ */}
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
                    onMoveGroup={moveGroup}
                    onUpdateAnchor={updateStepAnchor}
                    selectedElements={selectedElements}
                    onMultiSelect={handleMultiSelect}
                    onDeleteSelected={handleDeleteSelected}
                    onOpenStepCard={handleOpenStepCard}
                />

                {/* Right-side node editor — hidden while styling is incomplete */}
                {/* <NodeEditor ... /> */}
            </div>

            {/* ═══ STEP CARD MODAL ═══ */}
            {modalStepId && (() => {
                const stepIdx = steps.findIndex(s => s.id === modalStepId);
                const modalStep = stepIdx >= 0 ? steps[stepIdx] : null;
                if (!modalStep) return null;
                return (
                    <StepCardModal
                        step={modalStep}
                        stepIndex={stepIdx}
                        isOpen
                        onClose={() => setModalStepId(null)}
                        onPrev={stepIdx > 0 ? () => setModalStepId(steps[stepIdx - 1].id) : undefined}
                        onNext={stepIdx < steps.length - 1 ? () => setModalStepId(steps[stepIdx + 1].id) : undefined}
                        position={`${stepIdx + 1} / ${steps.length}`}
                        onUpdateArg={updateStepArg}
                        onUpdatePreCondition={updateStepPreCondition}
                        onUpdatePostCondition={updateStepPostCondition}
                        onUpdateOutputMappings={updateStepOutputMappings}
                        onUpdateInputBindings={updateStepInputBindings}
                        onUpdateStepModel={updateStepModel}
                        deliverables={deliverables}
                        storageEntries={storageEntries}
                        inputs={inputs}
                        allSteps={steps}
                        allModels={llm.allModels}
                    />
                );
            })()}

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

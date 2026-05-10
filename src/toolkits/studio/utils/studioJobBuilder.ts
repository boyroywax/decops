/**
 * Pure-function helpers for building a JobDefinition from Studio state
 * and for loading a JobDefinition back into Studio steps.
 *
 * Extracted from StudioView.tsx to reduce file size.
 */
import type { JobDefinition, JobStep, JobDeliverable, EntityInput, JobTrigger } from "@/types";
import type { StudioStep, InputBinding, OutputMapping } from "@/toolkits/studio/types/studio";
import { isParallelGroup, PARALLEL_GROUP_CMD, NODE_SPACING_X, NODE_SPACING_Y, INITIAL_X, INITIAL_Y } from "@/toolkits/studio/types/studio";

// ── Storage defaults builder ──

export function buildStorageDefaults(
    storageEntries: Array<{ key: string; value: string }>
): Record<string, any> | undefined {
    const entries = storageEntries.filter(e => e.key.trim());
    if (entries.length === 0) return undefined;
    const obj: Record<string, any> = {};
    entries.forEach(({ key, value }) => {
        try { obj[key] = JSON.parse(value); }
        catch { obj[key] = value; }
    });
    return obj;
}

// ── Build a JobDefinition from current Studio state ──

export interface BuildJobDefParams {
    name: string;
    description: string;
    editingJobId: string | null;
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    triggers: JobTrigger[];
    derivedMode: "serial" | "parallel" | "mixed";
}

export function buildJobDef(params: BuildJobDefParams): JobDefinition | null {
    const { name, description, editingJobId, steps, deliverables, storageEntries, inputs, triggers, derivedMode } = params;

    if (!name.trim()) { alert("Job name is required"); return null; }
    const taskSteps = steps.filter(s => !isParallelGroup(s));
    if (taskSteps.length === 0) { alert("Add at least one step"); return null; }
    const validDeliverables = deliverables.filter(d => d.key.trim() && d.label.trim());

    // Build parallel group metadata for serialization
    const pGroups = steps.filter(s => isParallelGroup(s)).map(g => ({
        id: g.id,
        label: g.label || "Parallel",
        stepIds: steps.filter(s => s.parentId === g.id && s.isGroupChild && !isParallelGroup(s)).map(s => s.id),
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
                onSuccess: s.onSuccess || undefined,
                onFailure: s.onFailure || undefined,
            };
        }) as JobStep[],
        deliverables: validDeliverables.length > 0 ? validDeliverables : undefined,
        storageDefaults: buildStorageDefaults(storageEntries),
        inputDefaults: inputs.filter(inp => inp.name.trim() && inp.entityId.trim()).length > 0
            ? inputs.filter(inp => inp.name.trim() && inp.entityId.trim())
            : undefined,
        parallelGroups: pGroups.length > 0 ? pGroups : undefined,
        triggers: triggers.length > 0 ? triggers : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

// ── Build a JobDefinition from refs (for API saveJob / runJob calls) ──

export interface BuildJobDefFromRefsParams {
    name: string;
    description: string;
    editingJobId: string | null;
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    triggers: JobTrigger[];
}

export function buildJobDefFromRefs(params: BuildJobDefFromRefsParams): JobDefinition | { error: string } {
    const { name, description, editingJobId, steps, deliverables, storageEntries, inputs, triggers } = params;

    if (!name.trim()) return { error: "Cannot save/run job — name is required." };
    if (steps.length === 0) return { error: "Cannot save/run job — add at least one step." };

    const validDeliverables = deliverables.filter(d => d.key.trim() && d.label.trim());
    const storageObj = storageEntries.filter(e => e.key.trim()).reduce((acc, { key, value }) => {
        try { acc[key] = JSON.parse(value); } catch { acc[key] = value; }
        return acc;
    }, {} as Record<string, any>);

    const taskSteps = steps.filter(s => !isParallelGroup(s));
    const hasGroups = steps.some(s => isParallelGroup(s));
    const mode = hasGroups ? "mixed" : "serial";

    const pGroups = steps.filter(s => isParallelGroup(s)).map(g => ({
        id: g.id,
        label: g.label || "Parallel",
        stepIds: steps.filter(s => s.parentId === g.id && !isParallelGroup(s)).map(s => s.id),
    }));

    return {
        id: editingJobId || `job-def-${Date.now()}`,
        name,
        description,
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
                onSuccess: s.onSuccess || undefined,
                onFailure: s.onFailure || undefined,
            };
        }) as JobStep[],
        deliverables: validDeliverables.length > 0 ? validDeliverables : undefined,
        storageDefaults: Object.keys(storageObj).length > 0 ? storageObj : undefined,
        inputDefaults: inputs.filter(inp => inp.name.trim() && inp.entityId.trim()).length > 0
            ? inputs.filter(inp => inp.name.trim() && inp.entityId.trim())
            : undefined,
        parallelGroups: pGroups.length > 0 ? pGroups : undefined,
        triggers: triggers.length > 0 ? triggers : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

// ── Load a JobDefinition back into Studio state ──

export interface LoadJobResult {
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
    triggers: JobTrigger[];
}

export function loadJobToStudioState(job: JobDefinition): LoadJobResult {
    // Collect all parallel-group child IDs for quick lookup
    const allGroupChildIds = new Set<string>();
    for (const g of (job.parallelGroups || [])) {
        for (const sid of g.stepIds) allGroupChildIds.add(sid);
    }

    // Reconstruct task steps with args + bindings
    const taskSteps: StudioStep[] = job.steps.map((s) => {
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
            parentId: null as string | null,
            outputMappings: (s as any).outputMappings || [],
            modelId: s.modelId,
            onSuccess: s.onSuccess || undefined,
            onFailure: s.onFailure || undefined,
            x: 0,
            y: 0,
        };
    });

    // ── Build the serial chain, inserting parallel groups where they belong ──
    const groupStepMap = new Map<string, { id: string; label: string; stepIds: string[] }>();
    for (const g of (job.parallelGroups || [])) {
        for (const sid of g.stepIds) groupStepMap.set(sid, g);
    }
    const insertedGroups = new Set<string>();
    const serialOrder: string[] = [];
    for (const s of job.steps) {
        const sid = s.id || "";
        if (allGroupChildIds.has(sid)) {
            const grp = groupStepMap.get(sid)!;
            if (!insertedGroups.has(grp.id)) {
                insertedGroups.add(grp.id);
                serialOrder.push(grp.id);
            }
        } else {
            serialOrder.push(sid);
        }
    }

    // Build parallel group StudioSteps
    const pGroups: StudioStep[] = (job.parallelGroups || []).map(g => ({
        id: g.id,
        commandId: PARALLEL_GROUP_CMD,
        args: {},
        inputBindings: {},
        preCondition: "",
        postCondition: "",
        parentId: null as string | null,
        outputMappings: [],
        label: g.label || "Parallel",
        x: 0,
        y: 0,
    }));

    const allNodes = new Map<string, StudioStep>();
    for (const ts of taskSteps) allNodes.set(ts.id, ts);
    for (const pg of pGroups) allNodes.set(pg.id, pg);

    // Set parentId along the serial chain
    for (let i = 0; i < serialOrder.length; i++) {
        const node = allNodes.get(serialOrder[i]);
        if (!node) continue;
        node.parentId = i > 0 ? serialOrder[i - 1] : null;
    }

    // Reparent parallel group children to their group
    for (const g of (job.parallelGroups || [])) {
        for (const sid of g.stepIds) {
            const child = taskSteps.find(ts => ts.id === sid);
            if (child) {
                child.parentId = g.id;
                child.isGroupChild = true;
            }
        }
    }

    // ── Position nodes ──
    let serialIdx = 0;
    for (const nodeId of serialOrder) {
        const node = allNodes.get(nodeId);
        if (!node) continue;
        node.x = INITIAL_X + serialIdx * NODE_SPACING_X;
        node.y = INITIAL_Y;
        serialIdx++;
    }
    // Position parallel group children stacked vertically
    for (const g of (job.parallelGroups || [])) {
        const groupNode = pGroups.find(pg => pg.id === g.id);
        if (!groupNode) continue;
        g.stepIds.forEach((sid, ci) => {
            const child = taskSteps.find(ts => ts.id === sid);
            if (child) {
                child.x = groupNode.x;
                child.y = groupNode.y + ci * NODE_SPACING_Y;
            }
        });
    }

    return {
        steps: [...taskSteps, ...pGroups],
        deliverables: job.deliverables || [],
        storageEntries: Object.entries(job.storageDefaults || {}).map(([key, value]) => ({
            key,
            value: typeof value === "string" ? value : JSON.stringify(value),
        })),
        inputs: job.inputDefaults || [],
        triggers: job.triggers || [],
    };
}

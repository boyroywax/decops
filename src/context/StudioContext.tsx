/**
 * StudioContext — bridges the Studio view's internal state/callbacks
 * to the rest of the app (command system, AI chatbot, etc.).
 *
 * Pattern: StudioView registers its API on mount; consumers read it.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { JobDeliverable, JobDefinition, EntityInput, JobTrigger, TriggerEvent } from "../types";
import type { OutputMapping, InputBinding, StudioStep } from "../components/views/StudioView";

/** The state snapshot returned by getState() */
export interface StudioState {
    name: string;
    description: string;
    editingJobId: string | null;
    mode: "serial" | "parallel" | "mixed";
    steps: StudioStep[];
    deliverables: JobDeliverable[];
    storageEntries: Array<{ key: string; value: string }>;
    inputs: EntityInput[];
}

/** Imperative API that StudioView exposes */
export interface StudioAPI {
    // --- State queries ---
    getState: () => StudioState;

    // --- Metadata ---
    setName: (name: string) => void;
    setDescription: (desc: string) => void;

    // --- Step CRUD ---
    /** Add a step for the given command ID. Returns the new step ID. */
    addStep: (commandId: string) => string;
    removeStep: (id: string) => void;
    updateStepArg: (stepId: string, argName: string, value: any) => void;
    updateStepPreCondition: (stepId: string, condition: string) => void;
    updateStepPostCondition: (stepId: string, condition: string) => void;
    updateStepPosition: (stepId: string, x: number, y: number) => void;
    addParallelGroup: () => string;
    updateStepOutputMappings: (stepId: string, mappings: OutputMapping[]) => void;
    updateStepInputBindings: (stepId: string, bindings: Record<string, InputBinding>) => void;
    updateStepModel: (stepId: string, modelId: string | undefined) => void;

    // --- Deliverables ---
    addDeliverableEntry: (d: JobDeliverable) => void;
    updateDeliverable: (index: number, field: keyof JobDeliverable, value: any) => void;
    removeDeliverableEntry: (index: number) => void;

    // --- Storage ---
    addStorageEntryWithValues: (key: string, value: string) => void;
    updateStorageEntry: (index: number, field: "key" | "value", val: string) => void;
    removeStorageEntry: (index: number) => void;

    // --- Inputs ---
    addInput: (inp: EntityInput) => void;
    updateInput: (index: number, field: keyof EntityInput, value: string) => void;
    removeInput: (index: number) => void;

    // --- Triggers ---
    addTrigger: (event: TriggerEvent, id?: string, filter?: any, label?: string, cron?: string) => void;
    updateTrigger: (id: string, patch: Partial<JobTrigger>) => void;
    removeTrigger: (id: string) => void;

    // --- Job lifecycle ---
    saveJob: () => any;
    runJob: () => any;
    loadJobById: (id: string) => any;
    clearCanvas: () => void;
}

interface StudioContextType {
    api: StudioAPI | null;
    register: (api: StudioAPI) => void;
    unregister: () => void;
}

const StudioContext = createContext<StudioContextType>({
    api: null,
    register: () => {},
    unregister: () => {},
});

export function StudioProvider({ children }: { children: ReactNode }) {
    const [api, setApi] = useState<StudioAPI | null>(null);

    const register = useCallback((newApi: StudioAPI) => {
        setApi(newApi);
    }, []);

    const unregister = useCallback(() => {
        setApi(null);
    }, []);

    return (
        <StudioContext.Provider value={{ api, register, unregister }}>
            {children}
        </StudioContext.Provider>
    );
}

/** Access the registered Studio API (may be null if Studio isn't mounted) */
export function useStudioContext() {
    return useContext(StudioContext);
}

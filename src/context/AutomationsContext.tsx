
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AutomationDefinition, AutomationRun } from "../services/automations/types";
// Update imports to include unregisterAutomation
import { registerAutomation, getAllAutomations, unregisterAutomation } from "../services/automations/registry";
import { AutomationRunner } from "../services/automations/runner";
import { healthCheckAutomation } from "../services/automations/definitions/healthCheck";


// 1. Initial Registration
registerAutomation(healthCheckAutomation);

interface AutomationsContextType {
    automations: AutomationDefinition[];
    runs: AutomationRun[];
    runAutomation: (id: string) => Promise<void>;
    register: (def: AutomationDefinition) => void;
    deleteAutomation: (id: string) => void;
    setAutomations: (data: AutomationDefinition[]) => void;
    setRuns: (data: AutomationRun[]) => void;
}

const AutomationsContext = createContext<AutomationsContextType | null>(null);

export function useAutomations() {
    const context = useContext(AutomationsContext);
    if (!context) {
        throw new Error("useAutomations must be used within an AutomationsProvider");
    }
    return context;
}

export const AutomationsProvider = ({ children, addLog }: { children: ReactNode, addLog: (msg: string) => void }) => {
    return (
        <AutomationsProviderInner addLog={addLog}>
            {children}
        </AutomationsProviderInner>
    );
};

// Split into Inner to use hooks
import { useWorkspaceContext } from "./WorkspaceContext";
import { useJobsContext } from "./JobsContext";
import { CommandContext } from "../services/commands/types";

// Mock or import other contexts if needed
// For now I'll implement a basic version

const AutomationsProviderInner = ({ children, addLog }: { children: ReactNode, addLog: (msg: string) => void }) => {
    const workspace = useWorkspaceContext();
    const jobs = useJobsContext();
    const [automationsList, setAutomationsList] = useState<AutomationDefinition[]>(getAllAutomations());
    const [runs, setRuns] = useState<AutomationRun[]>([]);

    useEffect(() => {
        setAutomationsList(getAllAutomations());
    }, []);

    const register = (def: AutomationDefinition) => {
        registerAutomation(def);
        setAutomationsList(getAllAutomations());
        // Duplicate setAutomationsList call removed
    };

    const deleteAutomation = (id: string) => {
        unregisterAutomation(id);
        setAutomationsList(getAllAutomations());
    };

    const runAutomation = async (id: string) => {
        // Construct CommandContext
        // We need 'ecosystem', 'auth', 'system', 'architect' which might be in other contexts or mocks.
        // For 'Health Check', we mainly need 'workspace' and 'jobs'.

        // This is a partial mock for now to get it working for the MVP.
        const cmdContext: CommandContext = {
            workspace: {
                ...workspace,
                addLog: addLog, // Use the prop!
            } as any, // Cast because context might have extra props or slight mismatch
            jobs: jobs as any,
            // Mocking the rest for now as they aren't used in Health Check
            auth: { user: { id: "system", role: "orchestrator" } },
            ecosystem: {
                ecosystems: [],
                bridges: [],
                bridgeMessages: [],
                setEcosystems: () => { },
                setBridges: () => { },
                setBridgeMessages: () => { },
                setActiveBridges: () => { },
                createBridge: () => { },
                removeBridge: () => { },
                saveCurrentNetwork: () => { },
                loadNetwork: () => { },
                dissolveNetwork: () => { }
            },
            system: {
                setApiKey: () => { },
                setModel: () => { }
            },
            architect: {
                generateNetwork: () => { },
                deployNetwork: () => { }
            },
            automations: {
                runAutomation,
                runs
            }
        };

        const runner = new AutomationRunner(cmdContext);

        // Optimistic update or wait?
        // Let's run it.
        // The runner returns the run object.
        const run = await runner.run(id);

        setRuns(prev => [run, ...prev]);
    };

    // Helper to sync registry
    const setAutomationsExternal = (data: AutomationDefinition[]) => {
        // Clear registry first? Or just register all?
        // Registry is memory based map.
        // If we import a workspace, we want to match what's in the workspace.
        // But system automations like "Health Check" should stay?
        // Let's just overwrite for now or merge.
        // Ideally we wipe the registry and re-register.
        // We can't easily wipe registry without a method.
        // But for now, let's just register all.
        data.forEach(def => registerAutomation(def));
        setAutomationsList(getAllAutomations());
    };

    const setRunsExternal = (data: AutomationRun[]) => {
        setRuns(data);
    };

    return (
        <AutomationsContext.Provider value={{
            automations: automationsList,
            runs,
            runAutomation,
            register,
            deleteAutomation,
            setAutomations: setAutomationsExternal,
            setRuns: setRunsExternal
        }}>
            {children}
        </AutomationsContext.Provider>
    );
};

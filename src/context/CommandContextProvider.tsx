/**
 * CommandContextProvider — exposes the assembled CommandContext via React context
 * so deep components (e.g. AgentChat) can run tool-calls without prop-drilling
 * the entire workspace/ecosystem/jobs/architect tree.
 *
 * Mounted inside AuthenticatedApp where the stateful `ecosystem` + `architect`
 * hooks are instantiated; we accept them as props to avoid creating duplicate
 * stateful hook instances.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useJobsContext } from "@/context/JobsContext";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useCommandContext, type EcosystemInput, type ArchitectInput } from "@/hooks/useCommandContext";
import type { CommandContext } from "@/services/commands/types";
import { setArchitectCommandContext } from "@/toolkits/architect/hooks/useArchitect";
import { useToolkitChatAgents } from "@/toolkits";

function GlobalRegistrar() {
    useToolkitChatAgents();
    return null;
}

const Ctx = createContext<CommandContext | null>(null);

interface ProviderProps {
    ecosystem: EcosystemInput;
    architect: ArchitectInput;
    addLog: (msg: string) => void;
    /** Toolkit-injected extensions (studio/editor APIs) */
    extensions?: Record<string, unknown>;
    children: ReactNode;
}

export function CommandContextProvider({
    ecosystem, architect, addLog, extensions, children,
}: ProviderProps) {
    const { user } = useAuth();
    const jobs = useJobsContext();
    const workspace = useWorkspaceContext();

    const value = useCommandContext({
        workspace,
        user,
        jobs,
        ecosystem,
        architect,
        addLog,
        extensions,
    });

    // Bridge command context into architect hook so deployNetwork()
    // can execute the deploy_network command via registry.execute().
    useEffect(() => {
        setArchitectCommandContext(value);
        return () => { setArchitectCommandContext(null); };
    }, [value]);

    return <Ctx.Provider value={value}><GlobalRegistrar />{children}</Ctx.Provider>;
}

/**
 * Hook that returns the shared CommandContext, or null if no provider is mounted.
 * Components that can function without it (e.g. read-only chat) should handle null.
 */
export function useCommandCtx(): CommandContext | null {
    return useContext(Ctx);
}

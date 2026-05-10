/**
 * CommandContextProvider — exposes the assembled CommandContext via React context
 * so deep components (e.g. AgentChat) can run tool-calls without prop-drilling
 * the entire workspace/ecosystem/jobs/architect tree.
 *
 * Mounted inside AuthenticatedApp where the stateful `ecosystem` + `architect`
 * hooks are instantiated; we accept them as props to avoid creating duplicate
 * stateful hook instances.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useJobsContext } from "@/context/JobsContext";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useCommandContext } from "@/hooks/useCommandContext";
import type { CommandContext } from "@/services/commands/types";

const Ctx = createContext<CommandContext | null>(null);

interface ProviderProps {
    ecosystem: any;
    architect: any;
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

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Hook that returns the shared CommandContext, or null if no provider is mounted.
 * Components that can function without it (e.g. read-only chat) should handle null.
 */
export function useCommandCtx(): CommandContext | null {
    return useContext(Ctx);
}

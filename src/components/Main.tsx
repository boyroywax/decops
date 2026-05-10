import React from "react";
import { useAuth } from "@/context/AuthContext";
import { JobsProvider, useJobsContext } from "@/context/JobsContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AuthenticatedApp } from "./layout/AuthenticatedApp";
import { LoginView } from "./views/LoginView";
import { AutomationsProvider } from "@/context/AutomationsContext";
import { LLMProvider } from "@/context/LLMContext";
import { useNotebook } from "@/hooks/useNotebook";
import { getToolkitProviders, getToolkitGlobals } from "@/services/toolkits/uiRegistry";

/**
 * Dynamically compose all toolkit-registered providers around `children`.
 * Providers are sorted by `order` (lower = closer to root).
 */
function ToolkitProviders({ children }: { children: React.ReactNode }) {
    const providers = getToolkitProviders();
    return providers.reduceRight(
        (acc, { Provider }) => React.createElement(Provider, null, acc),
        children,
    );
}

/** Render all toolkit-registered global overlays (modals, FABs, etc.). */
function ToolkitGlobals() {
    const globals = getToolkitGlobals();
    return (
        <>
            {globals.map(({ key, Component }) => (
                <Component key={key} />
            ))}
        </>
    );
}

function InternalApp() {
    const { addJob } = useJobsContext();
    const notebook = useNotebook();

    return (
        <LLMProvider>
            <WorkspaceProvider addJob={addJob}>
                <AutomationsProvider addLog={notebook.addLog}>
                    <ToolkitProviders>
                        <AuthenticatedApp notebook={notebook} />
                        <ToolkitGlobals />
                    </ToolkitProviders>
                </AutomationsProvider>
            </WorkspaceProvider>
        </LLMProvider>
    );
}

export function Main() {
    const { isInitialized, isLoading, isAuthenticated } = useAuth();
    console.log('[App] Main render:', { isInitialized, isLoading, isAuthenticated });

    if (!isInitialized || isLoading) {
        return (
            <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#52525b" }}>
                Loading configuration...
            </div>
        );
    }

    return isAuthenticated ? (
        <JobsProvider>
            <InternalApp />
        </JobsProvider>
    ) : <LoginView />;
}

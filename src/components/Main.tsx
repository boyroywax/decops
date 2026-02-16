import { useAuth } from "../context/AuthContext";
import { JobsProvider, useJobsContext } from "../context/JobsContext";
import { WorkspaceProvider } from "../context/WorkspaceContext";
import { AuthenticatedApp } from "./layout/AuthenticatedApp";
import { LoginView } from "./views/LoginView";
import { AutomationsProvider } from "../context/AutomationsContext";
import { useNotebook } from "../hooks/useNotebook";

function InternalApp() {
    const { addJob } = useJobsContext();
    const notebook = useNotebook();

    return (
        <WorkspaceProvider addJob={addJob}>
            <AutomationsProvider addLog={notebook.addLog}>
                <AuthenticatedApp notebook={notebook} />
            </AutomationsProvider>
        </WorkspaceProvider>
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

import { useAuth } from "../context/AuthContext";
import { JobsProvider, useJobsContext } from "../context/JobsContext";
import { WorkspaceProvider } from "../context/WorkspaceContext";
import { AuthenticatedApp } from "./layout/AuthenticatedApp";
import { LoginView } from "./views/LoginView";
import { registerCommands } from "../services/commands/init";
import { useEffect } from "react";

function InternalApp() {
    const { addJob } = useJobsContext();
    return (
        <WorkspaceProvider addJob={addJob}>
            <AuthenticatedApp />
        </WorkspaceProvider>
    );
}

export function Main() {
    const { isInitialized, isLoading, isAuthenticated } = useAuth();
    console.log('[App] Main render:', { isInitialized, isLoading, isAuthenticated });

    useEffect(() => {
        registerCommands();
    }, []);

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

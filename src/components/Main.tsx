import { useAuth } from "../context/AuthContext";
import { useJobs } from "../hooks/useJobs";
import { WorkspaceProvider } from "../context/WorkspaceContext";
import { AuthenticatedApp } from "./layout/AuthenticatedApp";
import { LoginView } from "./views/LoginView";
import { registerCommands } from "../services/commands/init";
import { useEffect } from "react";

export function Main() {
    const { isInitialized, isLoading, isAuthenticated } = useAuth();
    const { addJob } = useJobs();
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
        <WorkspaceProvider addJob={addJob}>
            <AuthenticatedApp />
        </WorkspaceProvider>
    ) : <LoginView />;
}

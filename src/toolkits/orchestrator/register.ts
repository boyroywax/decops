/**
 * Orchestrator Toolkit — UI registration (side-effect module).
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { OrchestratorProvider } from "./OrchestratorContext";
import { OrchestratorView } from "./components/OrchestratorView";

registerToolkitProvider({
    toolkitId: "orchestrator",
    Provider: OrchestratorProvider,
    order: 80,
});

registerToolkitView({
    toolkitId: "orchestrator",
    viewIds: ["orchestrator"],
    Component: OrchestratorView,
});

/**
 * OrbitDB Server Toolkit — UI registration (side-effect module).
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { OrbitdbServerProvider } from "./OrbitdbServerContext";
import { OrbitdbServerView } from "./components/OrbitdbServerView";

registerToolkitProvider({
    toolkitId: "orbitdb-server",
    Provider: OrbitdbServerProvider,
    order: 78,
});

registerToolkitView({
    toolkitId: "orbitdb-server",
    viewIds: ["orbitdb-server"],
    Component: OrbitdbServerView,
});

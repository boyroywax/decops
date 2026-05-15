/**
 * OrbitDB Toolkit — UI registration (side-effect module).
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { OrbitdbProvider } from "./OrbitdbContext";
import { OrbitdbView } from "./components/OrbitdbView";
import "./styles/orbitdb.css";

registerToolkitProvider({
    toolkitId: "orbitdb",
    Provider: OrbitdbProvider,
    order: 77,
});

registerToolkitView({
    toolkitId: "orbitdb",
    viewIds: ["orbitdb"],
    Component: OrbitdbView,
});

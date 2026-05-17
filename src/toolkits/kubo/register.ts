/**
 * Kubo Toolkit — UI registration (side-effect module).
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { KuboProvider } from "./KuboContext";
import { KuboView } from "./components/KuboView";

registerToolkitProvider({
    toolkitId: "kubo",
    Provider: KuboProvider,
    order: 77,
});

registerToolkitView({
    toolkitId: "kubo",
    viewIds: ["kubo"],
    Component: KuboView,
});

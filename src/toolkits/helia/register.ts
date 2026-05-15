/**
 * Helia Toolkit — UI registration (side-effect module).
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { HeliaProvider } from "./HeliaContext";
import { HeliaView } from "./components/HeliaView";

registerToolkitProvider({
    toolkitId: "helia",
    Provider: HeliaProvider,
    order: 76,
});

registerToolkitView({
    toolkitId: "helia",
    viewIds: ["helia"],
    Component: HeliaView,
});

/**
 * libp2p Toolkit — UI registration (side-effect module).
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { Libp2pProvider } from "./Libp2pContext";
import { Libp2pView } from "./Libp2pView";

registerToolkitProvider({
    toolkitId: "libp2p",
    Provider: Libp2pProvider,
    order: 75,
});

registerToolkitView({
    toolkitId: "libp2p",
    viewIds: ["libp2p"],
    Component: Libp2pView,
});

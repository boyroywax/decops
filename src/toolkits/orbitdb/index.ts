/**
 * OrbitDB Toolkit — barrel export.
 */

export { orbitdbService } from "./service";
export type { OrbitdbManager, OrbitdbNode } from "./service";
export type {
    OrbitdbStatus,
    OrbitdbDbType,
    OrbitdbDbInfo,
    OrbitdbSnapshot,
    OrbitdbStartOptions,
    OrbitdbManagerSnapshot,
    OrbitdbEntry,
} from "./types/orbitdb";

export { OrbitdbProvider, useOrbitdb } from "./OrbitdbContext";
export { OrbitdbView } from "./components/OrbitdbView";
export { OrbitdbChatBanner } from "./components/OrbitdbChatBanner";
export { useOrbitdbMetrics } from "./utils/useOrbitdbMetrics";

export { orbitdbCommands } from "./commands";

export {
    handleOrbitdbBotRequest,
    shouldDelegateToOrbitdbBot,
    getOrbitdbBotStatus,
    getOrbitdbBotConfig,
    updateOrbitdbBotConfig,
    getOrbitdbBotLog,
} from "./orbitdbBot";

export type {
    OrbitdbBotStatus,
    OrbitdbBotConfig,
    OrbitdbBotRequest,
    OrbitdbBotResponse,
    OrbitdbBotOperation,
} from "./types/orbitdbBot";

export { orbitdbModule } from "./module";

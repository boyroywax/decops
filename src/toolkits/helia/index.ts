/**
 * Helia (IPFS) Toolkit — barrel export.
 */

export { heliaService } from "./service";
export type { HeliaManager, HeliaNode } from "./service";
export type {
    HeliaStatus,
    HeliaSnapshot,
    HeliaContentEntry,
    HeliaStartOptions,
    HeliaManagerSnapshot,
} from "./types/helia";

export { HeliaProvider, useHelia } from "./HeliaContext";
export { HeliaView } from "./components/HeliaView";
export { HeliaChatBanner } from "./components/HeliaChatBanner";

export {
    heliaCommands,
    heliaStartCommand,
    heliaStopCommand,
    heliaAddNodeCommand,
    heliaRemoveNodeCommand,
    heliaSetActiveNodeCommand,
    heliaRenameNodeCommand,
    heliaSetLibp2pCommand,
    heliaAddTextCommand,
    heliaAddJsonCommand,
    heliaCatCommand,
    heliaPinCommand,
    heliaUnpinCommand,
    heliaListEntriesCommand,
    heliaClearEntriesCommand,
} from "./commands";

export { useHeliaMetrics } from "./utils/useHeliaMetrics";

export {
    handleHeliaBotRequest,
    shouldDelegateToHeliaBot,
    getHeliaBotStatus,
    getHeliaBotConfig,
    updateHeliaBotConfig,
    getHeliaBotLog,
} from "./heliaBot";

export type {
    HeliaBotStatus,
    HeliaBotConfig,
    HeliaBotRequest,
    HeliaBotResponse,
    HeliaBotOperation,
} from "./types/heliaBot";

export { heliaModule } from "./module";

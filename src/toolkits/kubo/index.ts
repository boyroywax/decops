/**
 * Kubo IPFS Connector Toolkit — barrel export.
 */

export { kuboService } from "./service";
export type { KuboManager, KuboNode } from "./service";
export type {
    KuboStatus,
    KuboSnapshot,
    KuboContentEntry,
    KuboPeerInfo,
    KuboEndpointConfig,
    KuboConnectOptions,
    KuboManagerSnapshot,
} from "./types/kubo";

export { KuboProvider, useKubo } from "./KuboContext";
export { KuboView } from "./components/KuboView";
export { KuboChatBanner } from "./components/KuboChatBanner";

export {
    kuboCommands,
    kuboConnectCommand,
    kuboDisconnectCommand,
    kuboAddNodeCommand,
    kuboRemoveNodeCommand,
    kuboSetActiveNodeCommand,
    kuboRenameNodeCommand,
    kuboSetEndpointCommand,
    kuboIdCommand,
    kuboVersionCommand,
    kuboAddTextCommand,
    kuboAddJsonCommand,
    kuboAddBytesCommand,
    kuboCatCommand,
    kuboLsCommand,
    kuboPinCommand,
    kuboUnpinCommand,
    kuboListPinsCommand,
    kuboSwarmPeersCommand,
    kuboSwarmConnectCommand,
    kuboListEntriesCommand,
    kuboClearEntriesCommand,
} from "./commands";

export { useKuboMetrics } from "./utils/useKuboMetrics";

export {
    handleKuboBotRequest,
    shouldDelegateToKuboBot,
    getKuboBotStatus,
    getKuboBotConfig,
    updateKuboBotConfig,
    getKuboBotLog,
} from "./kuboBot";

export type {
    KuboBotStatus,
    KuboBotConfig,
    KuboBotRequest,
    KuboBotResponse,
    KuboBotOperation,
} from "./types/kuboBot";

export { kuboModule } from "./module";

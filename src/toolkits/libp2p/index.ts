/**
 * libp2p Toolkit — barrel export.
 *
 * Folder layout (mirrors the studio toolkit):
 *   commands/   — chat/job-callable command definitions.
 *   components/ — React UI surfaces (view, modals, panels).
 *   styles/     — toolkit-scoped CSS.
 *   types/      — shape-only re-exports.
 *   utils/      — service helpers, hooks, collections store.
 *   service.ts  — multi-node libp2p manager singleton.
 */

export { libp2pService, DEFAULT_BOOTSTRAP } from "./service";
export type {
    Libp2pStatus,
    Libp2pSnapshot,
    Libp2pStartOptions,
    ManagerSnapshot,
    PeerInfo,
    PubsubMessage,
} from "./types/libp2p";

export { Libp2pProvider, useLibp2p } from "./Libp2pContext";
export { Libp2pView } from "./components/Libp2pView";
export { Libp2pBotPanel } from "./components/Libp2pBotPanel";

export {
    libp2pCommands,
    libp2pStartCommand,
    libp2pStopCommand,
    libp2pDialCommand,
    libp2pHangupCommand,
    libp2pPingCommand,
    libp2pListPeersCommand,
    libp2pPubsubSubscribeCommand,
    libp2pPubsubUnsubscribeCommand,
    libp2pPubsubPublishCommand,
    libp2pClearPeersCommand,
    libp2pAddNodeCommand,
    libp2pRemoveNodeCommand,
    libp2pSetActiveNodeCommand,
    libp2pRenameNodeCommand,
    libp2pGenerateIdentityCommand,
    libp2pImportIdentityCommand,
    libp2pExportIdentityCommand,
    libp2pClearIdentityCommand,
} from "./commands";

export {
    useLibp2pCollections,
    encryptIdentity,
    decryptIdentity,
    type Contact,
    type VaultEntry,
} from "./utils/collections";

export { useLibp2pMetrics } from "./utils/useLibp2pMetrics";

export {
    handleLibp2pBotRequest,
    shouldDelegateToLibp2pBot,
    getLibp2pBotStatus,
    getLibp2pBotConfig,
    updateLibp2pBotConfig,
    getLibp2pBotLog,
} from "./libp2pBot";
export type {
    Libp2pBotStatus,
    Libp2pBotConfig,
    Libp2pBotRequest,
    Libp2pBotResponse,
    Libp2pBotOperation,
} from "./types/libp2pBot";

export { libp2pModule } from "./module";

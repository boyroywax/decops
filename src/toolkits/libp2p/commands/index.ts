/**
 * libp2p toolkit commands — aggregator.
 *
 * Each command thinly wraps the libp2pService manager so it can be invoked
 * from chat / job pipelines as well as from the UI. Every "node-scoped"
 * command accepts an optional `nodeId` arg; when omitted, the command
 * targets the currently-active node.
 *
 * Per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md the individual command
 * definitions live in domain-scoped files; this file only re-exports them
 * and assembles the registration array consumed by the toolkit module.
 */

import type { CommandDefinition } from "@/services/commands/types";

import {
    libp2pStartCommand,
    libp2pStopCommand,
    libp2pClearPeersCommand,
    libp2pAddNodeCommand,
    libp2pRemoveNodeCommand,
    libp2pSetActiveNodeCommand,
    libp2pRenameNodeCommand,
} from "./lifecycle";
import {
    libp2pDialCommand,
    libp2pHangupCommand,
    libp2pPingCommand,
    libp2pListPeersCommand,
} from "./peers";
import {
    libp2pPubsubSubscribeCommand,
    libp2pPubsubUnsubscribeCommand,
    libp2pPubsubPublishCommand,
} from "./pubsub";
import {
    libp2pGenerateIdentityCommand,
    libp2pImportIdentityCommand,
    libp2pExportIdentityCommand,
    libp2pClearIdentityCommand,
} from "./identity";
import {
    libp2pContactAddCommand,
    libp2pContactRemoveCommand,
    libp2pContactListCommand,
    libp2pContactDialCommand,
} from "./contacts";
import {
    libp2pVaultStoreCommand,
    libp2pVaultRemoveCommand,
    libp2pVaultListCommand,
    libp2pVaultLoadCommand,
    libp2pVaultExportCurrentCommand,
} from "./vault";
import {
    libp2pPnetGenerateCommand,
    libp2pPnetAddCommand,
    libp2pPnetListCommand,
    libp2pPnetRemoveCommand,
    libp2pPnetApplyCommand,
} from "./pnet";

export {
    libp2pStartCommand,
    libp2pStopCommand,
    libp2pClearPeersCommand,
    libp2pAddNodeCommand,
    libp2pRemoveNodeCommand,
    libp2pSetActiveNodeCommand,
    libp2pRenameNodeCommand,
} from "./lifecycle";
export {
    libp2pDialCommand,
    libp2pHangupCommand,
    libp2pPingCommand,
    libp2pListPeersCommand,
} from "./peers";
export {
    libp2pPubsubSubscribeCommand,
    libp2pPubsubUnsubscribeCommand,
    libp2pPubsubPublishCommand,
} from "./pubsub";
export {
    libp2pGenerateIdentityCommand,
    libp2pImportIdentityCommand,
    libp2pExportIdentityCommand,
    libp2pClearIdentityCommand,
} from "./identity";
export {
    libp2pContactAddCommand,
    libp2pContactRemoveCommand,
    libp2pContactListCommand,
    libp2pContactDialCommand,
} from "./contacts";
export {
    libp2pVaultStoreCommand,
    libp2pVaultRemoveCommand,
    libp2pVaultListCommand,
    libp2pVaultLoadCommand,
    libp2pVaultExportCurrentCommand,
} from "./vault";
export {
    libp2pPnetGenerateCommand,
    libp2pPnetAddCommand,
    libp2pPnetListCommand,
    libp2pPnetRemoveCommand,
    libp2pPnetApplyCommand,
} from "./pnet";

export const libp2pCommands: CommandDefinition[] = [
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
    libp2pContactAddCommand,
    libp2pContactRemoveCommand,
    libp2pContactListCommand,
    libp2pContactDialCommand,
    libp2pVaultStoreCommand,
    libp2pVaultRemoveCommand,
    libp2pVaultListCommand,
    libp2pVaultLoadCommand,
    libp2pVaultExportCurrentCommand,
    libp2pPnetGenerateCommand,
    libp2pPnetAddCommand,
    libp2pPnetListCommand,
    libp2pPnetRemoveCommand,
    libp2pPnetApplyCommand,
];

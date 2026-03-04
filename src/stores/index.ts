/**
 * Zustand stores — barrel export.
 *
 * Usage:
 *   import { useWorkspaceStore, useEcosystemStore } from "@/stores";
 *
 * Selectors can be imported from individual store files:
 *   import { selectAgentsByNetwork } from "@/stores/workspaceStore";
 */

export { useWorkspaceStore } from "./workspaceStore";
export type { WorkspaceState, WorkspaceActions, WorkspaceStore } from "./workspaceStore";
export {
  selectAgentsByNetwork,
  selectChannelsByNetwork,
  selectGroupsByNetwork,
  selectChannelMessages,
  selectUnreadCounts,
  selectTotalUnread,
} from "./workspaceStore";

export { useEcosystemStore } from "./ecosystemStore";
export type { EcosystemState, EcosystemActions, EcosystemStore } from "./ecosystemStore";
export {
  selectNetworks,
  selectBridges,
  selectBridgeMessages,
  selectActiveNetwork,
  selectNetworkById,
  selectBridgesForNetwork,
} from "./ecosystemStore";

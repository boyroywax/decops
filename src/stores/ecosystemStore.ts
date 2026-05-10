/**
 * Zustand Ecosystem Store — single source of truth for ecosystem metadata.
 *
 * Replaces: useEcosystem, EcosystemContext.
 * Persists the Ecosystem object (networks, bridges, bridgeMessages) to localStorage.
 *
 * Design notes:
 *  - The Network type will be slimmed: instead of storing nested agents/channels/groups/messages
 *    inside each Network, use derived selectors from the workspace store.
 *  - Bridges and bridge messages live here since they are ecosystem-level, not per-network.
 *  - Transient UI state (bridge form, selected bridge, bridge msg input) stays in components.
 *  - Orphan adoption is moved here as a store action (not an effect loop).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Network, Bridge, BridgeMessage, Ecosystem } from "@/types";
import { generateEcosystemDID } from "@/utils/identity";

// ── State shape ──

export interface EcosystemState {
  // The canonical ecosystem object
  ecosystem: Ecosystem;

  // Active network selection
  activeNetworkId: string | null;
}

export interface EcosystemActions {
  // Top-level ecosystem setter (for wholesale replacement)
  setEcosystem: (updater: Ecosystem | ((prev: Ecosystem) => Ecosystem)) => void;

  // Network CRUD
  setNetworks: (updater: Network[] | ((prev: Network[]) => Network[])) => void;
  addNetwork: (network: Network) => void;
  updateNetwork: (id: string, patch: Partial<Network>) => void;
  removeNetwork: (id: string) => void;

  // Bridge CRUD
  setBridges: (updater: Bridge[] | ((prev: Bridge[]) => Bridge[])) => void;
  addBridge: (bridge: Bridge) => void;
  removeBridge: (id: string) => void;

  // Bridge messages
  setBridgeMessages: (updater: BridgeMessage[] | ((prev: BridgeMessage[]) => BridgeMessage[])) => void;
  addBridgeMessage: (msg: BridgeMessage) => void;

  // Active network
  setActiveNetworkId: (id: string | null) => void;

  // Reset
  resetEcosystem: () => void;
}

export type EcosystemStore = EcosystemState & EcosystemActions;

// ── Helpers ──

function createDefaultEcosystem(): Ecosystem {
  return {
    id: crypto.randomUUID(),
    name: "Default Ecosystem",
    did: generateEcosystemDID(),
    networks: [],
    bridges: [],
    bridgeMessages: [],
    createdAt: new Date().toISOString(),
  };
}

// ── Store ──

export const useEcosystemStore = create<EcosystemStore>()(
  persist(
    immer((set, get) => ({
      // Initial state
      ecosystem: createDefaultEcosystem(),
      activeNetworkId: null,

      // Top-level ecosystem management
      setEcosystem: (updater) =>
        set((state) => {
          state.ecosystem =
            typeof updater === "function" ? updater(state.ecosystem) : updater;
        }),

      // Network management
      setNetworks: (updater) =>
        set((state) => {
          state.ecosystem.networks =
            typeof updater === "function" ? updater(state.ecosystem.networks) : updater;
        }),

      addNetwork: (network) =>
        set((state) => {
          state.ecosystem.networks.push(network);
        }),

      updateNetwork: (id, patch) =>
        set((state) => {
          const idx = state.ecosystem.networks.findIndex((n) => n.id === id);
          if (idx !== -1) {
            Object.assign(state.ecosystem.networks[idx], patch);
          }
        }),

      removeNetwork: (id) =>
        set((state) => {
          state.ecosystem.networks = state.ecosystem.networks.filter((n) => n.id !== id);
          // Also clean up bridges referencing this network
          state.ecosystem.bridges = state.ecosystem.bridges.filter(
            (b) => b.fromNetworkId !== id && b.toNetworkId !== id
          );
          // Clear active network if it was the one removed
          if (state.activeNetworkId === id) {
            state.activeNetworkId = null;
          }
        }),

      // Bridge management
      setBridges: (updater) =>
        set((state) => {
          state.ecosystem.bridges =
            typeof updater === "function" ? updater(state.ecosystem.bridges) : updater;
        }),

      addBridge: (bridge) =>
        set((state) => {
          state.ecosystem.bridges.push(bridge);
        }),

      removeBridge: (id) =>
        set((state) => {
          state.ecosystem.bridges = state.ecosystem.bridges.filter((b) => b.id !== id);
        }),

      // Bridge messages
      setBridgeMessages: (updater) =>
        set((state) => {
          state.ecosystem.bridgeMessages =
            typeof updater === "function" ? updater(state.ecosystem.bridgeMessages) : updater;
        }),

      addBridgeMessage: (msg) =>
        set((state) => {
          state.ecosystem.bridgeMessages.push(msg);
        }),

      // Active network
      setActiveNetworkId: (id) =>
        set((state) => {
          state.activeNetworkId = id;
        }),

      // Reset
      resetEcosystem: () =>
        set((state) => {
          state.ecosystem = createDefaultEcosystem();
          state.activeNetworkId = null;
        }),
    })),
    {
      name: "decops_ecosystem_v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ecosystem: state.ecosystem,
        // Don't persist activeNetworkId — it's transient UI state
      }),
    }
  )
);

// ── Migration from legacy useLocalStorage("decops_ecosystem") ──
// Old format: raw Ecosystem object stored directly.
// New format: Zustand persist wrapper { state: { ecosystem: ... }, version: 0 }.
if (typeof window !== "undefined") {
  const hasNewStore = localStorage.getItem("decops_ecosystem_v2");
  if (!hasNewStore) {
    try {
      const raw = localStorage.getItem("decops_ecosystem");
      if (raw) {
        const oldEcosystem = JSON.parse(raw);
        // Verify it looks like a raw Ecosystem (has networks array, not a Zustand wrapper)
        if (oldEcosystem && Array.isArray(oldEcosystem.networks)) {
          useEcosystemStore.getState().setEcosystem(oldEcosystem);
        }
      }
    } catch {
      // Ignore parse errors — start fresh
    }
  }
  // Clean up old key regardless (Zustand store now owns ecosystem persistence)
  localStorage.removeItem("decops_ecosystem");
}

// ── Selectors ──

/** Get all networks */
export const selectNetworks = (state: EcosystemState) => state.ecosystem.networks;

/** Get all bridges */
export const selectBridges = (state: EcosystemState) => state.ecosystem.bridges;

/** Get all bridge messages */
export const selectBridgeMessages = (state: EcosystemState) => state.ecosystem.bridgeMessages;

/** Get the currently active network */
export const selectActiveNetwork = (state: EcosystemState) =>
  state.activeNetworkId
    ? state.ecosystem.networks.find((n) => n.id === state.activeNetworkId) ?? null
    : null;

/** Get a specific network by ID */
export const selectNetworkById = (id: string) => (state: EcosystemState) =>
  state.ecosystem.networks.find((n) => n.id === id) ?? null;

/** Get bridges for a specific network */
export const selectBridgesForNetwork = (networkId: string) => (state: EcosystemState) =>
  state.ecosystem.bridges.filter(
    (b) => b.fromNetworkId === networkId || b.toNetworkId === networkId
  );

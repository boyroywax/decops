# Decops Architecture — Workspace → Ecosystem → Network Model

> **Last updated:** 2025-07-16  
> **Branch:** `feat/automations`

---

## 1. Desired Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Workspace                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Ecosystem (1 per workspace)                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐   │  │
│  │  │  Network A   │  │  Network B   │  │ Network C  │   │  │
│  │  │  ┌────────┐  │  │  ┌────────┐  │  │            │   │  │
│  │  │  │ Group 1│  │  │  │ Group 3│  │  │  ┌──────┐  │   │  │
│  │  │  │ A1  A2 │  │  │  │ A4  A5 │  │  │  │  A7  │  │   │  │
│  │  │  └────────┘  │  │  └────────┘  │  │  └──────┘  │   │  │
│  │  │  ┌────────┐  │  │              │  │            │   │  │
│  │  │  │ Group 2│  │  │  ┌──────┐    │  └────────────┘   │  │
│  │  │  │ A1  A3 │  │  │  │  A6  │    │                   │  │
│  │  │  └────────┘  │  │  └──────┘    │   Bridges         │  │
│  │  │              │  │              │   (cross-network   │  │
│  │  │  Channels:   │  │  Channels:   │    channels)       │  │
│  │  │  A1↔A2 data  │  │  A4↔A5 task  │   A3 ⟷ A6         │  │
│  │  │  A1↔A3 task  │  │  A4↔A6 data  │   A2 ⟷ A4         │  │
│  │  └──────────────┘  └──────────────┘                   │  │
│  └────────────────────────────────────────────────────────┘  │
│  Active User Context (DID, credentials, profile)            │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Entity Hierarchy

| Level | Entity | Contains | Cardinality |
|-------|--------|----------|-------------|
| 1 | **Workspace** | 1 Ecosystem + 1 User Context | 1 per session |
| 2 | **Ecosystem** | 1+ Networks, 0+ Bridges | 1 per Workspace |
| 3 | **Network** | Agents, Channels, Groups | 1+ per Ecosystem |
| 4 | **Group** | Agent membership refs | 0+ per Network (2+ agents each) |
| 4 | **Channel** | Communication link between 2 agents | 0+ per Network or cross-Network (Bridge) |
| 5 | **Agent** | Identity (DID/keys), role, prompt | 1+ per Network |

### 1.2 Key Invariants

1. **Workspace isolation** — Each workspace is a self-contained unit; switching workspaces fully swaps state.
2. **Single ecosystem** — A workspace holds exactly one ecosystem (the "universe" of all networks the user manages).
3. **Network as container** — Agents, channels, and groups always belong to a specific network. There are no "loose" agents at the workspace/ecosystem level.
4. **Groups coordinate agents** — A group contains 2+ agents from the same network, provides governance (voting model, threshold), and enables broadcast messaging.
5. **Channels describe communication** — Every channel connects exactly 2 agents. Channels have a **mode**:
   - `p2p` — both agents in the same network (intra-network)
   - `broadcast` — group-scoped fan-out within a network
   - `bridge` — agents in different networks (cross-network); represented as a Bridge entity at the ecosystem level
6. **Bridges are ecosystem-level** — A Bridge links two agents across two networks and is owned by the ecosystem, not by either network.

### 1.3 Channel Taxonomy

| Mode | Scope | Endpoints | Created via |
|------|-------|-----------|-------------|
| `p2p` | Intra-network | 2 agents, same network | Channel form |
| `broadcast` | Intra-network (group) | 1 sender → group members | Group broadcast |
| `bridge` | Cross-network | 2 agents, different networks | Bridge Builder |

---

## 2. Current Codebase State vs. Desired

### 2.1 Checklist

| # | Requirement | Desired | Current State | Status |
|---|-------------|---------|---------------|--------|
| **Workspace** | | | | |
| 1 | Workspace CRUD (create, switch, delete, duplicate) | ✅ | `useWorkspaceManager` provides full CRUD; localStorage-persisted | ✅ Done |
| 2 | Workspace holds a single ecosystem | Each workspace embeds one ecosystem | `Workspace.ecosystem?: Ecosystem` added; `createWorkspace()` creates default ecosystem; `saveWorkspace()`/`loadWorkspace()` persist ecosystem in blob; `AuthenticatedApp` save/load prefers ecosystem object with legacy fallback | ✅ Done |
| 3 | Active user context per workspace | DID, credentials, profile tied to workspace | `AuthContext` is global (not per-workspace); user identity is shared across all workspaces | ⚠️ Partial |
| **Ecosystem** | | | | |
| 4 | Explicit Ecosystem entity (1 per workspace) | First-class `Ecosystem` type containing networks + bridges + bridgeMessages | `Ecosystem` interface in `types/index.ts`; `useEcosystem` manages a single `Ecosystem` object via `useLocalStorage<Ecosystem>("decops_ecosystem", ...)`. One-time migration from legacy `decops_ecosystems`/`decops_bridges` keys | ✅ Done |
| 5 | Ecosystem persisted inside workspace blob | Networks/bridges saved when workspace is saved | `AuthenticatedApp.handleSwitchWorkspace` saves `ecosystem: ecosystem.ecosystem` in workspace blob; load prefers `newWorkspace.ecosystem` → `setEcosystem()`, falls back to legacy arrays | ✅ Done |
| 6 | Ecosystem-level bridge ownership | Bridges belong to the ecosystem, not a network | Bridges stored in `ecosystem.bridges[]` referencing network IDs; lifecycle tied to ecosystem object | ✅ Done |
| **Network** | | | | |
| 7 | Network is the container for agents/channels/groups | All agents belong to a specific network | `networkId?: string` added to `Agent`, `Channel`, `Group` types; `save_ecosystem` and `create_network` commands tag entities with `networkId`; `load_ecosystem` preserves `networkId` on load. Active workspace still uses flat arrays (`WorkspaceContext`) — not yet scoped per-network | ⚠️ Partial |
| 8 | Create network (manual or Architect) | Network created empty or via AI prompt | `create_network` command registered: creates empty network or generates via Architect (`generateMeshConfig`); `save_ecosystem` snapshots workspace entities with `networkId` tagging. `CreateNetworkModal` dispatches both | ✅ Done |
| 9 | Load network into workspace | Populate workspace from saved network | `load_ecosystem` command loads network contents into workspace arrays, preserving `networkId` on all entities | ✅ Done |
| 10 | Multiple networks coexist in workspace | Ecosystem holds N networks simultaneously | Ecosystem holds N networks; however, only one network's agents are "active" at a time in flat workspace arrays. Need `activeNetworkId` concept in `WorkspaceContext` | ⚠️ Partial |
| **Groups** | | | | |
| 11 | Groups exist inside a network | `Group.networkId` links to parent network | `Group.networkId?: string` added; commands assign `networkId` when creating/saving networks | ✅ Done |
| 12 | Groups coordinate 2+ agents | Governance model, member list, threshold | `Group` type has `governance`, `members[]`, `threshold` — fully modeled | ✅ Done |
| 13 | Group broadcast messaging | Send message to all group members | `sendBroadcast` in `useMessages`; `broadcast` channel mode exists | ✅ Done |
| **Channels** | | | | |
| 14 | Channels describe communication between 2 agents | `from` + `to` agent refs, typed | `Channel` type has `from`, `to`, `type`, `mode` | ✅ Done |
| 15 | Channel modes: p2p, bridge, broadcast | Discriminated by `mode` field | `ChannelMode = "p2p" \| "bridge" \| "broadcast"` type exists; `Channel.mode` is optional (defaults to p2p) | ✅ Done |
| 16 | Intra-network channels (same network) | Both agents in same network | `Channel.networkId?: string` added; channels created within a network carry `networkId`. UI forms don't yet auto-assign `networkId` | ⚠️ Partial |
| 17 | Cross-network channels (bridges) | Bridge entity + bridge-mode channel | `Bridge` type exists with `fromNetworkId`, `toNetworkId`, `fromAgentId`, `toAgentId`; bridge messages stored in `ecosystem.bridgeMessages[]` | ✅ Done |
| 18 | Inter-group channels | Channel between agents in different groups (same network) | No explicit inter-group concept; any two agents can have a channel regardless of group membership | ⚠️ Partial — works implicitly |
| **Agents** | | | | |
| 19 | Agents belong to a network | `Agent.networkId` foreign key | `Agent.networkId?: string` added; commands assign `networkId` when creating networks or saving/loading ecosystems. UI forms don't yet auto-assign `networkId` | ⚠️ Partial |
| 20 | Agent identity (DID, keys) | Each agent has unique DID + keypair | `Agent` has `did`, `keys: { pub, priv }` | ✅ Done |
| 21 | Agent roles and prompts | Role-based behavior, editable prompt | `Agent.role` (RoleId) + `Agent.prompt` (string) | ✅ Done |
| **UI / Views** | | | | |
| 22 | Network Manager view (tabs) | Networks, Bridges, Topology | `NetworksView` with 3 tabs, decomposed into sub-components | ✅ Done |
| 23 | Messages view with all modes | P2P, Broadcast, Bridge messaging | `MessagesView` with 3 sidebar sections | ✅ Done |
| 24 | Topology visualization | Canvas showing networks + bridges | `EcosystemCanvas` + `TopologyPanel` wrapper; `print_topology` command now includes ecosystem metadata | ✅ Done |

### 2.2 Summary Scorecard

| Category | Done | Partial | Missing | Total |
|----------|------|---------|---------|-------|
| Workspace | 2 | 1 | 0 | 3 |
| Ecosystem | 3 | 0 | 0 | 3 |
| Network | 2 | 2 | 0 | 4 |
| Groups | 3 | 0 | 0 | 3 |
| Channels | 3 | 2 | 0 | 5 |
| Agents | 2 | 1 | 0 | 3 |
| UI/Views | 3 | 0 | 0 | 3 |
| **Totals** | **18** | **6** | **0** | **24** |

---

## 3. Gap Analysis — What Has Changed & What Remains

### 3.1 Data Model Changes (✅ Implemented)

```typescript
// ✅ NEW: First-class Ecosystem (replaces loose Network[] + Bridge[])
interface Ecosystem {
  id: string;
  name: string;
  did: string;
  networks: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];
  createdAt: string;
}

// ✅ CHANGED: Network gains description
interface Network {
  // ...existing fields
  description?: string;  // ← NEW
}

// ✅ CHANGED: Agent gets networkId
interface Agent {
  // ...existing fields
  networkId?: string;    // ← NEW: which network this agent belongs to
}

// ✅ CHANGED: Channel gets networkId
interface Channel {
  // ...existing fields
  networkId?: string;   // ← NEW: absent for bridge-mode channels
}

// ✅ CHANGED: Group gets networkId
interface Group {
  // ...existing fields
  networkId?: string;   // ← NEW: which network this group belongs to
}

// ✅ CHANGED: Workspace embeds ecosystem
interface Workspace {
  metadata: WorkspaceMetadata;
  ecosystem?: Ecosystem;       // ← NEW: first-class ecosystem
  activeNetworkId?: string;    // ← NEW: focused network in UI
  // @deprecated top-level agents/channels/groups/messages kept for backward compat
}
```

### 3.2 Hooks & Persistence Changes (✅ Implemented)

| Component | Change | Status |
|-----------|--------|--------|
| `useEcosystem` | Stores single `Ecosystem` object via `useLocalStorage<Ecosystem>("decops_ecosystem", ...)`. Auto-migrates legacy `decops_ecosystems` / `decops_bridges` keys. Backward-compat aliases (`ecosystems`, `bridges`, setters) preserved | ✅ Done |
| `useWorkspaceManager` | `createWorkspace()` embeds default `Ecosystem`. `saveWorkspace()` stats count `workspace.ecosystem?.networks` | ✅ Done |
| `AuthenticatedApp` | `handleSwitchWorkspace()` saves/loads `ecosystem` in workspace blob. Prefers `newWorkspace.ecosystem`, falls back to legacy arrays | ✅ Done |
| `CommandContext` | Added `ecosystem` + `setEcosystem` to the ecosystem field on `CommandContext` type | ✅ Done |
| `useJobExecutor` | Passes `ecosystem.ecosystem` and `ecosystem.setEcosystem` in context | ✅ Done |

### 3.3 Command Changes (✅ Implemented)

| Command | Change | Status |
|---------|--------|--------|
| `create_network` | **NEW**: Creates empty or Architect-generated network in the ecosystem with proper `networkId` tagging | ✅ Done |
| `save_ecosystem` | Tags agents/channels/groups with `networkId` before saving to ecosystem | ✅ Done |
| `load_ecosystem` | Preserves `networkId` on entities (defaults to network ID if missing) | ✅ Done |
| `list_ecosystems` | Now reports channel/group counts alongside agent count | ✅ Done |
| `delete_ecosystem` | Updated description/log messages for clarity | ✅ Done |
| `print_topology` | Includes ecosystem metadata + `networkId` for all entities | ✅ Done |

### 3.4 Remaining Work (Migration Path)

| Step | Change | Effort | Risk | Status |
|------|--------|--------|------|--------|
| 1 | Add `Ecosystem` type; embed in `Workspace` type | S | Low | ✅ Done |
| 2 | Add `networkId` to `Agent`, `Channel`, `Group` types | S | Low | ✅ Done |
| 3 | Refactor `useEcosystem` → persist inside workspace blob | M | Medium | ✅ Done |
| 4 | Refactor `WorkspaceContext` to scope agents/channels/groups to the active network | L | High — touches every consumer | ❌ Not started |
| 5 | Update `save_ecosystem` / `load_ecosystem` / `create_network` commands | M | Medium | ✅ Done |
| 6 | Migrate existing localStorage data (top-level arrays → nested in a default network) | M | Medium | ⚠️ Partial (legacy key migration done; workspace-level entity scoping pending) |
| 7 | Update UI components to pass `networkId` context when creating agents/channels/groups | M | Medium | ❌ Not started |
| 8 | Support multiple networks active simultaneously in the workspace | L | High | ❌ Not started |
| 9 | Move user context association to workspace level | S | Low | ❌ Not started |

---

## 4. Current File Map

| File | Role in Architecture |
|------|---------------------|
| `src/types/index.ts` | All type definitions — `Ecosystem`, `Network`, `Bridge`, `Agent`, `Channel`, `Group`, `Workspace` (with `ecosystem?` + `activeNetworkId?`) |
| `src/context/WorkspaceContext.tsx` | Provides workspace-global agents/channels/groups/messages (no network scoping yet) |
| `src/context/EcosystemContext.tsx` | Thin wrapper exposing `useEcosystem` return value |
| `src/hooks/useEcosystem.ts` | Manages single `Ecosystem` object in `useLocalStorage`; backward-compat aliases for views |
| `src/hooks/useWorkspaceManager.ts` | Workspace CRUD — embeds default ecosystem on create, persists ecosystem in blob |
| `src/services/commands/types.ts` | `CommandContext` — includes `ecosystem` + `setEcosystem` on the ecosystem field |
| `src/services/commands/definitions/ecosystem.ts` | `create_network`, `save_ecosystem`, `load_ecosystem`, `list_ecosystems`, `delete_ecosystem` |
| `src/services/commands/definitions/topology.ts` | `create_bridge`, `delete_bridge`, `print_topology` (ecosystem-aware output) |
| `src/hooks/useJobExecutor.tsx` | Builds `CommandContext` with ecosystem object + setter |
| `src/components/layout/AuthenticatedApp.tsx` | Top-level wiring; workspace save/load includes ecosystem |
| `src/components/views/NetworksView.tsx` | Network Manager UI (composition of sub-components) |
| `src/components/views/networks/` | `NetworkCard`, `BridgeBuilder`, `BridgeCard`, `CreateNetworkModal`, `TopologyPanel` |
| `src/components/views/MessagesView.tsx` | Unified messaging (P2P, Broadcast, Bridge) |
| `src/utils/identity.ts` | DID generators: `generateEcosystemDID()`, `generateNetworkDID()`, `generateDID()`, etc. |

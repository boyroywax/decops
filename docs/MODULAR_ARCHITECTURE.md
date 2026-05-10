# Decops Modular Architecture

> **Status:** Living document — captures the current state, target architecture, and extraction plan for splitting the monolithic SPA into three cleanly separated layers: **Core Platform**, **Mesh Workspace**, and **Toolkits**.

---

## Table of Contents

1. [Three-Layer Model](#1-three-layer-model)
2. [Layer 1 — Core Platform](#2-layer-1--core-platform)
3. [Layer 2 — Mesh Workspace](#3-layer-2--mesh-workspace)
4. [Layer 3 — Toolkits](#4-layer-3--toolkits)
5. [Current File Inventory](#5-current-file-inventory)
6. [Cross-Layer Dependencies (Current Problems)](#6-cross-layer-dependencies-current-problems)
7. [Extraction Plan](#7-extraction-plan)
8. [Target Directory Structure](#8-target-directory-structure)

---

## 1. Three-Layer Model

```
┌──────────────────────────────────────────────────────────────┐
│                       TOOLKITS (L3)                          │
│  Self-contained, OCI-packaged modules that plug into core    │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Studio   │ │  Editor  │ │ ImageGen │ │ Architect│        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Web Crawl │ │   OCR    │ │Audio2Txt │ │Video2Txt │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├──────────────────────────────────────────────────────────────┤
│                    MESH WORKSPACE (L2)                        │
│  Domain logic for multi-agent orchestration                  │
│                                                              │
│  Workspaces · Networks · Agents · Channels · Groups          │
│  Bridges · Messaging · Ecosystem · Identity (DID/SSI)        │
│  Agent Runtime · Autonomy · Governance                       │
├──────────────────────────────────────────────────────────────┤
│                     CORE PLATFORM (L1)                        │
│  Framework infrastructure — any app can build on this        │
│                                                              │
│  Commands · Jobs · Artifacts · Toolkit Registry              │
│  AI Service · Chat Interface · Auth · Theming · Config       │
│  Automations · Navigation · Persistence · PWA                │
└──────────────────────────────────────────────────────────────┘
```

**Dependency rule:** Each layer may only import from layers _below_ it.

| Import Direction | Allowed? | Example |
|-----------------|----------|---------|
| Toolkit → Core | ✅ | Studio commands import `CommandDefinition` |
| Toolkit → Mesh | ✅ | Architect commands import `generateMeshConfig` |
| Mesh → Core | ✅ | Agent CRUD uses `CommandRegistry` |
| Core → Mesh | ❌ | Breaks modularity |
| Core → Toolkit | ❌ | **Currently violated** (see §6) |
| Mesh → Toolkit | ❌ | Each toolkit should be optional |

---

## 2. Layer 1 — Core Platform

The core platform is the framework. It provides infrastructure that any toolkit or domain layer can use. It has **zero knowledge** of agents, networks, channels, or any specific toolkit like Studio.

### 2.1 Core Services

| System | Purpose | Current Files | Notes |
|--------|---------|--------------|-------|
| **Command Registry** | Register, discover, execute, dry-run typed commands | `services/commands/registry.ts`, `types.ts`, `tools.ts`, `dryRun.ts`, `commandErrors.ts`, `init.ts` | Framework — no domain commands |
| **Job Engine** | Headless serial/parallel job executor with conditions, bindings, deliverables | `services/jobs/executor.ts`, `services/jobs/seedCatalog.ts` | Pure engine — no domain jobs |
| **Toolkit Registry** | OCI-compliant 17-facet module system — register, query, pack, version | `services/toolkits/types.ts`, `registry.ts`, `index.ts` | The plugin runtime |
| **AI Service** | Multi-provider LLM chat, streaming, tool-use bridge, prompt builder | `services/ai/chat.ts`, `streaming.ts`, `providers.ts`, `models.ts`, `prompts.ts`, `generators.ts`, `index.ts` | **Has Studio leak — see §6** |
| **Automations Engine** | Declarative + code automations with runner & registry | `services/automations/types.ts`, `registry.ts`, `runner.ts`, `definitions/healthCheck.ts` | In-memory, no persistence |
| **Artifact System** | CRUD, tagging, `[[artifact:UUID]]` references | `services/commands/definitions/artifact.ts`, `utils/artifactRefs.ts` | Core data objects |
| **API Client** | HTTP client for backend communication | `api/client.ts` | Stateless |

### 2.2 Core Hooks

| Hook | Purpose | File |
|------|---------|------|
| `useJobs` | Job CRUD, queue, persistence | `hooks/useJobs.ts` |
| `useJobCatalog` | Seed + user-saved job catalog | `hooks/useJobCatalog.ts` |
| `useJobExecutor` | React-integrated job executor | `hooks/useJobExecutor.tsx` |
| `useLocalStorage` | Generic localStorage hook | `hooks/useLocalStorage.ts` |
| `useConversations` | Chat conversation management | `hooks/useConversations.ts` |
| `useChatResize` | Chat panel resize logic | `hooks/useChatResize.ts` |
| `useDeleteConfirm` | Confirmation dialog state | `hooks/useDeleteConfirm.ts` |
| `useBulkSelect` | Multi-select checkbox state | `hooks/useBulkSelect.ts` |
| `useRouteSync` | URL ↔ view state sync | `hooks/useRouteSync.ts` |
| `useDataManagement` | Import/export workspace data | `hooks/useDataManagement.ts` |
| `useNotebook` | Notebook logging system | `hooks/useNotebook.tsx` |
| `useWorkspaceManager` | Multi-workspace CRUD | `hooks/useWorkspaceManager.ts` |

### 2.3 Core Contexts

| Context | Purpose | File |
|---------|---------|------|
| `AuthContext` | Email/password + DID login | `context/AuthContext.tsx` |
| `ThemeContext` | Dark/light/solar themes | `context/ThemeContext.tsx` |
| `LLMContext` | Multi-provider LLM management | `context/LLMContext.tsx` + `llmModels.ts` + `llmProbes.ts` |
| `JobsContext` | Job state wrapper | `context/JobsContext.tsx` |
| `AutomationsContext` | Automation state wrapper | `context/AutomationsContext.tsx` |

### 2.4 Core Types

| File | Contents |
|------|----------|
| `types/index.ts` | Shared types: `Toolkit`, `ToolkitId`, `ToolkitCategory`, `ToolkitTool`, `ToolkitAgent`, `Role`, `RoleId`, `User`, `ViewId`, `NavContext`, `GovernanceModel`, `ChannelType`, `PromptTemplate`, `ScenarioPreset` |
| `types/jobs.ts` | `Job`, `JobDefinition`, `JobStep`, `JobArtifact`, `JobDeliverable`, `EntityInput`, `JobTrigger` |
| `types/llm.ts` | LLM provider types |

### 2.5 Core UI Components

| Category | Files | Purpose |
|----------|-------|---------|
| **Layout shell** | `layout/AuthenticatedApp.tsx`, `Header.tsx`, `Sidebar.tsx`, `Footer.tsx`, `ViewSwitcher.tsx`, `Breadcrumb.tsx` | App chrome |
| **Chat** | `layout/ChatPanel.tsx`, `chat/MessageBubble.tsx`, `chat/ActionCard.tsx`, `chat/JobProgressCard.tsx`, `chat/utils.ts`, `chat/types.ts` | AI chat interface |
| **Actions** | `actions/ActionManager.tsx`, `ActionsMonitor.tsx`, `MonitorStepTree.tsx`, `HistoryPanel.tsx`, `ActionLibrary.tsx`, `CommandsPanel.tsx`, `CommandCard.tsx`, `CommandCardModal.tsx`, `CommandPrompt.tsx`, `UnifiedBuilder.tsx`, `DryRunReport.tsx`, `AutomationsPanel.tsx`, `monitorUtils.tsx` | Command & job management |
| **Automations** | `automations/AutomationBuilder.tsx`, `AutomationCard.tsx`, `AutomationLogViewer.tsx`, `CommandArgInput.tsx` | Automation CRUD |
| **Activity** | `activity/ActivityFilter.tsx`, `ActivityItem.tsx`, `ActivityList.tsx`, `ComposePanel.tsx`, `utils.tsx` | Activity feed |
| **Artifacts** | `views/ArtifactsView.tsx`, `layout/ArtifactsPanel.tsx` | Artifact browser |
| **Settings** | `views/SettingsView.tsx`, `views/SystemView.tsx`, `layout/LLMManager.tsx`, `layout/ProfileModal.tsx` | Configuration UI |
| **Workspaces** | `layout/WorkspaceManager.tsx`, `WorkspaceManagerModal.tsx`, `WorkspaceCard.tsx` | Workspace management UI |
| **Toolkits** | `views/ToolKitsView.tsx`, `views/ToolkitDetailView.tsx` | Toolkit catalog & detail |
| **Login** | `views/LoginView.tsx` | Authentication UI |
| **Shared** | `shared/GradientIcon.tsx`, `CopyableId.tsx`, `DeleteConfirmInline.tsx`, `ErrorBoundary.tsx`, `GemAvatar.tsx`, `MarkdownContent.tsx`, `ui.tsx` | Reusable primitives |

### 2.6 Core CSS

| File | Scope |
|------|-------|
| `styles/design-tokens.css` | CSS custom properties |
| `styles/layout.css` | Grid & flex layout |
| `styles/mobile.css` | Responsive breakpoints |
| `styles/animations.css` | Keyframes |
| `styles/utilities.css` | Utility classes |
| `styles/theme-light.css` | Light theme |
| `styles/theme-solar.css` | Solar theme |
| `styles/components.css` | Barrel import |
| `styles/components/global.css` | Base styles |
| `styles/components/authenticated-app.css` | Shell |
| `styles/components/header.css` | Header |
| `styles/components/sidebar.css` | Sidebar |
| `styles/components/footer.css` | Footer |
| `styles/components/breadcrumb.css` | Breadcrumb |
| `styles/components/chat-panel.css` | Chat |
| `styles/components/message-bubble.css` | Messages |
| `styles/components/action-card.css` | Action cards |
| `styles/components/action-library.css` | Command library |
| `styles/components/action-manager.css` | Action manager |
| `styles/components/actions-monitor.css` | Monitor |
| `styles/components/history-panel.css` | Job history |
| `styles/components/command-*.css` | Command UI (4 files) |
| `styles/components/unified-builder.css` | Builder |
| `styles/components/dry-run-report.css` | Dry-run |
| `styles/components/automations*.css` | Automations (5 files) |
| `styles/components/activity*.css` | Activity (5 files) |
| `styles/components/artifacts*.css` | Artifacts (2 files) |
| `styles/components/toolkits.css` | Toolkit catalog |
| `styles/components/toolkit-detail.css` | Toolkit detail |
| `styles/components/settings.css` | Settings |
| `styles/components/system-view.css` | System view |
| `styles/components/llm-manager.css` | LLM management |
| `styles/components/login.css` | Login |
| `styles/components/workspace-*.css` | Workspace (3 files) |
| `styles/components/copyable-id.css` | Copyable ID |
| `styles/components/delete-confirm.css` | Confirm dialog |
| `styles/components/display-panel.css` | Display panel |
| `styles/components/error-boundary.css` | Error boundary |
| `styles/components/job-*.css` | Job UI (4 files) |
| `styles/components/profile*.css` | Profile (2 files) |
| `styles/components/compose-panel.css` | Compose |

### 2.7 Core Utilities

| File | Purpose |
|------|---------|
| `utils/crypto.ts` | Cryptographic helpers |
| `utils/json.ts` | JSON parse/stringify |
| `utils/secureStorage.ts` | Encrypted localStorage |
| `utils/jobRuntime.ts` | Job ref resolution, bindings, conditions |
| `utils/artifactRefs.ts` | `[[artifact:UUID]]` parser |

### 2.8 Core Entry Points

| File | Purpose |
|------|---------|
| `main.tsx` | App bootstrap, `initializeToolkits()` |
| `App.tsx` | Root providers (Auth, Theme) |
| `components/Main.tsx` | Provider composition, view router |
| `index.ts` | Barrel export |
| `pwa.ts` | Service worker registration |
| `vite-env.d.ts` | Vite type augmentation |

---

## 3. Layer 2 — Mesh Workspace

The mesh workspace is the domain layer for multi-agent orchestration. It depends on the Core Platform but knows nothing about specific toolkits.

### 3.1 Mesh Services

| System | Purpose | Files |
|--------|---------|-------|
| **Agent Runtime** | Agent lifecycle, message routing | `services/agentRuntime.ts` |
| **Autonomy Engine** | Task planning, delegation, consensus, ideation | `services/autonomy/planner.ts`, `delegation.ts`, `consensus.ts`, `ideation.ts`, `capability.ts`, `taskEngine.ts`, `taskChat.ts`, `index.ts` |
| **Credebl / SSI** | DID generation, verifiable credentials, email registration | `services/credebl.ts`, `services/credebl/agent.ts`, `auth.ts`, `connection.ts`, `credentials.ts`, `did.ts`, `emailRegistration.ts`, `emailValidation.ts`, `schema.ts`, `types.ts`, `verification.ts`, `index.ts` |

### 3.2 Mesh Hooks

| Hook | Purpose | File |
|------|---------|------|
| `useAgents` | Agent CRUD (Zustand) | `hooks/useAgents.ts` |
| `useChannels` | Channel CRUD (Zustand) | `hooks/useChannels.ts` |
| `useGroups` | Group CRUD (Zustand) | `hooks/useGroups.ts` |
| `useMessages` | Messaging (p2p, broadcast) | `hooks/useMessages.ts` |
| `useEcosystem` | Ecosystem state (networks, bridges) | `hooks/useEcosystem.ts` |
| `useArchitect` | Architect flow state (prompt → preview → deploy) | `hooks/useArchitect.ts` |
| `useCommandContext` | Wires CommandContext from all providers | `hooks/useCommandContext.ts` |

### 3.3 Mesh Contexts

| Context | Purpose | File |
|---------|---------|------|
| `WorkspaceContext` | Unified agents/channels/groups/messages state | `context/WorkspaceContext.tsx` |

### 3.4 Mesh Stores

| Store | Purpose | File |
|-------|---------|------|
| `ecosystemStore` | Networks, bridges, activeNetworkId (Zustand + localStorage) | `stores/ecosystemStore.ts` |
| `workspaceStore` | Workspace-level state (Zustand + localStorage) | `stores/workspaceStore.ts` |
| `stores/index.ts` | Store barrel exports | `stores/index.ts` |

### 3.5 Mesh Types

| File | Contents |
|------|----------|
| `types/mesh.ts` | `Agent`, `Network`, `Channel`, `Group`, `Bridge`, `MeshConfig`, `ChannelMode` |
| `types/agentRuntime.ts` | `AgentRuntimeState`, `AgentAutonomyConfig` |
| `types/autonomy.ts` | Task planning, delegation, consensus types |
| `types/aieos.ts` | `AieosEntity`, AIEOS identity standard |
| `types/ssi.ts` | SSI/DID credential types |

### 3.6 Mesh Command Definitions

| File | Commands | Notes |
|------|----------|-------|
| `definitions/agent.ts` | `create_agent`, `modify_agent`, `delete_agent`, `list_agents`, `get_agent` | Agent CRUD |
| `definitions/channel.ts` | `create_channel`, `delete_channel`, `list_channels` | Channel CRUD |
| `definitions/group.ts` | `create_group`, `delete_group`, `list_groups` | Group CRUD |
| `definitions/ecosystem.ts` | `create_network`, `save_ecosystem`, `load_ecosystem`, `delete_ecosystem` | Network/ecosystem ops |
| `definitions/topology.ts` | `create_bridge`, `delete_bridge` | Bridge management |
| `definitions/messaging.ts` | `send_message` | P2P messaging |
| `definitions/broadcast.ts` | `send_broadcast` | Group broadcast |
| `definitions/governance.ts` | `set_governance`, `start_vote`, `cast_vote` | Group governance |
| `definitions/modification.ts` | `update_agent_name`, `update_agent_prompt`, etc. | Entity modifications |
| `definitions/query.ts` | `find_agents`, `count_entities` | Entity queries |
| `definitions/maintenance.ts` | `reset_messages`, `cleanup_channels` | Maintenance ops |
| `definitions/system.ts` | `list_commands`, `help`, `export_workspace` | System utilities |
| `definitions/workspace.ts` | `create_workspace`, `switch_workspace`, etc. | Workspace management |
| `definitions/autonomy.ts` | `plan_task`, `delegate_task`, etc. | Autonomy commands |
| `definitions/architect.ts` | `architect` | AI mesh generation |

### 3.7 Mesh UI Components

| Category | Files | Purpose |
|----------|-------|---------|
| **Agents** | `views/AgentsView.tsx`, `AgentDetailView.tsx`, `AieosEditor.tsx`, `shared/AgentPortrait.tsx`, `AgentTradingCard.tsx`, `AgentRuntimePanel.tsx` | Agent management UI |
| **Channels** | `views/ChannelsView.tsx`, `ChannelDetailView.tsx` | Channel UI |
| **Groups** | `views/GroupsView.tsx`, `GroupDetailView.tsx`, `shared/GroupBadge.tsx`, `GroupTradingCard.tsx` | Group UI |
| **Networks** | `views/NetworksView.tsx`, `NetworkView.tsx`, `NetworkDetailView.tsx`, `networks/NetworkCard.tsx`, `BridgeBuilder.tsx`, `BridgeCard.tsx`, `CreateNetworkModal.tsx`, `TopologyPanel.tsx`, `networks/index.ts` | Network/topology UI |
| **Canvas** | `canvas/EcosystemCanvas.tsx`, `NetworkCanvas.tsx` | Visual topology |
| **Architect** | `views/ArchitectView.tsx`, `views/architect/ArchitectInput.tsx`, `ArchitectPreview.tsx`, `ArchitectDeploying.tsx`, `ArchitectDone.tsx`, `layout/ArchitectPopup.tsx`, `ArchitectPreview.tsx`, `ArchitectDone.tsx` | AI mesh builder |
| **Messages** | `views/MessagesView.tsx`, `chat/AgentChat.tsx` | Messaging UI |
| **Activity** | `views/ActivityView.tsx` | Activity view |
| **Profile** | `views/ProfileView.tsx` | Profile view |

### 3.8 Mesh CSS

| File | Scope |
|------|-------|
| `styles/components/agents.css` | Agents grid |
| `styles/components/agent-detail.css` | Agent detail |
| `styles/components/agent-chat.css` | Agent chat |
| `styles/components/agent-runtime.css` | Runtime panel |
| `styles/components/channels.css` | Channels |
| `styles/components/channel-detail.css` | Channel detail |
| `styles/components/groups.css` | Groups |
| `styles/components/group-detail.css` | Group detail |
| `styles/components/networks.css` | Networks |
| `styles/components/network-detail.css` | Network detail |
| `styles/components/network-view.css` | Network view |
| `styles/components/ecosystem.css` | Ecosystem UI |
| `styles/components/bridge-builder.css` | Bridge builder |
| `styles/components/create-network-modal.css` | Create network |
| `styles/components/architect.css` | Architect |
| `styles/components/architect-popup.css` | Architect popup |
| `styles/components/messages.css` | Messages |
| `styles/components/trading-card.css` | Agent/group cards |

### 3.9 Mesh Utilities

| File | Purpose |
|------|---------|
| `utils/identity.ts` | DID generation, keypair creation |
| `utils/aieos.ts` | AIEOS entity builder |

---

## 4. Layer 3 — Toolkits

Toolkits are self-contained, OCI-packaged modules. Each toolkit uses the 17-facet `ToolkitModule` interface and registers with `ToolkitRegistry`. They depend on Core (and optionally Mesh) — never the other way around.

### 4.1 Studio Toolkit

The visual job builder — the most complex toolkit. Currently deeply tangled with core.

| Category | Files | Purpose |
|----------|-------|---------|
| **Module** | `services/toolkits/builtins/studio.ts` | ToolkitModule definition (manifest, commands, tools, agents, jobs, automations, tasks, ui, logging, notifications, rbac, tests, docs) |
| **Bot Service** | `services/studioBot.ts` | Studio Bot AI assistant — layout analysis, step suggestions |
| **Commands** | `definitions/studio.ts`, `studio-lifecycle.ts`, `studio-resources.ts`, `studio-steps.ts` | 19 studio commands |
| **Context** | `context/StudioContext.tsx` | `StudioAPI` imperative interface, `StudioState`, provider |
| **View** | `views/StudioView.tsx` | Visual DAG canvas (~1023 lines) |
| **Canvas** | `jobs/JobCanvas.tsx`, `canvasConnectors.ts`, `canvasGeometry.ts`, `CommandRibbon.tsx`, `JobNode.tsx`, `NodeEditModal.tsx`, `NodeEditor.tsx`, `StepCardModal.tsx` | Canvas components |
| **Bot Panel** | `shared/StudioBotPanel.tsx` | Studio Bot interactive panel |
| **Types** | `types/studio.ts`, `types/studioBot.ts` | Studio-specific types |
| **Utilities** | `utils/studioApi.ts`, `studioDraft.ts`, `studioJobBuilder.ts` | Studio helpers |
| **CSS** | `styles/components/studio-bot.css`, `node-edit-modal.css`, `step-card-modal.css` | Studio styles |

**Extraction difficulty: HARD** — `CommandContext` has `studio?: StudioAPI` baked in, and core AI imports `shouldDelegateToStudioBot`.

### 4.2 Editor Toolkit

The multi-format document editor — cleanly separated.

| Category | Files | Purpose |
|----------|-------|---------|
| **Context** | `context/EditorContext.tsx` | `EditorAPI` imperative interface, provider |
| **View** | `views/EditorView.tsx` | Multi-format editor (~1001 lines) |
| **CSS** | `styles/components/editor.css` | Editor styles |

**Extraction difficulty: EASY** — no core or mesh dependencies on Editor.

### 4.3 Image Generation Toolkit

Portrait generation for agents using AI image services.

| Category | Files | Purpose |
|----------|-------|---------|
| **Module** | `services/toolkits/builtins/image-gen.ts` | ToolkitModule definition |
| **Service** | `services/imageGen.ts` | Image generation API (Gemini) |
| **Cache** | `services/portraitCache.ts` | LRU portrait cache |
| **Commands** | `definitions/imageGen.ts` | `generate_portrait`, `clear_portrait_cache` |
| **Shared** | `shared/AgentPortrait.tsx` | Portrait display component |

**Extraction difficulty: EASY** — self-contained, clean dependencies.

### 4.4 Architect Toolkit

AI-powered mesh network designer. Depends on Mesh layer (generates networks/agents).

| Category | Files | Purpose |
|----------|-------|---------|
| **Hook** | `hooks/useArchitect.ts` | Architect flow state (prompt → preview → deploy) |
| **AI Generator** | `services/ai/generators.ts` | `generateMeshConfig()` |
| **Commands** | `definitions/architect.ts` | `architect` command |
| **View** | `views/ArchitectView.tsx`, `architect/ArchitectInput.tsx`, `ArchitectPreview.tsx`, `ArchitectDeploying.tsx`, `ArchitectDone.tsx` | Multi-step build wizard |
| **Layout** | `layout/ArchitectPopup.tsx`, `ArchitectPreview.tsx`, `ArchitectDone.tsx` | Popup/overlay variants |
| **Bot Panel** | `shared/ArchitectBotPanel.tsx` | Architect Bot interactive panel |
| **CSS** | `styles/components/architect.css`, `architect-popup.css`, `architect-bot.css` | Architect styles |

**Extraction difficulty: MEDIUM** — depends on Mesh (networks, agents) and Core AI. The mesh generator in `services/ai/generators.ts` is shared, would need to be exposed as a Core AI capability.

### 4.5 Web Crawler Toolkit

Web page fetching and site crawling.

| Category | Files | Purpose |
|----------|-------|---------|
| **Module** | `services/toolkits/builtins/web-crawler.ts` | ToolkitModule definition |

**Extraction difficulty: TRIVIAL** — already a pure module definition, no external files.

### 4.6 OCR / Audio-to-Text / Video-to-Text Toolkits

Capability toolkits — currently module definitions only.

| Toolkit | Module File | Status |
|---------|------------|--------|
| OCR | `builtins/ocr.ts` | Definition only — no implementation |
| Audio-to-Text | `builtins/audio-to-text.ts` | Definition only |
| Video-to-Text | `builtins/video-to-text.ts` | Definition only |

### 4.7 Built-in Toolkit Modules (Non-Extractable)

These are "meta-toolkits" that organize core and mesh commands into discoverable groups. They stay as built-in modules but don't need their own code — they just reference commands/tools/agents defined elsewhere.

| Module | File | Contains |
|--------|------|----------|
| Agent Management | `builtins/agent-management.ts` | Groups mesh agent commands |
| Infrastructure | `builtins/infrastructure.ts` | Groups mesh channel/group commands |
| Ecosystem | `builtins/ecosystem.ts` | Groups mesh network/bridge commands |
| Autonomy | `builtins/autonomy.ts` | Groups mesh autonomy commands |
| Artifacts | `builtins/artifacts.ts` | Groups core artifact commands |
| Jobs | `builtins/jobs.ts` | Groups core job commands |
| Workspace Mgmt | `builtins/workspace-mgmt.ts` | Groups core workspace commands |

---

## 5. Current File Inventory

### 5.1 Summary

| Layer | TypeScript Files | CSS Files | % of Codebase |
|-------|-----------------|-----------|---------------|
| **Core** | ~95 | ~42 | ~50% |
| **Mesh** | ~60 | ~18 | ~35% |
| **Toolkits** (all) | ~35 | ~5 | ~15% |
| **Total** | ~190 | ~65 | — |

### 5.2 Detailed Breakdown — TypeScript/TSX

#### Core Platform (~95 files)

```
src/main.tsx                                    # Bootstrap
src/App.tsx                                     # Root
src/index.ts                                    # Barrel
src/pwa.ts                                      # PWA
src/vite-env.d.ts                               # Vite types
src/api/client.ts                               # HTTP client
src/types/index.ts                              # Shared types
src/types/jobs.ts                               # Job types
src/types/llm.ts                                # LLM types
src/constants/index.tsx                         # Constants
src/services/commands/registry.ts               # Command registry
src/services/commands/types.ts                  # Command types ⚠️ imports StudioAPI
src/services/commands/tools.ts                  # Tool-use bridge
src/services/commands/dryRun.ts                 # Dry-run engine
src/services/commands/commandErrors.ts          # Error catalog
src/services/commands/init.ts                   # Bootstrap
src/services/commands/definitions/artifact.ts   # Artifact commands
src/services/commands/definitions/jobs.ts       # Job commands
src/services/commands/definitions/system.ts     # System commands
src/services/commands/definitions/toolkit.ts    # Toolkit commands
src/services/commands/definitions/workspace.ts  # Workspace commands
src/services/jobs/executor.ts                   # Job executor
src/services/jobs/seedCatalog.ts                # Seed jobs
src/services/ai/chat.ts                         # AI chat ⚠️ imports studioBot
src/services/ai/streaming.ts                    # Streaming ⚠️ imports studioBot
src/services/ai/providers.ts                    # LLM providers
src/services/ai/models.ts                       # Model defs
src/services/ai/prompts.ts                      # Prompt builder
src/services/ai/generators.ts                   # AI generators
src/services/ai/index.ts                        # Barrel
src/services/automations/types.ts               # Automation types
src/services/automations/registry.ts            # Automation registry
src/services/automations/runner.ts              # Automation runner
src/services/automations/definitions/healthCheck.ts # Built-in automation
src/services/toolkits/types.ts                  # 17-facet OCI types
src/services/toolkits/registry.ts               # Toolkit registry
src/services/toolkits/index.ts                  # Singleton + exports
src/services/toolkits/builtins/index.ts         # Built-in barrel
src/services/toolkits/builtins/artifacts.ts     # Meta-module
src/services/toolkits/builtins/jobs.ts          # Meta-module
src/services/toolkits/builtins/workspace-mgmt.ts # Meta-module
src/context/AuthContext.tsx                     # Auth
src/context/ThemeContext.tsx                    # Theming
src/context/LLMContext.tsx                      # LLM management
src/context/llmModels.ts                        # Model definitions
src/context/llmProbes.ts                        # Provider probes
src/context/JobsContext.tsx                     # Jobs
src/context/AutomationsContext.tsx              # Automations
src/hooks/useJobs.ts                            # Job state
src/hooks/useJobCatalog.ts                      # Job catalog
src/hooks/useJobExecutor.tsx                    # Job executor hook
src/hooks/useLocalStorage.ts                    # localStorage
src/hooks/useConversations.ts                   # Chat conversations
src/hooks/useChatResize.ts                      # Chat resize
src/hooks/useDeleteConfirm.ts                   # Confirm dialog
src/hooks/useBulkSelect.ts                      # Multi-select
src/hooks/useRouteSync.ts                       # URL sync
src/hooks/useDataManagement.ts                  # Data import/export
src/hooks/useNotebook.tsx                       # Notebook logger
src/hooks/useWorkspaceManager.ts                # Workspace CRUD
src/hooks/useCommandContext.ts                  # Command context wiring ⚠️ imports Studio
src/utils/crypto.ts                             # Crypto
src/utils/json.ts                               # JSON
src/utils/secureStorage.ts                      # Secure storage
src/utils/jobRuntime.ts                         # Job utilities
src/utils/artifactRefs.ts                       # Artifact refs
src/components/Main.tsx                         # Provider root ⚠️ imports Studio/Editor
src/components/layout/AuthenticatedApp.tsx      # App shell
src/components/layout/Header.tsx                # Header
src/components/layout/Sidebar.tsx               # Sidebar
src/components/layout/Footer.tsx                # Footer
src/components/layout/ViewSwitcher.tsx          # View router
src/components/layout/Breadcrumb.tsx            # Breadcrumb
src/components/layout/ChatPanel.tsx             # Chat panel
src/components/layout/DisplayPanel.tsx          # Display panel
src/components/layout/ArtifactsPanel.tsx        # Artifacts panel
src/components/layout/LLMManager.tsx            # LLM manager
src/components/layout/ProfileModal.tsx          # Profile modal
src/components/layout/WorkspaceManager.tsx      # Workspace manager
src/components/layout/WorkspaceManagerModal.tsx # Workspace modal
src/components/layout/WorkspaceCard.tsx         # Workspace card
src/components/actions/*.tsx                    # Action components (14 files)
src/components/automations/*.tsx                # Automation components (4 files)
src/components/activity/*.tsx                   # Activity components (5 files)
src/components/views/ArtifactsView.tsx          # Artifacts view
src/components/views/AutomationsView.tsx        # Automations view
src/components/views/SettingsView.tsx           # Settings
src/components/views/SystemView.tsx             # System monitor
src/components/views/ToolKitsView.tsx           # Toolkit catalog
src/components/views/ToolkitDetailView.tsx      # Toolkit detail
src/components/views/LoginView.tsx              # Login
src/components/shared/GradientIcon.tsx          # Icon component
src/components/shared/CopyableId.tsx            # Copyable ID
src/components/shared/DeleteConfirmInline.tsx   # Confirm inline
src/components/shared/ErrorBoundary.tsx         # Error boundary
src/components/shared/GemAvatar.tsx             # Avatar
src/components/shared/MarkdownContent.tsx       # Markdown
src/components/shared/ui.tsx                    # UI primitives
```

#### Mesh Workspace (~60 files)

```
src/types/mesh.ts                               # Mesh types
src/types/agentRuntime.ts                       # Runtime types
src/types/autonomy.ts                           # Autonomy types
src/types/aieos.ts                              # AIEOS types
src/types/ssi.ts                                # SSI types
src/services/agentRuntime.ts                    # Agent runtime
src/services/autonomy/*.ts                      # Autonomy engine (8 files)
src/services/credebl*.ts                        # SSI/DID (12 files)
src/services/commands/definitions/agent.ts      # Agent commands
src/services/commands/definitions/channel.ts    # Channel commands
src/services/commands/definitions/group.ts      # Group commands
src/services/commands/definitions/ecosystem.ts  # Ecosystem commands
src/services/commands/definitions/topology.ts   # Bridge commands
src/services/commands/definitions/messaging.ts  # Messaging commands
src/services/commands/definitions/broadcast.ts  # Broadcast commands
src/services/commands/definitions/governance.ts # Governance commands
src/services/commands/definitions/modification.ts # Modification commands
src/services/commands/definitions/query.ts      # Query commands
src/services/commands/definitions/maintenance.ts # Maintenance commands
src/services/commands/definitions/autonomy.ts   # Autonomy commands
src/services/commands/definitions/architect.ts  # Architect commands
src/services/toolkits/builtins/agent-management.ts # Agent meta-module
src/services/toolkits/builtins/infrastructure.ts   # Infra meta-module
src/services/toolkits/builtins/ecosystem.ts        # Ecosystem meta-module
src/services/toolkits/builtins/autonomy.ts         # Autonomy meta-module
src/context/WorkspaceContext.tsx                 # Workspace context
src/hooks/useAgents.ts                          # Agent CRUD
src/hooks/useChannels.ts                        # Channel CRUD
src/hooks/useGroups.ts                          # Group CRUD
src/hooks/useMessages.ts                        # Messaging
src/hooks/useEcosystem.ts                       # Ecosystem state
src/hooks/useArchitect.ts                       # Architect flow
src/stores/ecosystemStore.ts                    # Ecosystem store
src/stores/workspaceStore.ts                    # Workspace store
src/stores/index.ts                             # Store barrel
src/utils/identity.ts                           # DID/keypair
src/utils/aieos.ts                              # AIEOS entities
src/components/views/AgentsView.tsx             # Agents view
src/components/views/AgentDetailView.tsx        # Agent detail
src/components/views/AieosEditor.tsx            # AIEOS editor
src/components/views/ChannelsView.tsx           # Channels view
src/components/views/ChannelDetailView.tsx      # Channel detail
src/components/views/GroupsView.tsx             # Groups view
src/components/views/GroupDetailView.tsx        # Group detail
src/components/views/NetworksView.tsx           # Networks view
src/components/views/NetworkView.tsx            # Network view
src/components/views/NetworkDetailView.tsx      # Network detail
src/components/views/networks/*.tsx             # Network components (6 files)
src/components/views/MessagesView.tsx           # Messages view
src/components/views/ActivityView.tsx           # Activity view
src/components/views/ProfileView.tsx            # Profile view
src/components/canvas/EcosystemCanvas.tsx       # Ecosystem canvas
src/components/canvas/NetworkCanvas.tsx         # Network canvas
src/components/chat/AgentChat.tsx               # Agent chat
src/components/shared/AgentPortrait.tsx         # Agent portrait
src/components/shared/AgentTradingCard.tsx      # Agent card
src/components/shared/AgentRuntimePanel.tsx     # Runtime panel
src/components/shared/GroupBadge.tsx            # Group badge
src/components/shared/GroupTradingCard.tsx       # Group card
src/components/layout/ArchitectPopup.tsx        # Architect popup
src/components/layout/ArchitectPreview.tsx      # Architect preview
src/components/layout/ArchitectDone.tsx         # Architect done
```

#### Toolkits (~35 files)

```
# ── Studio ──
src/services/toolkits/builtins/studio.ts        # Module definition
src/services/studioBot.ts                       # Bot service
src/services/commands/definitions/studio.ts     # Command barrel
src/services/commands/definitions/studio-lifecycle.ts # Lifecycle commands
src/services/commands/definitions/studio-resources.ts # Resource commands
src/services/commands/definitions/studio-steps.ts     # Step commands
src/context/StudioContext.tsx                    # Studio context
src/components/views/StudioView.tsx             # Studio view
src/components/jobs/JobCanvas.tsx               # Canvas
src/components/jobs/canvasConnectors.ts         # Connectors
src/components/jobs/canvasGeometry.ts           # Geometry
src/components/jobs/CommandRibbon.tsx            # Ribbon
src/components/jobs/JobCatalog.tsx              # Catalog
src/components/jobs/JobInputPromptModal.tsx     # Input modal
src/components/jobs/JobNode.tsx                 # Node
src/components/jobs/NodeEditModal.tsx           # Edit modal
src/components/jobs/NodeEditor.tsx              # Editor
src/components/jobs/StepCardModal.tsx           # Step card
src/components/shared/StudioBotPanel.tsx        # Bot panel
src/types/studio.ts                             # Studio types
src/types/studioBot.ts                          # Bot types
src/utils/studioApi.ts                          # API helpers
src/utils/studioDraft.ts                        # Draft persistence
src/utils/studioJobBuilder.ts                   # Job builder

# ── Editor ──
src/context/EditorContext.tsx                   # Editor context
src/components/views/EditorView.tsx             # Editor view

# ── Image Generation ──
src/services/toolkits/builtins/image-gen.ts     # Module definition
src/services/imageGen.ts                        # Image gen service
src/services/portraitCache.ts                   # Portrait cache
src/services/commands/definitions/imageGen.ts   # ImageGen commands

# ── Architect ──
src/components/views/ArchitectView.tsx          # Architect view
src/components/views/architect/*.tsx            # Architect sub-views (4 files)
src/components/shared/ArchitectBotPanel.tsx     # Bot panel

# ── Web Crawler / OCR / Audio / Video ──
src/services/toolkits/builtins/web-crawler.ts   # Module definition
src/services/toolkits/builtins/ocr.ts           # Module definition
src/services/toolkits/builtins/audio-to-text.ts # Module definition
src/services/toolkits/builtins/video-to-text.ts # Module definition
```

---

## 6. Cross-Layer Dependencies (Current Problems)

### 6.1 Critical: Core → Toolkit (Studio) Leaks

These are the violations where the Core Platform directly depends on the Studio Toolkit, breaking the layer model:

| # | File (Core) | Imports From (Toolkit) | Impact |
|---|------------|----------------------|--------|
| **C1** | `services/commands/types.ts` | `StudioAPI` from `context/StudioContext` | **Every command definition** transitively depends on Studio |
| **C2** | `services/ai/chat.ts` | `shouldDelegateToStudioBot` from `services/studioBot` | Core AI knows about Studio Bot |
| **C3** | `services/ai/streaming.ts` | `shouldDelegateToStudioBot` from `services/studioBot` | Core streaming knows about Studio Bot |
| **C4** | `hooks/useCommandContext.ts` | `useStudioContext` from `context/StudioContext` | Command wiring depends on Studio |
| **C5** | `components/Main.tsx` | `StudioProvider`, `EditorProvider` | Provider root hardcodes toolkit providers |

### 6.2 Medium: Service → Component Direction Violation

| # | File (Service) | Imports From (Component) | Impact |
|---|---------------|-------------------------|--------|
| **D1** | `services/studioBot.ts` | `canvasGeometry.ts` from `components/jobs/` | Service depends on component-layer constants |

### 6.3 How to Fix

| Problem | Solution | Complexity |
|---------|----------|------------|
| **C1** `CommandContext.studio` | Replace `studio?: StudioAPI` with `extensions?: Record<string, unknown>`. Toolkits inject themselves at registration. Studio injects its API via `ctx.extensions.studio`. | Medium |
| **C2/C3** `shouldDelegateToStudioBot` | Make the AI service delegate check pluggable: `chatService.registerDelegation(predicate, handler)`. Studio toolkit registers its delegation on init. | Medium |
| **C4** `useCommandContext` | After C1, this hook no longer needs `useStudioContext`. It reads from `extensions` map. | Easy (follows C1) |
| **C5** Provider composition | `Main.tsx` should discover providers via `toolkitRegistry.getProviders()` or a dynamic provider system. | Medium |
| **D1** Canvas constants | Move `NODE_WIDTH`/`NODE_HEIGHT` from the component into `types/studio.ts` or a shared constants file. | Easy |

---

## 7. Extraction Plan

### Phase 1: Decouple Core from Studio (prerequisite for all else)

1. Replace `CommandContext.studio?: StudioAPI` with `CommandContext.extensions?: Record<string, unknown>`
2. Make AI delegation pluggable — `chatService.registerDelegate(check, handler)`
3. Move canvas geometry constants to `types/studio.ts`
4. Remove all direct Studio imports from Core files

### Phase 2: Extract Editor Toolkit (easy win)

1. Create `src/toolkits/editor/` directory
2. Move `EditorContext.tsx`, `EditorView.tsx`, `editor.css`
3. Create `EditorToolkitModule` with proper manifest, commands, ui contributions
4. Register via `toolkitRegistry` — remove hardcoded `EditorProvider` from `Main.tsx`

### Phase 3: Extract Image Generation Toolkit (easy win)

1. Create `src/toolkits/image-gen/` directory
2. Move `imageGen.ts`, `portraitCache.ts`, `definitions/imageGen.ts`, `image-gen.ts` module
3. The `AgentPortrait` component stays in Mesh (it's the consumer, not the toolkit)

### Phase 4: Extract Studio Toolkit (hard — after Phase 1)

1. Create `src/toolkits/studio/` directory
2. Move all 24+ Studio files
3. Studio registers its `StudioAPI` into `CommandContext.extensions.studio` on init
4. Studio registers its delegation check with the AI service on init
5. Studio provides its `StudioProvider` via toolkit's provider contribution
6. All core imports of Studio vanish

### Phase 5: Extract Architect Toolkit (medium)

1. Create `src/toolkits/architect/` directory
2. Move Architect views, hook, bot panel, CSS
3. `generateMeshConfig` moves from `services/ai/generators.ts` into the Architect toolkit
4. Architect registers its architect command and delegation with Core

### Phase 6: Wire Toolkit Discovery (complete the loop)

1. `Main.tsx` dynamically discovers toolkit providers
2. `ViewSwitcher` dynamically discovers toolkit views from UI contributions
3. `Sidebar` dynamically discovers toolkit menu items from UI contributions
4. Toolkit CSS is loaded on-demand when a toolkit activates

---

## 8. Target Directory Structure

```
src/
├── core/                           # Layer 1: Core Platform
│   ├── commands/                   # Command registry, types, tools bridge
│   │   ├── registry.ts
│   │   ├── types.ts               # CommandContext with extensions map (no Studio)
│   │   ├── tools.ts
│   │   ├── dryRun.ts
│   │   └── errors.ts
│   ├── jobs/                       # Job engine
│   │   ├── executor.ts
│   │   ├── types.ts
│   │   └── seedCatalog.ts
│   ├── toolkits/                   # Toolkit/plugin runtime
│   │   ├── types.ts               # 17-facet OCI types
│   │   ├── registry.ts            # ToolkitRegistry
│   │   └── index.ts
│   ├── ai/                         # AI service (no toolkit-specific logic)
│   │   ├── chat.ts
│   │   ├── streaming.ts
│   │   ├── providers.ts
│   │   ├── models.ts
│   │   ├── prompts.ts
│   │   └── index.ts
│   ├── automations/                # Automation engine
│   ├── artifacts/                  # Artifact CRUD
│   ├── api/                        # HTTP client
│   ├── auth/                       # Authentication
│   ├── types/                      # Core types (jobs, llm, toolkit)
│   ├── hooks/                      # Core hooks
│   ├── contexts/                   # Core contexts
│   ├── utils/                      # Core utilities
│   ├── components/                 # Core UI
│   │   ├── layout/                 # Shell (header, sidebar, footer)
│   │   ├── chat/                   # Chat interface
│   │   ├── actions/                # Action manager
│   │   ├── artifacts/              # Artifact browser
│   │   ├── settings/               # Settings
│   │   ├── shared/                 # Reusable primitives
│   │   └── toolkits/               # Toolkit catalog
│   └── styles/                     # Core CSS
│
├── mesh/                           # Layer 2: Mesh Workspace
│   ├── agents/                     # Agent CRUD, runtime, portrait
│   ├── channels/                   # Channel CRUD
│   ├── groups/                     # Group CRUD, governance
│   ├── networks/                   # Network, bridge, topology
│   ├── ecosystem/                  # Ecosystem state, canvas
│   ├── messaging/                  # P2P, broadcast
│   ├── autonomy/                   # Task planning, delegation, consensus
│   ├── identity/                   # DID, SSI, AIEOS, Credebl
│   ├── architect/                  # AI mesh generation (core architect)
│   ├── types/                      # Mesh types
│   ├── stores/                     # Zustand stores
│   ├── hooks/                      # Mesh hooks
│   ├── commands/                   # Mesh command definitions
│   ├── components/                 # Mesh UI views
│   └── styles/                     # Mesh CSS
│
├── toolkits/                       # Layer 3: Self-contained toolkits
│   ├── studio/                     # Visual job builder
│   │   ├── module.ts              # ToolkitModule definition
│   │   ├── bot.ts                 # Studio Bot service
│   │   ├── context.tsx            # StudioContext
│   │   ├── commands/              # 19 studio commands
│   │   ├── components/            # StudioView, canvas, nodes
│   │   ├── types/                 # Studio types
│   │   ├── utils/                 # Draft, API, builder
│   │   └── styles/                # Studio CSS
│   │
│   ├── editor/                     # Document editor
│   │   ├── module.ts              # ToolkitModule definition
│   │   ├── context.tsx            # EditorContext
│   │   ├── components/            # EditorView
│   │   └── styles/
│   │
│   ├── image-gen/                  # Image generation
│   │   ├── module.ts              # ToolkitModule definition
│   │   ├── service.ts             # Gemini image gen
│   │   ├── cache.ts               # Portrait cache
│   │   ├── commands/              # generate_portrait, clear_cache
│   │   └── components/
│   │
│   ├── architect/                  # AI mesh designer
│   │   ├── module.ts              # ToolkitModule definition
│   │   ├── generator.ts           # generateMeshConfig
│   │   ├── hook.ts                # useArchitect
│   │   ├── commands/              # architect command
│   │   ├── components/            # Architect views, bot panel
│   │   └── styles/
│   │
│   ├── web-crawler/                # Web crawler
│   │   └── module.ts              # ToolkitModule definition
│   │
│   ├── ocr/                        # OCR
│   │   └── module.ts
│   │
│   ├── audio-to-text/              # Audio transcription
│   │   └── module.ts
│   │
│   └── video-to-text/              # Video transcription
│       └── module.ts
│
└── index.ts                        # App entry
```

---

## Appendix: Counts by Category

### Command Definitions

| Layer | Command Files | ~Commands |
|-------|--------------|-----------|
| Core | `artifact.ts`, `jobs.ts`, `system.ts`, `toolkit.ts`, `workspace.ts` | ~15 |
| Mesh | `agent.ts`, `channel.ts`, `group.ts`, `ecosystem.ts`, `topology.ts`, `messaging.ts`, `broadcast.ts`, `governance.ts`, `modification.ts`, `query.ts`, `maintenance.ts`, `autonomy.ts`, `architect.ts` | ~50 |
| Toolkit: Studio | `studio.ts`, `studio-lifecycle.ts`, `studio-resources.ts`, `studio-steps.ts` | ~19 |
| Toolkit: ImageGen | `imageGen.ts` | ~2 |
| **Total** | 23 files | ~86 |

### Hooks

| Layer | Hooks | Count |
|-------|-------|-------|
| Core | `useJobs`, `useJobCatalog`, `useJobExecutor`, `useLocalStorage`, `useConversations`, `useChatResize`, `useDeleteConfirm`, `useBulkSelect`, `useRouteSync`, `useDataManagement`, `useNotebook`, `useWorkspaceManager` | 12 |
| Mesh | `useAgents`, `useChannels`, `useGroups`, `useMessages`, `useEcosystem`, `useArchitect`, `useCommandContext` | 7 |
| **Total** | | 19 |

### Contexts

| Layer | Contexts | Count |
|-------|----------|-------|
| Core | `AuthContext`, `ThemeContext`, `LLMContext`, `JobsContext`, `AutomationsContext` | 5 |
| Mesh | `WorkspaceContext` | 1 |
| Toolkit | `StudioContext`, `EditorContext` | 2 |
| **Total** | | 8 |

### CSS Files

| Layer | Files | Count |
|-------|-------|-------|
| Core | Design tokens, layout, themes, shell, chat, actions, automations, activity, artifacts, settings, toolkits, jobs, workspace, login, shared | ~42 |
| Mesh | agents, channels, groups, networks, ecosystem, architect, messages, trading-card | ~18 |
| Toolkit | studio-bot, node-edit-modal, step-card-modal, editor, architect-bot | ~5 |
| **Total** | | ~65 |

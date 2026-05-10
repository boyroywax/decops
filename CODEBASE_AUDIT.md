# Decops Codebase Audit — CORE / MESH / TOOLKIT Classification

**Date:** 2026-03-09  
**Scope:** Every `.ts`, `.tsx`, and `.css` file under `src/`

---

## Legend

| Tag | Meaning |
|---|---|
| **CORE** | Platform infrastructure — commands framework, job engine, toolkit registry, artifact system, AI service, persistence, auth, theming, config, navigation, PWA |
| **MESH** | Workspace domain logic — ecosystems, networks, agents, channels, groups, bridges, messaging, DID/SSI, agent runtime, governance, autonomy |
| **TOOLKIT** | Should be extracted into a self-contained toolkit module — Studio, Editor, Image Gen, Web Crawler, OCR, Audio-to-Text, Video-to-Text, Architect bot logic |

---

## 1. Entry Points & App Shell

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `src/main.tsx` | **CORE** | Bootstrap: renders root, calls `initializeToolkits()`, registers PWA | toolkits, App |
| `src/App.tsx` | **CORE** | Root provider tree (Theme, Auth, Main) | AuthContext, ThemeContext |
| `src/index.ts` | **CORE** | Barrel re-export of App | App |
| `src/pwa.ts` | **CORE** | Service-worker registration (Vite PWA plugin) | none |
| `src/vite-env.d.ts` | **CORE** | Vite ambient types | none |
| `src/index.css` | **CORE** | Root CSS reset/vars | none |
| `src/components/Main.tsx` | **CORE** | Provider composition (Jobs, Workspace, Automations, Studio, Editor, LLM); auth gate | all contexts |

---

## 2. Types (`src/types/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `types/index.ts` | **CORE+MESH** | Master barrel — exports CORE types (ViewId, NavContext, Toolkit*, Job*, Workspace, User, Auth) **and** MESH types (Agent, Channel, Group, Network, Ecosystem, Bridge, Message, Role, Governance). This file should ideally be split. | aieos, mesh, jobs, agentRuntime, ssi |
| `types/jobs.ts` | **CORE** | Job, JobStep, JobDefinition, JobArtifact, JobTrigger, StepHandler — generic execution engine types | none |
| `types/llm.ts` | **CORE** | LLM provider/model types, context interface | none |
| `types/mesh.ts` | **MESH** | MeshConfig, MeshConfigAgent, MeshConfigChannel — network blueprint shapes | none |
| `types/aieos.ts` | **MESH** | AIEOS entity spec — agent identity, personality, skills, presence | none |
| `types/agentRuntime.ts` | **MESH** | Agent runtime status, autonomy config, inbox, lifecycle, OpenRouter-format messages | none |
| `types/autonomy.ts` | **MESH** | AgentTask, TaskPlan, PlannedAction, DelegationTarget, ConsensusProposal, EscalationLevel | jobs (import JobDefinition) |
| `types/ssi.ts` | **MESH** | DID documents, verifiable credentials, proof requests, schemas — SSI/Credebl types | none |
| `types/studio.ts` | **TOOLKIT (Studio)** | StudioStep, OutputMapping, InputBinding, ParallelGroup sentinel, canvas layout constants | jobs (StepHandler) |
| `types/studioBot.ts` | **TOOLKIT (Studio)** | StudioBotPlan, StudioBotOperation, StudioBotConfig, LayoutAnalysis | none |

---

## 3. Services

### 3a. AI Services (`src/services/ai/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `services/ai/index.ts` | **CORE** | Barrel re-export of AI subsystem | all ai/* |
| `services/ai/providers.ts` | **CORE** | Multi-provider request/response builders (Anthropic, OpenAI, Google, Ollama, OpenRouter), API key helpers, tool-use parsing | none |
| `services/ai/models.ts` | **CORE** | Model selection from localStorage, per-agent/command/group overrides | providers |
| `services/ai/streaming.ts` | **CORE** | SSE stream parser for Anthropic; streaming chat with tool-use loop | providers, tools, prompts, **studioBot** (TOOLKIT cross-dep) |
| `services/ai/chat.ts` | **CORE** | `callAgentAI`, `chatWithAgent`, `chatWithWorkspace` — core chat functions | providers, prompts, models, tools, **studioBot** (TOOLKIT cross-dep) |
| `services/ai/prompts.ts` | **CORE+MESH** | `buildWorkspaceSystemPrompt` — constructs system prompt using workspace entities (agents, channels, networks, etc.) | MESH types (Agent, Channel, etc.) |
| `services/ai/generators.ts` | **MESH** | `generateMeshConfig`, `generateAieosEntity` — mesh-specific AI generation | providers, models, json utils |

### 3b. Commands Framework (`src/services/commands/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `services/commands/types.ts` | **CORE** | CommandDefinition, CommandArg, CommandContext — framework types | types (RoleId, JobRequest), **StudioAPI** (TOOLKIT cross-dep) |
| `services/commands/registry.ts` | **CORE** | CommandRegistry — register/get/execute commands, entity name resolution, dry-run | dryRun, types |
| `services/commands/commandErrors.ts` | **CORE** | Error catalog per command ID — used by DryRun and CommandCardModal | none |
| `services/commands/dryRun.ts` | **CORE** | Dry-run engine — validates commands/jobs without executing | types, commandErrors, jobRuntime |
| `services/commands/tools.ts` | **CORE** | Tool-use bridge — converts CommandDefinitions → Anthropic tool schemas, executes tool calls as jobs | registry, types |
| `services/commands/init.ts` | **CORE** | Legacy initializer — delegates to `initializeToolkits()` | toolkits |

### 3c. Command Definitions (`src/services/commands/definitions/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `definitions/agent.ts` | **MESH** | `create_agent`, `ping_agent` — creates agents with DID/keypair/AIEOS | identity, aieos, constants |
| `definitions/channel.ts` | **MESH** | `create_channel`, `edit_channel` — manages p2p communication channels | types |
| `definitions/group.ts` | **MESH** | `create_group` — creates governance groups with DID | identity, constants |
| `definitions/messaging.ts` | **MESH** | `send_message` — agent-to-agent messaging via AI | ai/chat |
| `definitions/broadcast.ts` | **MESH** | `broadcast_message` — group-wide messaging | ai/chat |
| `definitions/modification.ts` | **MESH** | `delete_agent`, `update_agent_prompt`, `delete_channel`, `edit_channel`, `delete_group`, `toggle_group_member` — CRUD for mesh entities | types |
| `definitions/query.ts` | **MESH** | `list_agents`, `list_groups`, `list_channels`, `list_messages` — read-only queries | types |
| `definitions/ecosystem.ts` | **MESH** | `create_network`, `update_network`, `destroy_network`, `list_networks` — multi-network management | ai generators, identity, aieos, constants |
| `definitions/topology.ts` | **MESH** | `create_bridge`, `delete_bridge`, `print_topology` — cross-network bridges | types |
| `definitions/governance.ts` | **MESH** | `group_decide` — AI-powered group decision-making | ai (getGroupModel) |
| `definitions/autonomy.ts` | **MESH** | `assign_task`, `delegate_task`, `escalate_task`, `task_status`, `list_tasks`, `group_ideate`, `propose_agent`, `execute_proposal` — autonomous agent commands | autonomy service |
| `definitions/architect.ts` | **MESH** | `prompt_architect`, `deploy_network` — AI Architect mesh generation + deployment | ai generators |
| `definitions/maintenance.ts` | **CORE** | `reset_workspace`, `bulk_delete` — workspace-level operations | types |
| `definitions/artifact.ts` | **CORE** | `create_artifact`, `edit_artifact`, `tag_artifact`, `delete_artifact`, `list_artifacts`, `search_artifacts`, `export_artifact` — artifact CRUD | types |
| `definitions/jobs.ts` | **CORE** | `queue_new_job`, `pause_queue`, `resume_queue`, `delete_queued_job`, `list_queue`, `list_catalog_jobs`, `save_job_definition`, `delete_job_definition` — job queue management | types |
| `definitions/system.ts` | **CORE** | `set_api_key`, `select_ai_model` — system configuration | types |
| `definitions/workspace.ts` | **CORE** | `create_workspace`, `switch_workspace`, `delete_workspace`, `duplicate_workspace`, `edit_workspace`, `export_workspace` — workspace management | types |
| `definitions/toolkit.ts` | **CORE** | `enable_toolkit`, `disable_toolkit`, `list_agent_toolkits`, `set_agent_toolkits` — toolkit management per agent | types, TOOLKITS constant |
| `definitions/imageGen.ts` | **TOOLKIT (ImageGen)** | `generate_image`, `generate_all_images`, `clear_image_cache`, `generate_icon` | imageGen service, portraitCache |
| `definitions/studio.ts` | **TOOLKIT (Studio)** | Barrel re-export of studio-steps, studio-resources, studio-lifecycle | studio-* |
| `definitions/studio-steps.ts` | **TOOLKIT (Studio)** | `studio_add_step`, `studio_remove_step`, `studio_set_step_args`, `studio_add_parallel_group`, etc. | registry, StudioContext |
| `definitions/studio-resources.ts` | **TOOLKIT (Studio)** | `studio_add_deliverable`, `studio_remove_deliverable`, `studio_add_storage`, etc. | StudioContext |
| `definitions/studio-lifecycle.ts` | **TOOLKIT (Studio)** | `studio_get_state`, `studio_set_job_meta`, `studio_save_job`, `studio_run_job`, `studio_load_job`, `studio_clear_canvas`, `studio_create_compound_job`, `studio_add_trigger`, etc. | StudioContext, tools |

### 3d. Toolkit System (`src/services/toolkits/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `toolkits/types.ts` | **CORE** | ToolkitModule (17-facet specification), OCI types, ToolkitManifest, ToolkitContext, lifecycle hooks — the plugin system contract | types (Toolkit, ToolkitCategory) |
| `toolkits/registry.ts` | **CORE** | ToolkitRegistry class — register/unregister/query/OCI pack-unpack | types, commands/registry |
| `toolkits/index.ts` | **CORE** | Public API: `initializeToolkits()`, `TOOLKITS` array, re-exports | registry, builtins |

### 3e. Built-in Toolkit Modules (`src/services/toolkits/builtins/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `builtins/index.ts` | **CORE** | Barrel — assembles `builtinModules` array | all builtins |
| `builtins/agent-management.ts` | **MESH** | ToolkitModule for agent CRUD commands | agent, modification, query, toolkit defs |
| `builtins/infrastructure.ts` | **MESH** | ToolkitModule for channels, groups, messaging, broadcast commands | channel, group, messaging, broadcast, modification, query defs |
| `builtins/ecosystem.ts` | **MESH** | ToolkitModule for ecosystem, network, bridge, architect, topology commands | ecosystem, architect, topology, maintenance defs |
| `builtins/autonomy.ts` | **MESH** | ToolkitModule for autonomy + governance commands | autonomy, governance defs |
| `builtins/artifacts.ts` | **CORE** | ToolkitModule for artifact CRUD commands | artifact defs |
| `builtins/jobs.ts` | **CORE** | ToolkitModule for job queue management commands | jobs defs |
| `builtins/workspace-mgmt.ts` | **CORE** | ToolkitModule for workspace + system commands | workspace, system defs |
| `builtins/studio.ts` | **TOOLKIT (Studio)** | ToolkitModule for all 20+ studio commands; includes sub-agent definitions and Studio Bot config | studio defs, studioBot types |
| `builtins/image-gen.ts` | **TOOLKIT (ImageGen)** | ToolkitModule for image generation commands | imageGen defs |
| `builtins/web-crawler.ts` | **TOOLKIT (WebCrawler)** | ToolkitModule (capability, "coming-soon → available") — tools only, no commands | none |
| `builtins/ocr.ts` | **TOOLKIT (OCR)** | ToolkitModule (capability, "coming-soon") — tools only | none |
| `builtins/audio-to-text.ts` | **TOOLKIT (AudioToText)** | ToolkitModule (capability, "coming-soon") — tools only | none |
| `builtins/video-to-text.ts` | **TOOLKIT (VideoToText)** | ToolkitModule (capability, "coming-soon") — tools only | none |

### 3f. Jobs (`src/services/jobs/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `jobs/executor.ts` | **CORE** | Headless job executor — runs JobDefinition to completion (serial/parallel/mixed, references, handlers) | registry, jobRuntime utils |
| `jobs/seedCatalog.ts` | **MESH** | Built-in seed job definitions (Deploy Network) — mesh-domain templates | types |

### 3g. Automations (`src/services/automations/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `automations/types.ts` | **CORE** | AutomationDefinition, AutomationRun, AutomationStep, AutomationLog | CommandContext |
| `automations/registry.ts` | **CORE** | In-memory automation registry (Map-based) | types |
| `automations/runner.ts` | **CORE** | AutomationRunner — executes automation steps via command context | registry, ai/chat, jobRuntime |
| `automations/definitions/healthCheck.ts` | **MESH** | Health-check automation — pings all agents | agent defs |

### 3h. Autonomy (`src/services/autonomy/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `autonomy/index.ts` | **MESH** | Barrel re-export | all autonomy/* |
| `autonomy/taskEngine.ts` | **MESH** | Task execution loop — plan → execute → replan → delegate → escalate | planner, delegation, capability, registry, jobs/executor, ai, autonomy types |
| `autonomy/planner.ts` | **MESH** | AI-powered task planning — analyzes goals, builds action plans with commands + jobs | ai providers, models, registry, autonomy types |
| `autonomy/delegation.ts` | **MESH** | Task delegation — routes tasks between agents/groups/networks/ecosystem | autonomy types, capability |
| `autonomy/consensus.ts` | **MESH** | Group consensus engine — AI deliberation, voting per governance model | ai providers, models, autonomy types |
| `autonomy/ideation.ts` | **MESH** | Group ideation sessions — holistic workspace analysis, structural proposals | ai providers, models, autonomy types |
| `autonomy/taskChat.ts` | **MESH** | Mid-execution AI chat for reasoning/adaptation | ai providers, models, autonomy types |
| `autonomy/capability.ts` | **MESH** | Agent capability assessment — skills, role, allowed commands, relevance scoring | registry, tools, constants |

### 3i. Other Services

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `services/agentRuntime.ts` | **MESH** | Agent runtime service — lifecycle management, message routing, inbox processing, OpenRouter-compatible comms | agentRuntime types, ai providers, ai models |
| `services/imageGen.ts` | **TOOLKIT (ImageGen)** | Imagen 4.0 image generation — portrait/badge generation, style prefixes | ai models |
| `services/portraitCache.ts` | **TOOLKIT (ImageGen)** | IndexedDB cache for generated portraits | none |
| `services/studioBot.ts` | **TOOLKIT (Studio)** | Studio Bot sub-agent — plans + executes studio commands from natural language, auto-layout, validation | StudioContext, ai providers, studioBot types |
| `services/credebl.ts` | **MESH** | Barrel re-export of credebl/ | credebl/* |
| `services/credebl/index.ts` | **MESH** | Barrel for SSI services | all credebl/* |
| `services/credebl/auth.ts` | **MESH** | SSI authentication service | api/client, types |
| `services/credebl/agent.ts` | **MESH** | SSI agent configuration | api/client |
| `services/credebl/connection.ts` | **MESH** | SSI connection management | api/client |
| `services/credebl/credentials.ts` | **MESH** | Verifiable credential issuance | api/client |
| `services/credebl/did.ts` | **MESH** | DID creation and WebCrypto key generation | types |
| `services/credebl/emailRegistration.ts` | **MESH** | Email registration credential flow | api/client, types |
| `services/credebl/emailValidation.ts` | **MESH** | Email OTP validation flow | api/client, types |
| `services/credebl/schema.ts` | **MESH** | Schema creation for verifiable credentials | api/client |
| `services/credebl/verification.ts` | **MESH** | Presentation/proof verification | api/client |
| `services/credebl/types.ts` | **MESH** | Credebl request/response shapes | none |

---

## 4. Hooks (`src/hooks/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `hooks/useLocalStorage.ts` | **CORE** | Generic localStorage read/write with cross-tab sync | none |
| `hooks/useBulkSelect.ts` | **CORE** | Generic multi-select state (toggle, selectAll, clear) | none |
| `hooks/useDeleteConfirm.ts` | **CORE** | Generic 2-step delete confirmation pattern | none |
| `hooks/useChatResize.ts` | **CORE** | Drag-to-resize for chat panel | ThemeContext (ChatPosition) |
| `hooks/useRouteSync.ts` | **CORE** | Bidirectional URL ↔ ViewId sync (React Router) | types (ViewId, NavContext) |
| `hooks/useNotebook.tsx` | **CORE** | Activity notebook — append-only log with localStorage persistence | types (NotebookEntry) |
| `hooks/useConversations.ts` | **CORE** | Chat conversation CRUD, persistence, scroll management | ai (ChatMessage), chat/types, chat/utils |
| `hooks/useDataManagement.ts` | **CORE** | Import/export workspace data as JSON | types (Agent, Channel, etc.) |
| `hooks/useCommandContext.ts` | **CORE** | Builds CommandContext from all context providers | CommandContext types, all contexts |
| `hooks/useJobCatalog.ts` | **CORE** | Job catalog management — merge seeded + user jobs, CRUD | types (JobDefinition), seedCatalog |
| `hooks/useJobs.ts` | **CORE** | Job queue state — add/update/remove/clear jobs + standalone artifacts | types (Job, JobArtifact) |
| `hooks/useJobExecutor.tsx` | **CORE** | Reactive job executor — runs queued jobs via command registry | registry, tools, ai, jobRuntime, StudioContext, notebook |
| `hooks/useWorkspaceManager.ts` | **CORE** | Multi-workspace manager — CRUD for workspace blobs in localStorage | types (Workspace, WorkspaceMetadata), identity |
| `hooks/useAgents.ts` | **MESH** | Agent CRUD state + UI form state | workspaceStore, types (Agent, NewAgentForm) |
| `hooks/useChannels.ts` | **MESH** | Channel CRUD state + UI form state | workspaceStore, types (Channel, ChannelForm) |
| `hooks/useGroups.ts` | **MESH** | Group CRUD state + UI form state | workspaceStore, types (Group, GroupForm) |
| `hooks/useMessages.ts` | **MESH** | Message CRUD + sending/broadcast state | workspaceStore, types (Message) |
| `hooks/useEcosystem.ts` | **MESH** | Ecosystem state — networks, bridges, bridge messages, orphan adoption | ecosystemStore, types (Ecosystem), identity, constants |
| `hooks/useArchitect.ts` | **MESH** | Architect flow state — prompt → generate → preview → deploy | types (MeshConfig, ArchPhase) |

---

## 5. Context Providers (`src/context/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `context/AuthContext.tsx` | **CORE** | Auth state machine (login, logout, DID, email credential) | credebl services, types (User, AuthState) |
| `context/ThemeContext.tsx` | **CORE** | Theme/dark-mode, chat position, graphics presets | imageGen (setActiveStylePrefixes) |
| `context/LLMContext.tsx` | **CORE** | Multi-provider LLM management — keys, model selection, liveness probes, Ollama instances | llmModels, llmProbes, types/llm |
| `context/llmModels.ts` | **CORE** | Static model catalogs (Anthropic, Google, OpenAI, OpenRouter), localStorage key constants | types/llm |
| `context/llmProbes.ts` | **CORE** | Provider liveness probe functions (pure async) | types/llm |
| `context/JobsContext.tsx` | **CORE** | React context wrapper for useJobs hook | useJobs |
| `context/AutomationsContext.tsx` | **CORE** | Automation state, registration, runner integration | automations service |
| `context/WorkspaceContext.tsx` | **MESH** | Workspace state facade — agents, channels, groups, messages (delegates to hooks) | useAgents, useChannels, useGroups, useMessages |
| `context/StudioContext.tsx` | **TOOLKIT (Studio)** | StudioAPI imperative bridge — exposes step CRUD, deliverable/storage/input management | types/studio, types/jobs |
| `context/EditorContext.tsx` | **TOOLKIT (Editor)** | EditorAPI imperative bridge — get/set content, artifact loading, cursor ops | types (JobArtifact) |

---

## 6. Stores (`src/stores/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `stores/index.ts` | **CORE** | Barrel re-export + selectors | workspaceStore, ecosystemStore |
| `stores/workspaceStore.ts` | **MESH** | Zustand store for agents, channels, groups, messages with per-network selectors | types (Agent, Channel, Group, Message) |
| `stores/ecosystemStore.ts` | **MESH** | Zustand store for ecosystem (networks, bridges, bridge messages), network selection | types (Ecosystem, Network, Bridge), identity |

---

## 7. Utils (`src/utils/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `utils/identity.ts` | **CORE** | DID generation, key-pair generation, network/group/ecosystem DID generators | types (KeyPair) |
| `utils/crypto.ts` | **CORE** | Simple password encoding (base64 placeholder) | none |
| `utils/secureStorage.ts` | **CORE** | Web Crypto AES-GCM encryption/decryption with PBKDF2 | none |
| `utils/json.ts` | **CORE** | JSON sanitization, repair, MeshConfig extraction | types (MeshConfig) |
| `utils/jobRuntime.ts` | **CORE** | Reference resolution ($storage, $deliverable, $input), input bindings, output mappings, step handlers, deliverable assembly | CommandContext, types/jobs |
| `utils/artifactRefs.ts` | **CORE** | Artifact reference parsing from text ([[artifact:UUID]]) | types (JobArtifact) |
| `utils/aieos.ts` | **MESH** | AIEOS v1.2.0 factory — creates, exports, imports entity objects | types (Agent, AieosEntity), constants |
| `utils/studioApi.ts` | **TOOLKIT (Studio)** | Factory for building StudioAPI object from react refs | StudioContext, types/studio, studioJobBuilder |
| `utils/studioDraft.ts` | **TOOLKIT (Studio)** | Auto-save/restore studio workspace draft to localStorage | types/studio |
| `utils/studioJobBuilder.ts` | **TOOLKIT (Studio)** | Build JobDefinition from Studio state, load JobDefinition into Studio steps | types/studio, types/jobs |

---

## 8. API Client (`src/api/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `api/client.ts` | **CORE** | Axios HTTP client for Credebl API | none (env var) |

---

## 9. Constants (`src/constants/`)

| File | Category | Reason | Cross-deps |
|---|---|---|---|
| `constants/index.tsx` | **CORE+MESH** | ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS, NETWORK_COLORS, PROMPT_TEMPLATES, SCENARIO_PRESETS, **TOOLKITS** (legacy array). Mixes core UI constants with mesh-domain enums. | types, GradientIcon |

---

## 10. Components (`src/components/`)

### 10a. Layout Components

| File | Category | Reason |
|---|---|---|
| `components/Main.tsx` | **CORE** | Provider composition + auth gate |
| `components/layout/AuthenticatedApp.tsx` | **CORE** | Main app shell — sidebar, header, footer, view switching, chat panel |
| `components/layout/Header.tsx` | **CORE** | Top bar with navigation |
| `components/layout/Sidebar.tsx` | **CORE** | Navigation sidebar |
| `components/layout/Footer.tsx` | **CORE** | Status bar footer |
| `components/layout/Breadcrumb.tsx` | **CORE** | Navigation breadcrumb trail |
| `components/layout/ViewSwitcher.tsx` | **CORE** | View routing/switching |
| `components/layout/ChatPanel.tsx` | **CORE** | Workspace AI chat panel |
| `components/layout/DisplayPanel.tsx` | **CORE** | Side-panel container |
| `components/layout/ActivityModal.tsx` | **CORE** | Notebook activity modal |
| `components/layout/LLMManager.tsx` | **CORE** | LLM provider/model management modal |
| `components/layout/ProfileModal.tsx` | **CORE** | User profile modal |
| `components/layout/ArtifactsPanel.tsx` | **CORE** | Artifact list/preview panel |
| `components/layout/WorkspaceCard.tsx` | **CORE** | Workspace summary card |
| `components/layout/WorkspaceManager.tsx` | **CORE** | Workspace picker/manager |
| `components/layout/WorkspaceManagerModal.tsx` | **CORE** | Workspace management modal |
| `components/layout/ArchitectPopup.tsx` | **MESH** | Architect inline popup (mesh-specific) |
| `components/layout/ArchitectPreview.tsx` | **MESH** | Architect preview in layout |
| `components/layout/ArchitectDone.tsx` | **MESH** | Architect completion state |

### 10b. View Components

| File | Category | Reason |
|---|---|---|
| `components/views/LoginView.tsx` | **CORE** | Login/registration |
| `components/views/SettingsView.tsx` | **CORE** | App settings |
| `components/views/ProfileView.tsx` | **CORE** | User profile |
| `components/views/SystemView.tsx` | **CORE** | System status dashboard |
| `components/views/ArtifactsView.tsx` | **CORE** | Artifact management |
| `components/views/ActivityView.tsx` | **CORE** | Activity/notebook feed |
| `components/views/AutomationsView.tsx` | **CORE** | Automation management |
| `components/views/ToolKitsView.tsx` | **CORE** | Toolkit registry browser |
| `components/views/ToolkitDetailView.tsx` | **CORE** | Toolkit detail/config page |
| `components/views/NetworksView.tsx` | **MESH** | Network list/grid |
| `components/views/NetworkView.tsx` | **MESH** | Single network canvas |
| `components/views/NetworkDetailView.tsx` | **MESH** | Network detail panel |
| `components/views/AgentsView.tsx` | **MESH** | Agent list |
| `components/views/AgentDetailView.tsx` | **MESH** | Agent profile/detail |
| `components/views/ChannelsView.tsx` | **MESH** | Channel list |
| `components/views/ChannelDetailView.tsx` | **MESH** | Channel detail/messages |
| `components/views/GroupsView.tsx` | **MESH** | Group list |
| `components/views/GroupDetailView.tsx` | **MESH** | Group detail/governance |
| `components/views/MessagesView.tsx` | **MESH** | Message feed |
| `components/views/ArchitectView.tsx` | **MESH** | Architect multi-phase wizard |
| `components/views/architect/ArchitectInput.tsx` | **MESH** | Architect prompt input |
| `components/views/architect/ArchitectPreview.tsx` | **MESH** | Architect preview with config |
| `components/views/architect/ArchitectDeploying.tsx` | **MESH** | Architect deployment progress |
| `components/views/architect/ArchitectDone.tsx` | **MESH** | Architect completion |
| `components/views/networks/index.ts` | **MESH** | Networks barrel |
| `components/views/networks/NetworkCard.tsx` | **MESH** | Network card tile |
| `components/views/networks/CreateNetworkModal.tsx` | **MESH** | Create-network form modal |
| `components/views/networks/BridgeBuilder.tsx` | **MESH** | Bridge creation wizard |
| `components/views/networks/BridgeCard.tsx` | **MESH** | Bridge card tile |
| `components/views/networks/TopologyPanel.tsx` | **MESH** | Topology graph panel |
| `components/views/StudioView.tsx` | **TOOLKIT (Studio)** | Studio visual job editor — the main canvas view |
| `components/views/EditorView.tsx` | **TOOLKIT (Editor)** | Document editor with markdown/code support |
| `components/views/AieosEditor.tsx` | **MESH** | AIEOS entity JSON editor |

### 10c. Chat Components

| File | Category | Reason |
|---|---|---|
| `components/chat/AgentChat.tsx` | **MESH** | Direct agent-to-agent chat |
| `components/chat/MessageBubble.tsx` | **CORE** | Generic message bubble renderer |
| `components/chat/ActionCard.tsx` | **CORE** | Inline action card in chat |
| `components/chat/JobProgressCard.tsx` | **CORE** | Inline job progress in chat |
| `components/chat/types.ts` | **CORE** | Conversation, message types |
| `components/chat/utils.ts` | **CORE** | Persistence helpers |

### 10d. Actions Components

| File | Category | Reason |
|---|---|---|
| `components/actions/CommandCard.tsx` | **CORE** | Command card (visual representation) |
| `components/actions/CommandCardModal.tsx` | **CORE** | Command detail/execution modal |
| `components/actions/CommandPrompt.tsx` | **CORE** | Command argument prompt |
| `components/actions/CommandsPanel.tsx` | **CORE** | Command browser panel |
| `components/actions/ActionLibrary.tsx` | **CORE** | Action library browser |
| `components/actions/ActionManager.tsx` | **CORE** | Action management |
| `components/actions/ActionsMonitor.tsx` | **CORE** | Live actions monitor |
| `components/actions/MonitorStepTree.tsx` | **CORE** | Step-tree visualization |
| `components/actions/monitorUtils.tsx` | **CORE** | Monitor utility renderers |
| `components/actions/DryRunReport.tsx` | **CORE** | Dry-run report display |
| `components/actions/HistoryPanel.tsx` | **CORE** | Job/command history |
| `components/actions/AutomationsPanel.tsx` | **CORE** | Automation list in actions |
| `components/actions/UnifiedBuilder.tsx` | **CORE** | Unified command/job builder |

### 10e. Automations Components

| File | Category | Reason |
|---|---|---|
| `components/automations/AutomationBuilder.tsx` | **CORE** | Automation definition builder |
| `components/automations/AutomationCard.tsx` | **CORE** | Automation summary card |
| `components/automations/AutomationLogViewer.tsx` | **CORE** | Automation run log viewer |
| `components/automations/CommandArgInput.tsx` | **CORE** | Type-aware command argument input |

### 10f. Jobs Components

| File | Category | Reason |
|---|---|---|
| `components/jobs/JobCanvas.tsx` | **TOOLKIT (Studio)** | Visual canvas with node graph |
| `components/jobs/JobNode.tsx` | **TOOLKIT (Studio)** | Individual step node on canvas |
| `components/jobs/NodeEditor.tsx` | **TOOLKIT (Studio)** | Step node inline editor |
| `components/jobs/NodeEditModal.tsx` | **TOOLKIT (Studio)** | Step node edit modal |
| `components/jobs/StepCardModal.tsx` | **TOOLKIT (Studio)** | Step detail card modal |
| `components/jobs/CommandRibbon.tsx` | **TOOLKIT (Studio)** | Draggable command ribbon |
| `components/jobs/canvasConnectors.ts` | **TOOLKIT (Studio)** | Canvas connector path math |
| `components/jobs/canvasGeometry.ts` | **TOOLKIT (Studio)** | Canvas geometry calculations |
| `components/jobs/JobCatalog.tsx` | **CORE** | Job catalog browser (shows saved job definitions) |
| `components/jobs/JobInputPromptModal.tsx` | **CORE** | Runtime input prompt for jobs |

### 10g. Canvas Components

| File | Category | Reason |
|---|---|---|
| `components/canvas/EcosystemCanvas.tsx` | **MESH** | Ecosystem topology visualization |
| `components/canvas/NetworkCanvas.tsx` | **MESH** | Network topology visualization |

### 10h. Activity Components

| File | Category | Reason |
|---|---|---|
| `components/activity/ActivityFilter.tsx` | **CORE** | Activity feed filter |
| `components/activity/ActivityItem.tsx` | **CORE** | Activity feed entry |
| `components/activity/ActivityList.tsx` | **CORE** | Activity feed list |
| `components/activity/ComposePanel.tsx` | **CORE** | Activity compose panel |
| `components/activity/utils.tsx` | **CORE** | Activity display helpers |

### 10i. Shared Components

| File | Category | Reason |
|---|---|---|
| `components/shared/ui.tsx` | **CORE** | Generic UI primitives |
| `components/shared/GradientIcon.tsx` | **CORE** | Gradient icon wrapper |
| `components/shared/CopyableId.tsx` | **CORE** | Click-to-copy ID chip |
| `components/shared/DeleteConfirmInline.tsx` | **CORE** | Inline delete confirmation |
| `components/shared/ErrorBoundary.tsx` | **CORE** | React error boundary |
| `components/shared/MarkdownContent.tsx` | **CORE** | Markdown renderer |
| `components/shared/GemAvatar.tsx` | **CORE** | Gem-style avatar |
| `components/shared/AgentPortrait.tsx` | **MESH** | Agent portrait with AI-generated image |
| `components/shared/AgentTradingCard.tsx` | **MESH** | Agent trading card (full AIEOS display) |
| `components/shared/GroupTradingCard.tsx` | **MESH** | Group trading card |
| `components/shared/GroupBadge.tsx` | **MESH** | Group badge with AI-generated image |
| `components/shared/AgentRuntimePanel.tsx` | **MESH** | Agent runtime status panel |
| `components/shared/ArchitectBotPanel.tsx` | **MESH** | Architect bot sub-agent UI panel |
| `components/shared/StudioBotPanel.tsx` | **TOOLKIT (Studio)** | Studio Bot sub-agent UI panel |

---

## 11. Styles (`src/styles/`)

| File | Category | Reason |
|---|---|---|
| `styles/design-tokens.css` | **CORE** | CSS variables |
| `styles/layout.css` | **CORE** | App layout grid |
| `styles/animations.css` | **CORE** | Shared animations |
| `styles/utilities.css` | **CORE** | Utility classes |
| `styles/mobile.css` | **CORE** | Mobile breakpoints |
| `styles/theme-light.css` | **CORE** | Light theme |
| `styles/theme-solar.css` | **CORE** | Solar theme |
| `styles/components.css` | **CORE** | Barrel import for component CSS |
| `styles/components/global.css` | **CORE** | Global component overrides |
| `styles/components/header.css` | **CORE** | Header styles |
| `styles/components/sidebar.css` | **CORE** | Sidebar styles |
| `styles/components/footer.css` | **CORE** | Footer styles |
| `styles/components/breadcrumb.css` | **CORE** | Breadcrumb styles |
| `styles/components/chat-panel.css` | **CORE** | Chat panel styles |
| `styles/components/display-panel.css` | **CORE** | Display panel styles |
| `styles/components/login.css` | **CORE** | Login styles |
| `styles/components/profile.css` | **CORE** | Profile styles |
| `styles/components/profile-modal.css` | **CORE** | Profile modal styles |
| `styles/components/settings.css` | **CORE** | Settings styles |
| `styles/components/llm-manager.css` | **CORE** | LLM manager styles |
| `styles/components/artifacts.css` | **CORE** | Artifacts view styles |
| `styles/components/artifacts-panel.css` | **CORE** | Artifacts panel styles |
| `styles/components/activity.css` | **CORE** | Activity view styles |
| `styles/components/activity-filter.css` | **CORE** | Activity filter styles |
| `styles/components/activity-item.css` | **CORE** | Activity item styles |
| `styles/components/activity-list.css` | **CORE** | Activity list styles |
| `styles/components/activity-modal.css` | **CORE** | Activity modal styles |
| `styles/components/compose-panel.css` | **CORE** | Compose panel styles |
| `styles/components/command-card.css` | **CORE** | Command card styles |
| `styles/components/command-card-modal.css` | **CORE** | Command card modal styles |
| `styles/components/command-prompt.css` | **CORE** | Command prompt styles |
| `styles/components/commands-panel.css` | **CORE** | Commands panel styles |
| `styles/components/action-card.css` | **CORE** | Action card styles |
| `styles/components/action-library.css` | **CORE** | Action library styles |
| `styles/components/action-manager.css` | **CORE** | Action manager styles |
| `styles/components/actions-monitor.css` | **CORE** | Actions monitor styles |
| `styles/components/history-panel.css` | **CORE** | History panel styles |
| `styles/components/automations.css` | **CORE** | Automations view styles |
| `styles/components/automations-panel.css` | **CORE** | Automations panel styles |
| `styles/components/automation-builder.css` | **CORE** | Automation builder styles |
| `styles/components/automation-card.css` | **CORE** | Automation card styles |
| `styles/components/automation-log-viewer.css` | **CORE** | Automation log viewer styles |
| `styles/components/command-arg-input.css` | **CORE** | Command arg input styles |
| `styles/components/dry-run-report.css` | **CORE** | Dry-run report styles |
| `styles/components/unified-builder.css` | **CORE** | Unified builder styles |
| `styles/components/authenticated-app.css` | **CORE** | Authenticated app shell styles |
| `styles/components/workspace-card.css` | **CORE** | Workspace card styles |
| `styles/components/workspace-manager.css` | **CORE** | Workspace manager styles |
| `styles/components/workspace-modal.css` | **CORE** | Workspace modal styles |
| `styles/components/job-catalog.css` | **CORE** | Job catalog styles |
| `styles/components/job-input-prompt.css` | **CORE** | Job input prompt styles |
| `styles/components/job-manager.css` | **CORE** | Job manager styles |
| `styles/components/job-progress-card.css` | **CORE** | Job progress card styles |
| `styles/components/message-bubble.css` | **CORE** | Message bubble styles |
| `styles/components/error-boundary.css` | **CORE** | Error boundary styles |
| `styles/components/copyable-id.css` | **CORE** | Copyable ID styles |
| `styles/components/delete-confirm.css` | **CORE** | Delete confirm styles |
| `styles/components/system-view.css` | **CORE** | System view styles |
| `styles/components/toolkits.css` | **CORE** | Toolkits view styles |
| `styles/components/toolkit-detail.css` | **CORE** | Toolkit detail styles |
| `styles/components/agents.css` | **MESH** | Agents view styles |
| `styles/components/agent-detail.css` | **MESH** | Agent detail styles |
| `styles/components/agent-chat.css` | **MESH** | Agent chat styles |
| `styles/components/agent-runtime.css` | **MESH** | Agent runtime styles |
| `styles/components/channels.css` | **MESH** | Channels view styles |
| `styles/components/channel-detail.css` | **MESH** | Channel detail styles |
| `styles/components/groups.css` | **MESH** | Groups view styles |
| `styles/components/group-detail.css` | **MESH** | Group detail styles |
| `styles/components/messages.css` | **MESH** | Messages view styles |
| `styles/components/networks.css` | **MESH** | Networks view styles |
| `styles/components/network-detail.css` | **MESH** | Network detail styles |
| `styles/components/network-view.css` | **MESH** | Network single-view styles |
| `styles/components/create-network-modal.css` | **MESH** | Create network modal styles |
| `styles/components/bridge-builder.css` | **MESH** | Bridge builder styles |
| `styles/components/ecosystem.css` | **MESH** | Ecosystem styles |
| `styles/components/trading-card.css` | **MESH** | Agent/group trading card styles |
| `styles/components/architect.css` | **MESH** | Architect view styles |
| `styles/components/architect-popup.css` | **MESH** | Architect popup styles |
| `styles/components/architect-bot.css` | **MESH** | Architect bot panel styles |
| `styles/components/node-edit-modal.css` | **TOOLKIT (Studio)** | Node edit modal styles |
| `styles/components/step-card-modal.css` | **TOOLKIT (Studio)** | Step card modal styles |
| `styles/components/editor.css` | **TOOLKIT (Editor)** | Editor view styles |
| `styles/components/studio-bot.css` | **TOOLKIT (Studio)** | Studio bot panel styles |

---

## 12. Tests (`src/test/`)

| File | Category | Reason |
|---|---|---|
| `test/setup.ts` | **CORE** | Test harness setup |
| `test/hooks/useLocalStorage.test.ts` | **CORE** | |
| `test/hooks/useBulkSelect.test.ts` | **CORE** | |
| `test/hooks/useJobs.test.ts` | **CORE** | |
| `test/utils/crypto.test.ts` | **CORE** | |
| `test/utils/json.test.ts` | **CORE** | |
| `test/utils/secureStorage.test.ts` | **CORE** | |
| `test/utils/jobRuntime.test.ts` | **CORE** | |
| `test/utils/identity.test.ts` | **CORE** | |
| `test/services/commands/registry.test.ts` | **CORE** | |
| `test/services/commands/dryRun.test.ts` | **CORE** | |
| `test/services/jobs/executor.test.ts` | **CORE** | |
| `test/stores/workspaceStore.test.ts` | **MESH** | |
| `test/stores/ecosystemStore.test.ts` | **MESH** | |
| `test/hooks/useAgents.integration.test.ts` | **MESH** | |
| `test/hooks/useEcosystem.test.ts` | **MESH** | |
| `test/services/commands/definitions/agent.test.ts` | **MESH** | |
| `test/services/commands/definitions/channel.test.ts` | **MESH** | |
| `test/services/commands/definitions/group.test.ts` | **MESH** | |
| `test/services/commands/definitions/broadcast.test.ts` | **MESH** | |
| `test/services/commands/definitions/messaging.test.ts` | **MESH** | |
| `test/services/commands/definitions/maintenance.test.ts` | **MESH** | |
| `test/services/commands/definitions/artifact.test.ts` | **CORE** | |
| `test/services/commands/definitions/jobs.test.ts` | **CORE** | |
| `test/services/commands/definitions/autonomy.test.ts` | **MESH** | |
| `test/services/autonomy/capability.test.ts` | **MESH** | |
| `test/services/autonomy/consensus.test.ts` | **MESH** | |
| `test/services/autonomy/delegation.test.ts` | **MESH** | |
| `test/services/autonomy/taskChat.test.ts` | **MESH** | |
| `test/services/autonomy/taskEngine.test.ts` | **MESH** | |
| `test/types/autonomy.test.ts` | **MESH** | |
| `test/services/commands/definitions/studio.test.ts` | **TOOLKIT (Studio)** | |
| `test/services/commands/registration-studio.test.ts` | **TOOLKIT (Studio)** | |
| `test/types/studio-types.test.tsx` | **TOOLKIT (Studio)** | |
| `test/components/shared/SectionTitle.test.tsx` | **CORE** | |

---

## 13. Summary Statistics

| Category | Files | % of total |
|---|---|---|
| **CORE** | ~130 | ~50% |
| **MESH** | ~95 | ~36% |
| **TOOLKIT (Studio)** | ~25 | ~10% |
| **TOOLKIT (Editor)** | ~3 | ~1% |
| **TOOLKIT (ImageGen)** | ~5 | ~2% |
| **TOOLKIT (WebCrawler)** | ~1 | <1% |
| **TOOLKIT (OCR)** | ~1 | <1% |
| **TOOLKIT (Audio-to-Text)** | ~1 | <1% |
| **TOOLKIT (Video-to-Text)** | ~1 | <1% |

---

## 14. Key Cross-Dependency Issues

### 14a. CORE → TOOLKIT Leaks (should be removed for clean extraction)

| Source (CORE) | Depends on (TOOLKIT) | Nature |
|---|---|---|
| `services/commands/types.ts` | `StudioAPI` from `StudioContext` | CommandContext includes optional `studio?: StudioAPI` field |
| `services/ai/chat.ts` | `shouldDelegateToStudioBot` from `studioBot` | Studio delegation check in core chat loop |
| `services/ai/streaming.ts` | `shouldDelegateToStudioBot` from `studioBot` | Same delegation check in streaming |
| `hooks/useJobExecutor.tsx` | `useStudioContext` | Passes studio context into CommandContext |

**Fix:** Make `studio`/`editor` slots in CommandContext generic (optional plugin interface), and move delegation detection to a registry-based pattern instead of hard-coded import.

### 14b. CORE ↔ MESH Entanglement

| Location | Issue |
|---|---|
| `types/index.ts` | Single barrel file exports both CORE types (Job, Workspace, Toolkit) and MESH types (Agent, Channel, Network, Ecosystem, Bridge) |
| `constants/index.tsx` | Mixes CORE constants (TOOLKITS array) with MESH constants (ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS) |
| `services/ai/prompts.ts` | System prompt builder references MESH entities (agents, channels, networks) |
| `hooks/useJobExecutor.tsx` | CORE job executor has knowledge of workspace mesh state for CommandContext |
| `hooks/useCommandContext.ts` | Bridges all providers into CommandContext — inherently cross-cutting |

**Fix:** Split `types/index.ts` into `types/core.ts` and `types/mesh.ts`. Split `constants/index.tsx` similarly.

### 14c. TOOLKIT Extraction Readiness

| Toolkit | Extraction Readiness | Blockers |
|---|---|---|
| **Studio** | Medium | 25 files, StudioContext leaks into CommandContext + AI chat, studioBot imported by core AI |
| **Editor** | High | 3 files (context, view, CSS), minimal cross-deps |
| **ImageGen** | High | 5 files (service, cache, commands, builtin module, CSS), only depends on AI models |
| **Web Crawler** | Ready | 1 file, tools-only, no commands, no imports from core |
| **OCR** | Ready | 1 file, tools-only, coming-soon |
| **Audio-to-Text** | Ready | 1 file, tools-only, coming-soon |
| **Video-to-Text** | Ready | 1 file, tools-only, coming-soon |
| **Architect** | Low | Deeply embedded in MESH (ecosystem commands, deploy flow, multiple views), not a separate toolkit today |

---

## 15. Recommended Extraction Order

1. **Web Crawler / OCR / Audio-to-Text / Video-to-Text** — Already self-contained toolkit modules, just need formal packaging.
2. **Editor** — 3 files, easy to extract: `EditorContext`, `EditorView`, `editor.css`.
3. **ImageGen** — 5 files: `imageGen.ts`, `portraitCache.ts`, `definitions/imageGen.ts`, `builtins/image-gen.ts`, CSS. Remove hard-coded ThemeContext coupling.
4. **Studio** — Largest extraction (~25 files). Requires:
   - Remove `StudioAPI` from core `CommandContext` (make it a plugin slot)
   - Remove `shouldDelegateToStudioBot` from core AI chat/streaming
   - Move all `studio-*` command defs, `studioBot.ts`, `studioApi.ts`, `studioDraft.ts`, `studioJobBuilder.ts`, canvas components, and Studio CSS into a self-registering toolkit module
5. **Architect** — Entangled with ecosystem/network commands; consider bundling with the Ecosystem toolkit or extracting as a MESH sub-module rather than a standalone TOOLKIT.

# Decops — Overall Architecture

> **Last updated:** 2026-03-05  
> **Purpose:** Track current implementation against the desired top-level organization.

---

## Desired Architecture (Tree)

```
root
├── I. system
│   ├── toolkits
│   │   ├── built-in / system
│   │   │   ├── agents
│   │   │   ├── tools
│   │   │   └── commands
│   │   ├── add-ons / plugins
│   │   └── federated marketplace
│   ├── apps
│   │   ├── studio
│   │   └── editor
│   ├── actions
│   │   ├── job manager & queue & history
│   │   └── task / job / command library / catalog
│   ├── artifacts
│   └── configuration
│
└── II. workspace
    ├── bridges
    └── networks
        ├── channels
        ├── groups
        └── agents
```

---

## I. System

Everything under **System** is platform-level infrastructure available regardless of which workspace is active. It is the engine, the tool surface, and the runtime environment.

---

### 1. Toolkits

Toolkits (kits) are the primary extension surface. A toolkit is a self-contained, OCI-compliant module composed of up to 17 standardized facets:

| # | Facet | Purpose | Interface | Status |
|---|-------|---------|-----------|--------|
| 1 | **Metadata** | Identity, author, version, dependencies, OCI digest, license | `ToolkitManifest` | ✅ |
| 2 | **Commands** | Basic process actions registered with the CommandRegistry | `CommandDefinition[]` | ✅ |
| 3 | **Tools** | MCP / function-calling schemas for AI delegation | `ToolkitTool[]` | ✅ |
| 4 | **Agents** | Sub-agents (AIEOS entities) provided by the kit | `ToolkitAgent[]` | ✅ |
| 5 | **Jobs** | Pre-defined, reusable multi-step job templates with I/O | `ToolkitJobTemplate[]` | ✅ |
| 6 | **Automations** | Event-driven, scheduled, or webhook-triggered automation rules | `ToolkitAutomation[]` | ✅ |
| 7 | **Tasks** | Assignable work items for users or AI agents | `ToolkitTask[]` | ✅ |
| 8 | **Collections** | Managed data schemas — entities/artifacts owned by the kit | `ToolkitCollection[]` | ✅ |
| 9 | **UI / UX** | Pages, panels, cards, menu items, icons, theme contributions | `ToolkitUI` | ✅ |
| 10 | **Configuration** | Per-kit settings schema exposed in the config UI | `ToolkitConfiguration` | ✅ |
| 11 | **Logging** | Structured logs with named channels and cross-kit pub/sub | `ToolkitLogging` | ✅ |
| 12 | **Notifications** | Multi-channel alerts with templates and user preferences | `ToolkitNotifications` | ✅ |
| 13 | **Metrics** | Observable key-value gauges (OpenTelemetry-compatible) | `ToolkitMetricsProvider` | ✅ |
| 14 | **RBAC** | Roles, permissions, and access control scoped to the kit | `ToolkitRBAC` | ✅ |
| 15 | **Tests** | Test suites with assertions, setup/teardown, and coverage | `ToolkitTestSuite` | ✅ |
| 16 | **Documentation** | README, guides, tutorials, changelogs, and API references | `ToolkitDocs` | ✅ |
| 17 | **API** | Server-side HTTP endpoints contributed by the kit | `ToolkitAPI` | ✅ |

All facets are defined in [`toolkits/types.ts`](../src/services/toolkits/types.ts).

##### OCI Compliance

Kits are **OCI-compliant artifacts** — they follow the [Open Container Initiative image spec](https://github.com/opencontainers/image-spec) so they can be:

- **Packed** into content-addressable manifests (`toolkitRegistry.pack(module)`)
- **Versioned** with semver + sha256 digests
- **Stored** in any OCI-compatible registry (Harbor, GHCR, Docker Hub, etc.)
- **Pulled / pushed** with standard OCI distribution tooling

Each facet maps to a separate **OCI layer** (`application/vnd.decops.kit.<facet>.v1+json`), enabling selective pulls and incremental updates.

| OCI Type | Media Type | Content |
|----------|-----------|---------|
| Config | `application/vnd.decops.kit.config.v1+json` | `ToolkitManifest` JSON |
| Layer | `application/vnd.decops.kit.<facet>.v1+json` | Facet data (commands, agents, etc.) |
| Manifest | `application/vnd.decops.kit.manifest.v1+json` | `OCIArtifactManifest` |

#### 1.1 Built-in / System

The default toolkits shipped with the platform.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Command system** | `CommandRegistry` — register, unregister, get, execute, dryRun. ~80+ commands across 23 definition files. | [registry.ts](../src/services/commands/registry.ts), [types.ts](../src/services/commands/types.ts) | ✅ Mature |
| **Command definitions** | 23 definition modules covering agents, channels, groups, messaging, ecosystem, architect, jobs, studio, toolkit, workspace, governance, topology, etc. | [definitions/](../src/services/commands/definitions/) | ✅ Mature |
| **Tool-use bridge** | Converts commands → Anthropic/OpenAI tool schemas for AI function-calling. Pending-job promise map for async tool execution. | [tools.ts](../src/services/commands/tools.ts) | ✅ Working |
| **Dry-run engine** | Validates commands and multi-step jobs without executing. | [dryRun.ts](../src/services/commands/dryRun.ts) | ✅ Working |
| **Error catalog** | Standardized error codes and messages per command. | [commandErrors.ts](../src/services/commands/commandErrors.ts) | ✅ Working |
| **Toolkit metadata** | `ToolkitModule` interface — each toolkit is a self-contained module with manifest, commands, tools, agents, and lifecycle hooks. Registered at startup via `ToolkitRegistry`. Legacy `TOOLKITS` array derived from registry. | [toolkits/types.ts](../src/services/toolkits/types.ts), [toolkits/registry.ts](../src/services/toolkits/registry.ts), [toolkits/builtins/](../src/services/toolkits/builtins/) | ✅ Modular |
| **Toolkit commands** | `enable_toolkit`, `disable_toolkit`, `list_toolkits` — manage which toolkits are active per-agent. | [definitions/toolkit.ts](../src/services/commands/definitions/toolkit.ts) | ✅ Working |
| **Agent runtime** | Lifecycle management, message routing, OpenRouter-format request/response, inbox queue, autonomy controls. | [services/agentRuntime.ts](../src/services/agentRuntime.ts), [types/agentRuntime.ts](../src/types/agentRuntime.ts) | ⚠️ Partial |
| **Toolkit UI** | Catalog view (search, filter, expandable cards) + detail view (tools list, commands, per-agent binding toggle). | [ToolKitsView.tsx](../src/components/views/ToolKitsView.tsx), [ToolkitDetailView.tsx](../src/components/views/ToolkitDetailView.tsx) | ✅ Working |

##### Agents (Built-in)

| Concern | Current Implementation | Status |
|---------|----------------------|--------|
| Agent CRUD | `create_agent`, `modify_agent`, `delete_agent` commands; `useAgents` hook (Zustand) | ✅ Mature |
| Agent types | `Agent` type with DID, keys, role, prompt, networkId, toolkit bindings, portrait | ✅ Mature |
| Agent runtime | `AgentRuntimeState`, `AgentAutonomyConfig`, message processing via `processAgentRequest` | ⚠️ Partial — no autonomous loop/scheduler |
| Agent portraits | AI-generated portraits via image gen commands; portrait cache service | ✅ Working |
| Agent detail UI | `AgentDetailView`, `AgentTradingCard`, `AgentPortrait`, `AgentRuntimePanel` | ✅ Working |

##### Tools (Built-in)

| Concern | Current Implementation | Status |
|---------|----------------------|--------|
| Tool schema | `ToolkitTool` type (id, name, description, inputSchema) | ✅ Defined |
| Tool → AI bridge | `commandsToTools()` in tools.ts converts registry → function-calling schemas | ✅ Working |
| Tool execution | Commands execute via `CommandRegistry.execute()` with full context injection | ✅ Working |

##### Commands (Built-in)

23 definition modules providing ~80+ commands:

| Module | Commands | Domain |
|--------|----------|--------|
| [agent.ts](../src/services/commands/definitions/agent.ts) | `create_agent`, `modify_agent`, `delete_agent`, `list_agents`, `get_agent` | Agent CRUD |
| [channel.ts](../src/services/commands/definitions/channel.ts) | `create_channel`, `delete_channel`, `list_channels` | Channel CRUD |
| [group.ts](../src/services/commands/definitions/group.ts) | `create_group`, `delete_group`, `list_groups` | Group CRUD |
| [messaging.ts](../src/services/commands/definitions/messaging.ts) | `send_message`, `get_messages` | Messaging |
| [broadcast.ts](../src/services/commands/definitions/broadcast.ts) | `send_broadcast` | Group broadcast |
| [ecosystem.ts](../src/services/commands/definitions/ecosystem.ts) | `create_network`, `save_ecosystem`, `load_ecosystem`, `list_ecosystems`, `delete_ecosystem` | Ecosystem/network lifecycle |
| [topology.ts](../src/services/commands/definitions/topology.ts) | `create_bridge`, `delete_bridge`, `print_topology` | Network topology |
| [architect.ts](../src/services/commands/definitions/architect.ts) | `generate_mesh`, `refine_mesh` | AI mesh generation |
| [jobs.ts](../src/services/commands/definitions/jobs.ts) | `run_job`, `list_jobs`, `get_job`, `cancel_job` | Job lifecycle |
| [studio.ts](../src/services/commands/definitions/studio.ts) | 19 `studio_*` commands | Visual job builder |
| [studio-lifecycle.ts](../src/services/commands/definitions/studio-lifecycle.ts) | Studio save/load/run lifecycle | Studio persistence |
| [studio-resources.ts](../src/services/commands/definitions/studio-resources.ts) | Studio deliverables & storage | Studio resources |
| [studio-steps.ts](../src/services/commands/definitions/studio-steps.ts) | Studio step management | Studio steps |
| [artifact.ts](../src/services/commands/definitions/artifact.ts) | `create_artifact`, `edit_artifact`, `tag_artifact`, `delete_artifact`, `list_artifacts`, `search_artifacts` | Artifact CRUD |
| [toolkit.ts](../src/services/commands/definitions/toolkit.ts) | `enable_toolkit`, `disable_toolkit`, `list_toolkits` | Toolkit management |
| [workspace.ts](../src/services/commands/definitions/workspace.ts) | Workspace commands | Workspace management |
| [governance.ts](../src/services/commands/definitions/governance.ts) | Governance commands | Group governance |
| [autonomy.ts](../src/services/commands/definitions/autonomy.ts) | Autonomy commands | Agent autonomy |
| [imageGen.ts](../src/services/commands/definitions/imageGen.ts) | Image generation commands | AI image gen |
| [system.ts](../src/services/commands/definitions/system.ts) | System commands | Platform ops |
| [query.ts](../src/services/commands/definitions/query.ts) | Query commands | Data queries |
| [modification.ts](../src/services/commands/definitions/modification.ts) | Modification commands | Bulk ops |
| [maintenance.ts](../src/services/commands/definitions/maintenance.ts) | Maintenance commands | Housekeeping |

##### Toolkit Module System

The platform's toolkit infrastructure is built on a modular plugin-style architecture. Each toolkit is a self-contained `ToolkitModule` that bundles its own metadata, commands, tools, agents, metrics, logs, activity, configuration, and lifecycle hooks.

**Key files:**

| File | Purpose |
|------|---------|
| [toolkits/types.ts](../src/services/toolkits/types.ts) | Core interfaces — `ToolkitModule`, `ToolkitManifest`, all 17 facet interfaces, OCI types (`OCIDescriptor`, `OCILayer`, `OCIArtifactManifest`, `OCIReference`), `ToolkitFacet` enum |
| [toolkits/registry.ts](../src/services/toolkits/registry.ts) | `ToolkitRegistry` — register (with dependency validation), unregister, query (`getByCategory`, `getByLabel`), facet introspection (`getFacets`), OCI packaging (`pack`, `getOCIRef`), subscribe |
| [toolkits/index.ts](../src/services/toolkits/index.ts) | Singleton registry, `initializeToolkits()`, legacy `TOOLKITS` export, 80+ type re-exports |
| [toolkits/builtins/](../src/services/toolkits/builtins/) | 13 built-in toolkit module files |

**Module interface (condensed):**

```typescript
interface ToolkitModule {
  // ── Core identity ──
  manifest: ToolkitManifest;           // id, name, icon, labels, annotations, version,
                                       // author, license, repository, homepage,
                                       // createdAt, updatedAt, digest, dependencies,
                                       // minPlatformVersion, status (incl. "deprecated")

  // ── Capabilities ──
  commands:     CommandDefinition[];    // basic process actions
  tools:        ToolkitTool[];         // MCP / function-calling schemas for AI
  agents?:      ToolkitAgent[];        // sub-agents (AIEOS entities)
  jobs?:        ToolkitJobTemplate[];  // reusable multi-step job templates with I/O
  automations?: ToolkitAutomation[];   // event/schedule/webhook-triggered rules
  tasks?:       ToolkitTask[];         // assignable work items

  // ── Data ──
  collections?: ToolkitCollection[];   // managed data schemas (entities/artifacts)

  // ── UI / UX ──
  ui?:  ToolkitUI;                     // pages, panels, cards, menu items, icons
  app?: ToolkitApp;                    // legacy app surface (backward compat)

  // ── Configuration ──
  configuration?: ToolkitConfiguration; // per-kit settings schema

  // ── Observability ──
  logging?:       ToolkitLogging;       // named channels + pub/sub config
  notifications?: ToolkitNotifications; // templates + channel preferences
  metrics?:       ToolkitMetricsProvider; // OpenTelemetry-format gauges

  // ── Governance ──
  rbac?:  ToolkitRBAC;                // roles, permissions, access control
  tests?: ToolkitTestSuite;           // test suites with assertions

  // ── Documentation ──
  docs?: ToolkitDocs;                 // README, guides, changelogs, API refs

  // ── Server-side ──
  api?: ToolkitAPI;                   // HTTP endpoints for server-side kits

  // ── OCI ──
  oci?: OCIArtifactManifest;          // packed OCI manifest (set by registry.pack())

  // ── User-facing ──
  activity?: { enabled: boolean };    // activity feed

  // ── Lifecycle ──
  init?:    (ctx: ToolkitContext) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
}
```

**Registration flow:**

1. `main.tsx` calls `initializeToolkits()`
2. Each built-in `ToolkitModule` is passed to `toolkitRegistry.register(module)`
3. The registry **validates dependencies** — if a module declares dependencies, all must be registered first
4. The registry iterates `module.commands` and registers each with the global `CommandRegistry`
5. The module's `init` hook runs (if defined)
6. The legacy `TOOLKITS` array is derived from the registry for backward compatibility

**Dynamic loading:** At runtime, new modules can be registered via `toolkitRegistry.register()` and unloaded via `toolkitRegistry.unregister()`. Subscribers are notified of changes.

**OCI packaging:** At any time, a registered module can be packaged into an OCI artifact:

```typescript
const manifest = toolkitRegistry.pack(module);  // OCIArtifactManifest
const ref = toolkitRegistry.getOCIRef(module);   // registry.example.com/decops/studio:1.0.0
```

Each facet becomes a separate OCI layer, enabling selective pulls and incremental registry updates.

**Facet introspection:** Query which facets a module provides:

```typescript
const facets = toolkitRegistry.getFacets('studio');
// → ['metadata','commands','tools','agents','jobs','automations',
//    'tasks','ui','configuration','logging','notifications',
//    'metrics','rbac','tests','docs']
```

#### 1.2 Add-ons / Plugins

| Concern | Current Implementation | Status |
|---------|----------------------|--------|
| Plugin interface | `ToolkitModule` interface with 17 standardized facets and lifecycle hooks (`init`/`destroy`) | ✅ Defined |
| Dynamic registration | `ToolkitRegistry.register()` / `unregister()` with dependency validation and hot-loading | ✅ Working |
| OCI packaging | `pack()` creates content-addressable OCI artifact manifests; `getOCIRef()` builds registry coordinates | ✅ Working |
| Dependency management | Modules declare `dependencies` in manifest; registry validates at registration time | ✅ Working |
| Facet introspection | `getFacets()` inspects which of the 17 facets a module provides | ✅ Working |
| Plugin sandboxing | No sandboxing — modules run in the same JS context | ❌ Not started |

> **Note:** The `ToolkitModule` / `ToolkitRegistry` system provides a complete runtime layer for dynamic, OCI-compliant toolkit loading. All 13 built-in toolkits are modular and enriched with the full 17-facet system. External plugin distribution via OCI registries is architecturally supported; registry push/pull transport remains to be implemented.

#### 1.3 Federated Marketplace

| Concern | Current Implementation | Status |
|---------|----------------------|--------|
| Marketplace UI | Not implemented | ❌ Not started |
| Toolkit discovery / search | `getByCategory()`, `getByLabel()` provide local search; remote discovery not yet implemented | 🟡 Partial |
| Publish / install flow | OCI packaging (`pack()`) enables publishing; install transport not implemented | 🟡 Partial |
| Federation protocol | Not implemented | ❌ Not started |
| Toolkit versioning | Semver versions in manifests + sha256 digests in OCI packaging | ✅ Working |

---

### 2. Apps

First-party applications that provide dedicated workspaces for specific tasks. Apps expose imperative APIs via React context so commands and AI can interact with them programmatically.

| App | Description | Files | Status |
|-----|-------------|-------|--------|
| **Studio** | Visual job builder — drag-connect DAG canvas for composing multi-step jobs. Full step CRUD, parallel groups, input bindings, output mappings, deliverables, triggers, storage defaults, auto-save drafts. 40+ API methods exposed. | [StudioView.tsx](../src/components/views/StudioView.tsx) (~1023 lines), [StudioContext.tsx](../src/context/StudioContext.tsx), 19 studio commands | ✅ Mature |
| **Editor** | Multi-format document editor — markdown/JSON/YAML/CSV/code with split preview, find/replace, undo/redo history, validation, file import/export, AI proposed-edit diff preview. | [EditorView.tsx](../src/components/views/EditorView.tsx) (~1001 lines), [EditorContext.tsx](../src/context/EditorContext.tsx) | ✅ Mature |

##### App Integration Pattern

Both apps follow the same **register/unregister** pattern:
1. App context provides a `ref` holder for the imperative API.
2. The view component registers its API on mount, unregisters on unmount.
3. External consumers (AI chat, commands) call the API through the context.
4. Draft/state persistence survives view switches via context-held state.

##### Potential Future Apps

| Idea | Notes |
|------|-------|
| Dashboard / Monitor | SystemView already serves some of this purpose |
| Canvas / Whiteboard | EcosystemCanvas / NetworkCanvas could evolve into this |
| Terminal | In-browser terminal for command execution |
| Notebook | `useNotebook` hook exists — potential Jupyter-like app |

---

### 3. Actions

The execution engine — everything that _runs_: jobs, commands, history, catalogs.

#### 3.1 Job Manager & Queue & History

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Job execution engine** | Headless executor supporting serial/parallel/mixed mode. Condition evaluation, step handlers, deliverable assembly, input bindings, output mappings. | [executor.ts](../src/services/jobs/executor.ts) | ✅ Mature |
| **React job executor** | Hook-based executor with real-time UI updates, notebook logging, queue processing. Builds full `CommandContext` for each step. | [useJobExecutor.tsx](../src/hooks/useJobExecutor.tsx) | ✅ Mature |
| **Job state management** | `useJobs` hook — CRUD, artifact management, queue pause/resume, localStorage persistence. | [useJobs.ts](../src/hooks/useJobs.ts) | ✅ Mature |
| **Job context** | `JobsContext` — simple context wrapper exposing `useJobs` return value. | [JobsContext.tsx](../src/context/JobsContext.tsx) | ✅ Working |
| **Queue management** | Queue with pause/resume, lifecycle timeline tracking. | Built into useJobs + useJobExecutor | ✅ Working |
| **History** | `HistoryPanel` — completed/failed job history with timeline, step details, search/filter. | [HistoryPanel.tsx](../src/components/actions/HistoryPanel.tsx) | ✅ Working |
| **Monitor** | `ActionsMonitor` + `MonitorStepTree` — live view of running jobs with step-level progress. | [ActionsMonitor.tsx](../src/components/actions/ActionsMonitor.tsx), [MonitorStepTree.tsx](../src/components/actions/MonitorStepTree.tsx) | ✅ Working |
| **Action manager UI** | `ActionManager` — tabbed bottom panel (Monitor, Automations, History, Catalog, Commands). | [ActionManager.tsx](../src/components/actions/ActionManager.tsx) | ✅ Working |
| **Triggers** | `JobTrigger` type defined (event-based + cron) but no evaluation/scheduler engine. | [types/jobs.ts](../src/types/jobs.ts) | ⚠️ Type only |

#### 3.2 Task / Job / Command Library / Catalog

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Job catalog** | `useJobCatalog` — merges seed + user-saved job definitions; save/delete/get. | [useJobCatalog.ts](../src/hooks/useJobCatalog.ts) | ✅ Working |
| **Seed catalog** | Built-in job templates (currently 1: "Deploy Network"). | [seedCatalog.ts](../src/services/jobs/seedCatalog.ts) | ⚠️ Minimal — only 1 seed |
| **Catalog UI** | `JobCatalog` component — grid of job cards from catalog. | [JobCatalog.tsx](../src/components/jobs/JobCatalog.tsx) | ✅ Working |
| **Command library UI** | `ActionLibrary` — browsable grid of all registered commands; `CommandsPanel` — searchable list. | [ActionLibrary.tsx](../src/components/actions/ActionLibrary.tsx), [CommandsPanel.tsx](../src/components/actions/CommandsPanel.tsx) | ✅ Working |
| **Dry-run validation** | Validates commands and multi-step jobs before execution. | [dryRun.ts](../src/services/commands/dryRun.ts), [DryRunReport.tsx](../src/components/actions/DryRunReport.tsx) | ✅ Working |
| **Unified builder** | Form-based job/command builder. | [UnifiedBuilder.tsx](../src/components/actions/UnifiedBuilder.tsx) | ✅ Working |

##### Key Types

```typescript
JobDefinition    // id, name, description, mode, steps[], deliverables[], storageDefaults, triggers[]
Job              // Runtime instance: status, steps, artifacts[], timeline[], storage, pendingPrompt
JobStep          // commandId, args, status, condition, handlers, bindings, mappings
StepHandler      // commandId, args, control flow (continueOnFailure, haltAfterSuccess)
JobDeliverable   // key, label, type, description, sourceStorageKey
EntityInput      // name, type (agent/channel/group/network/text/...), entityId, source
JobTrigger       // event, filter, label, cron — defined but not auto-evaluated
```

---

### 4. Artifacts

Outputs produced by jobs, commands, or users. First-class content objects with type, metadata, and cross-referencing.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Artifact CRUD** | `create_artifact`, `edit_artifact`, `tag_artifact`, `delete_artifact`, `list_artifacts`, `search_artifacts` commands. | [definitions/artifact.ts](../src/services/commands/definitions/artifact.ts) | ✅ Working |
| **Artifact types** | `JobArtifact` — id, type (markdown/json/yaml/csv/image/code/txt), content, name, tags[], description, source. | [types/jobs.ts](../src/types/jobs.ts) | ✅ Defined |
| **Reference system** | `[[artifact:UUID\|label]]` inline references parsed from text; clickable chips in rendering. | [utils/artifactRefs.ts](../src/utils/artifactRefs.ts) | ✅ Working |
| **Artifacts view** | Full-page browser — search, group by type/source/tag, create modal, detail panel. | [ArtifactsView.tsx](../src/components/views/ArtifactsView.tsx) | ✅ Working |
| **Artifacts panel** | Bottom-drawer panel — resizable, expandable, open-in-editor. | [ArtifactsPanel.tsx](../src/components/layout/ArtifactsPanel.tsx) | ✅ Working |
| **Versioning** | Not implemented — edits overwrite in-place. | — | ❌ Not started |
| **Image preview** | Type supported but no dedicated viewer component. | — | ❌ Not started |

---

### 5. Configuration

Platform-level settings, credentials, theming, and monitoring.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **LLM providers** | Multi-provider management — Anthropic, Google/Gemini, OpenAI, OpenRouter, Ollama. Per-provider API keys, per-agent/command/group model overrides, liveness probes, dynamic OpenRouter model fetching. | [LLMContext.tsx](../src/context/LLMContext.tsx), [llmModels.ts](../src/context/llmModels.ts), [llmProbes.ts](../src/context/llmProbes.ts) | ✅ Mature |
| **Authentication** | Email/password + DID login + email registration credential + CREDEBL SSI integration. | [AuthContext.tsx](../src/context/AuthContext.tsx) | ✅ Working |
| **Theming** | Dark/light/solar themes + AI image generation graphics presets. | [ThemeContext.tsx](../src/context/ThemeContext.tsx) | ✅ Working |
| **Settings UI** | Import/export workspace data as JSON backup. | [SettingsView.tsx](../src/components/views/SettingsView.tsx) | ⚠️ Basic — no config forms |
| **System monitor** | Running processes, job queue, job history with timelines and step trees. | [SystemView.tsx](../src/components/views/SystemView.tsx) | ✅ Mature |
| **AI providers** | Chat service with multi-provider support, streaming, model selection. | [services/ai/](../src/services/ai/) (chat, generators, models, prompts, providers, streaming) | ✅ Mature |

---

## II. Workspace

A workspace is a self-contained user session. Each workspace holds exactly one **ecosystem** which contains all **networks**, **bridges**, and the entities within them. Switching workspaces fully swaps state.

### Workspace → Ecosystem → Network Hierarchy

```
Workspace
├── User Context (DID, credentials, profile)
└── Ecosystem (1 per workspace)
    ├── Network A
    │   ├── Agents [A1, A2, A3]
    │   ├── Groups [G1(A1,A2), G2(A1,A3)]
    │   └── Channels [A1↔A2, A1↔A3]
    ├── Network B
    │   ├── Agents [A4, A5, A6]
    │   ├── Groups [G3(A4,A5)]
    │   └── Channels [A4↔A5, A4↔A6]
    └── Bridges
        ├── A3 ⟷ A6  (cross-network)
        └── A2 ⟷ A4  (cross-network)
```

---

### 1. Bridges

Cross-network connections linking agents in different networks. Owned by the ecosystem, not by either network.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Bridge type** | `Bridge` — fromNetworkId, toNetworkId, fromAgentId, toAgentId. | [types/mesh.ts](../src/types/mesh.ts) | ✅ Defined |
| **Bridge CRUD** | `create_bridge`, `delete_bridge` commands. | [definitions/topology.ts](../src/services/commands/definitions/topology.ts) | ✅ Working |
| **Bridge messages** | `ecosystem.bridgeMessages[]` — messages routed across bridges. | [hooks/useEcosystem.ts](../src/hooks/useEcosystem.ts) | ✅ Working |
| **Bridge UI** | `BridgeBuilder` (create form), `BridgeCard` (display), bridge tab in NetworksView. | [components/views/networks/](../src/components/views/networks/) | ✅ Working |
| **Ecosystem canvas** | Visual topology — network nodes + bridge edges with animated pulses. | [EcosystemCanvas.tsx](../src/components/canvas/EcosystemCanvas.tsx) | ✅ Working |

---

### 2. Networks

The primary container for agents, channels, and groups. All entities belong to a specific network.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Network type** | `Network` — id, name, description, did, color. Agents/channels/groups linked by `networkId`. | [types/mesh.ts](../src/types/mesh.ts) | ✅ Defined |
| **Network CRUD** | `create_network` (empty or Architect-generated), `save_ecosystem`, `load_ecosystem`, `delete_ecosystem`. | [definitions/ecosystem.ts](../src/services/commands/definitions/ecosystem.ts) | ✅ Working |
| **Active network** | `activeNetworkId` state in `useEcosystem`; commands auto-tag new entities. | [hooks/useEcosystem.ts](../src/hooks/useEcosystem.ts) | ✅ Working |
| **Network UI** | `NetworksView` (list + bridges + topology tabs), `NetworkDetailView` (filtered entities + stats + canvas). | [NetworksView.tsx](../src/components/views/NetworksView.tsx), [NetworkDetailView.tsx](../src/components/views/NetworkDetailView.tsx) | ✅ Working |
| **Network canvas** | Agent nodes, channel edges, group halos, animated data pulses. | [NetworkCanvas.tsx](../src/components/canvas/NetworkCanvas.tsx) | ✅ Working |

#### 2.1 Channels

Communication links between two agents.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Channel type** | `Channel` — from, to, type, mode (p2p/bridge/broadcast), networkId. | [types/mesh.ts](../src/types/mesh.ts) | ✅ Defined |
| **Channel CRUD** | `create_channel`, `delete_channel`, `list_channels` commands. | [definitions/channel.ts](../src/services/commands/definitions/channel.ts) | ✅ Working |
| **Channel modes** | `ChannelMode = "p2p" \| "bridge" \| "broadcast"`. | [types/mesh.ts](../src/types/mesh.ts) | ✅ Defined |
| **Channel UI** | `ChannelsView`, `ChannelDetailView`, channels listed in NetworkDetailView. | [ChannelsView.tsx](../src/components/views/ChannelsView.tsx), [ChannelDetailView.tsx](../src/components/views/ChannelDetailView.tsx) | ✅ Working |

#### 2.2 Groups

Coordinating sets of 2+ agents with governance models.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Group type** | `Group` — members[], governance, threshold, networkId. | [types/mesh.ts](../src/types/mesh.ts) | ✅ Defined |
| **Group CRUD** | `create_group`, `delete_group`, `list_groups` commands. | [definitions/group.ts](../src/services/commands/definitions/group.ts) | ✅ Working |
| **Group broadcast** | `sendBroadcast` in `useMessages`; broadcast channel mode. | [hooks/useMessages.ts](../src/hooks/useMessages.ts) | ✅ Working |
| **Group governance** | Voting model + threshold per group. | [definitions/governance.ts](../src/services/commands/definitions/governance.ts) | ✅ Working |
| **Group UI** | `GroupsView`, `GroupDetailView`, `GroupBadge`, `GroupTradingCard`. | Views + shared components | ✅ Working |

#### 2.3 Agents

Autonomous entities with identity, role, and behavior.

| Concern | Current Implementation | Files | Status |
|---------|----------------------|-------|--------|
| **Agent type** | `Agent` — id, name, did, keys, role, prompt, networkId, portrait, toolkit bindings. | [types/mesh.ts](../src/types/mesh.ts) | ✅ Defined |
| **Agent CRUD** | `create_agent`, `modify_agent`, `delete_agent`, `list_agents`, `get_agent`. | [definitions/agent.ts](../src/services/commands/definitions/agent.ts) | ✅ Working |
| **Agent runtime** | `AgentRuntimeState`, autonomy config, message processing via OpenRouter. | [services/agentRuntime.ts](../src/services/agentRuntime.ts) | ⚠️ Partial — no autonomous loop |
| **Agent autonomy** | `AgentAutonomyConfig` — levels (supervised/guided/autonomous/collaborative), rate/spending limits. | [types/agentRuntime.ts](../src/types/agentRuntime.ts) | ✅ Defined |
| **Agent chat** | `AgentChat` — individual conversation with an agent. | [components/chat/AgentChat.tsx](../src/components/chat/AgentChat.tsx) | ✅ Working |
| **Agent UI** | `AgentsView`, `AgentDetailView`, `AgentTradingCard`, `AgentPortrait`, `AgentRuntimePanel`. | Views + shared components | ✅ Working |

---

## Cross-cutting Concerns

| Concern | Current Implementation | Status |
|---------|----------------------|--------|
| **Automations** | Declarative + code automations with runner, builder UI, log viewer. No scheduler — manual trigger only. In-memory registry (no persistence). | ⚠️ Moderate |
| **AI chat** | `ChatPanel` with multi-provider LLM support, tool-use bridge, streaming, workspace-aware system prompts. | ✅ Mature |
| **Architect** | AI-powered mesh designer — generates networks from natural language prompts. | ✅ Working |
| **SSI / Identity** | DID generation for all entities. CREDEBL integration for verifiable credentials. | ✅ Working |
| **Persistence** | Pure localStorage — no server-side sync or collaboration. | ⚠️ Client-only |
| **PWA** | Service worker registration for offline-capable progressive web app. | ✅ Working |

---

## Implementation Scorecard

| Area | Sub-area | Status | Maturity |
|------|----------|--------|----------|
| **I. System** | | | |
| | Toolkits > Built-in (agents) | ✅ | High |
| | Toolkits > Built-in (tools) | ✅ | High |
| | Toolkits > Built-in (commands) | ✅ | High — 80+ commands |
| | Toolkits > OCI Packaging | ✅ | High — pack, getOCIRef, per-facet layers |
| | Toolkits > 17-Facet System | ✅ | High — all facets defined & populated |
| | Toolkits > Add-ons / Plugins | 🟡 | Runtime ready — sandboxing not started |
| | Toolkits > Federated Marketplace | 🟡 | Versioning + local search done; remote not started |
| | Apps > Studio | ✅ | Very high |
| | Apps > Editor | ✅ | Very high |
| | Actions > Job Manager & Queue | ✅ | Very high |
| | Actions > History | ✅ | High |
| | Actions > Catalog / Library | ✅ | High (seed catalog minimal) |
| | Artifacts | ✅ | High |
| | Configuration | ✅ | High (settings UI basic) |
| **II. Workspace** | | | |
| | Bridges | ✅ | High |
| | Networks | ✅ | High |
| | Networks > Channels | ✅ | High |
| | Networks > Groups | ✅ | High |
| | Networks > Agents | ✅ | High (runtime partial) |

---

## Gap Summary & Roadmap Priorities

### Critical Gaps (❌ Not Started)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| G1 | ~~Plugin / add-on architecture~~ — **Resolved.** `ToolkitModule` with 17 facets, `ToolkitRegistry` with dependency validation, OCI packaging. Remaining: plugin sandboxing (iframe / worker isolation). | Sandboxing blocks untrusted third-party kits. | Medium |
| G2 | **Federated marketplace** — OCI packaging and semver versioning are done. Missing: remote registry push/pull transport, marketplace UI, federation protocol. | Blocks ecosystem growth beyond built-in toolkits. | Large |
| G3 | **Artifact versioning** — Edits overwrite in-place; no history or diff. | Data loss risk on artifact edits. | Medium |

### Partial Implementations (⚠️)

| # | Gap | Current State | What's Missing |
|---|-----|--------------|----------------|
| G4 | **Agent autonomous loop** | Runtime can process messages, has autonomy config. | No scheduler/event loop for self-initiated tasks; no inbox polling. |
| G5 | **Trigger evaluation engine** | `JobTrigger` type defined, triggers can be attached to jobs. | No cron scheduler or event listener that automatically fires triggers. |
| G6 | **Automation persistence** | Automations exist in-memory registry. | Lost on page reload; need localStorage or workspace-blob serialization. |
| G7 | **Automation scheduler** | `schedule` field on definitions. | No cron evaluation; all automations are manual-trigger only. |
| G8 | **Settings configuration UI** | SettingsView does import/export. | No general configuration forms for app settings, provider priorities, session management. |
| G9 | **Seed job catalog** | Only 1 seed job ("Deploy Network"). | Catalog should include common workflow templates. |
| G10 | **Server-side persistence** | All state in localStorage. | No sync, backup, collaboration, or multi-device support. |

---

## File Index

### System — Toolkits

```
src/services/toolkits/
├── types.ts             # ToolkitModule, ToolkitManifest, all 17 facet interfaces,
│                        # OCI types (OCIDescriptor, OCILayer, OCIArtifactManifest)
├── registry.ts          # ToolkitRegistry — register (with dep validation), pack,
│                        # getOCIRef, getFacets, getByCategory, getByLabel
├── index.ts             # Singleton, initializeToolkits(), TOOLKITS, 80+ type exports
└── builtins/
    ├── agent-management.ts   # Agent lifecycle, health checks, RBAC
    ├── artifacts.ts          # Artifact management, collections, versioning
    ├── audio-to-text.ts      # Audio transcription capability
    ├── autonomy.ts           # Delegation, decisions, auto-escalation
    ├── ecosystem.ts          # Network/bridge operations, topology metrics
    ├── image-gen.ts          # Portrait generation, batch jobs, image cache
    ├── infrastructure.ts     # Channels, groups, messaging, broadcasts
    ├── jobs.ts               # Job execution, batch processing, auto-retry
    ├── ocr.ts                # OCR capability
    ├── studio.ts             # Visual job builder, pipelines, full UI contributions
    ├── video-to-text.ts      # Video transcription capability
    ├── web-crawler.ts        # Web crawling, collections, configurable settings
    └── workspace-mgmt.ts     # Workspace CRUD, export/import, backup

src/services/commands/
├── registry.ts          # CommandRegistry — register, execute, dryRun
├── types.ts             # CommandDefinition, CommandArg, CommandContext
├── tools.ts             # AI tool-use bridge (command → function schema)
├── init.ts              # Registers all 24 definition modules
├── dryRun.ts            # Dry-run validation engine
├── commandErrors.ts     # Error catalog
└── definitions/         # 24 command definition modules
    ├── agent.ts
    ├── architect.ts
    ├── artifact.ts
    ├── autonomy.ts
    ├── broadcast.ts
    ├── channel.ts
    ├── data.ts
    ├── ecosystem.ts
    ├── governance.ts
    ├── group.ts
    ├── imageGen.ts
    ├── jobs.ts
    ├── maintenance.ts
    ├── messaging.ts
    ├── modification.ts
    ├── query.ts
    ├── studio.ts
    ├── studio-lifecycle.ts
    ├── studio-resources.ts
    ├── studio-steps.ts
    ├── system.ts
    ├── toolkit.ts
    ├── topology.ts
    └── workspace.ts

src/services/agentRuntime.ts      # Agent lifecycle, message routing
src/types/agentRuntime.ts         # AgentRuntimeState, AgentAutonomyConfig
src/constants/index.tsx            # TOOLKITS constant (catalog metadata)
```

### System — Apps

```
src/components/views/StudioView.tsx    # Visual job builder (canvas)
src/context/StudioContext.tsx          # Studio imperative API bridge
src/components/views/EditorView.tsx    # Multi-format document editor
src/context/EditorContext.tsx          # Editor imperative API bridge
```

### System — Actions

```
src/services/jobs/
├── executor.ts          # Headless job executor
└── seedCatalog.ts       # Built-in job templates

src/hooks/
├── useJobs.ts           # Job CRUD, queue, persistence
├── useJobCatalog.ts     # Catalog (seed + user jobs)
└── useJobExecutor.tsx   # React-integrated executor

src/context/JobsContext.tsx          # Jobs context wrapper
src/types/jobs.ts                    # All job-related types
src/utils/jobRuntime.ts              # resolveRefs, bindings, conditions

src/components/actions/
├── ActionManager.tsx    # Tabbed bottom panel
├── ActionsMonitor.tsx   # Live job monitoring
├── MonitorStepTree.tsx  # Step-level progress tree
├── HistoryPanel.tsx     # Job history browser
├── ActionLibrary.tsx    # Command library grid
├── CommandsPanel.tsx    # Searchable command list
├── CommandCard.tsx       # Command card component
├── CommandCardModal.tsx  # Command detail modal
├── CommandPrompt.tsx     # Command execution prompt
├── UnifiedBuilder.tsx   # Job/command builder form
├── DryRunReport.tsx     # Dry-run results
├── AutomationsPanel.tsx # Automations tab
└── monitorUtils.tsx     # Monitor utility functions
```

### System — Artifacts

```
src/services/commands/definitions/artifact.ts   # Artifact commands
src/utils/artifactRefs.ts                        # [[artifact:UUID]] parser
src/components/views/ArtifactsView.tsx           # Full-page browser
src/components/layout/ArtifactsPanel.tsx         # Bottom-drawer panel
```

### System — Configuration

```
src/context/LLMContext.tsx       # Multi-provider LLM management
src/context/AuthContext.tsx      # Authentication (email, DID, CREDEBL)
src/context/ThemeContext.tsx     # Theme + graphics presets
src/context/llmModels.ts        # Model definitions
src/context/llmProbes.ts        # Provider liveness probes
src/components/views/SettingsView.tsx  # Import/export
src/components/views/SystemView.tsx    # System monitor
src/services/ai/                 # AI chat service (providers, streaming)
```

### Workspace

```
src/hooks/useWorkspaceManager.ts     # Multi-workspace CRUD
src/context/WorkspaceContext.tsx      # Unified agents/channels/groups/messages
src/hooks/useEcosystem.ts            # Ecosystem state (networks, bridges)
src/hooks/useAgents.ts               # Agent CRUD (Zustand)
src/hooks/useChannels.ts             # Channel CRUD (Zustand)
src/hooks/useGroups.ts               # Group CRUD (Zustand)
src/hooks/useMessages.ts             # Messaging (p2p, broadcast)
src/stores/ecosystemStore.ts         # Ecosystem Zustand store
src/stores/workspaceStore.ts         # Workspace Zustand store

src/components/views/
├── NetworksView.tsx          # Networks list + bridges + topology
├── NetworkView.tsx           # Single network topology
├── NetworkDetailView.tsx     # Network detail (filtered entities)
├── ChannelsView.tsx          # Channels list
├── ChannelDetailView.tsx     # Channel detail
├── GroupsView.tsx            # Groups list
├── GroupDetailView.tsx       # Group detail
├── AgentsView.tsx            # Agents grid
├── AgentDetailView.tsx       # Agent detail
└── networks/                 # Network sub-components
    ├── NetworkCard.tsx
    ├── BridgeBuilder.tsx
    ├── BridgeCard.tsx
    ├── CreateNetworkModal.tsx
    └── TopologyPanel.tsx

src/components/canvas/
├── NetworkCanvas.tsx         # Intra-network visualization
└── EcosystemCanvas.tsx       # Inter-network visualization
```

### Automations (Cross-cutting)

```
src/services/automations/
├── types.ts                  # AutomationDefinition, AutomationRun
├── registry.ts               # In-memory registry
├── runner.ts                 # Execution engine
└── definitions/
    └── healthCheck.ts        # Built-in automation

src/context/AutomationsContext.tsx        # Context provider
src/components/views/AutomationsView.tsx  # View
src/components/automations/
├── AutomationBuilder.tsx     # Form-based builder
├── AutomationCard.tsx        # Automation card
├── AutomationLogViewer.tsx   # Log viewer modal
└── CommandArgInput.tsx       # Arg input component
```

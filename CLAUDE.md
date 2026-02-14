# CLAUDE.md — Decops / Mesh Workspace

## Project Overview

**Decops** (Mesh Workspace) is a decentralized agent collaboration platform UI. It provides an interface for creating and managing multi-agent mesh networks where AI agents collaborate autonomously through peer-to-peer channels, group governance, and cross-network bridges.

This project is at the **early prototype stage** — a single React component and a design system document, with no build tooling, package manager, or test infrastructure yet in place.

## Repository Structure

```
decops/
├── CLAUDE.md                          # This file
└── prototype/
    ├── workspace (2).jsx              # Main React application (~1,620 lines)
    └── mesh-style-guide.html          # Design system & visual style guide (~746 lines)
```

There is no `package.json`, `tsconfig.json`, build config, CI/CD, or test setup. The JSX file is intended to be consumed by an external build system or embedded in an existing React project.

## Technology Stack

- **React** (JSX) — UI framework, uses hooks (`useState`, `useCallback`, `useRef`, `useEffect`)
- **Canvas 2D API** — Real-time animated network topology visualization
- **Anthropic Claude API** — AI-powered mesh generation and agent message passing (model: `claude-sonnet-4-20250514`)
- **Web Crypto API** — `crypto.randomUUID()` for generating unique IDs
- **Google Fonts** — DM Mono (monospace), Space Grotesk (display)

## Architecture & Key Modules

All application code resides in `prototype/workspace (2).jsx`. The file is organized into these sections:

### Utility Functions (lines 1–188)
- `generateDID()`, `generateKeyPair()`, `generateGroupDID()`, `generateNetworkDID()` — Simulated cryptographic identifier generators using `did:peer:`, `did:group:`, `did:network:` formats
- `sanitizeJSONString()` — Strips markdown fences and normalizes whitespace inside JSON strings from AI responses
- `repairJSON()` — Multi-strategy JSON parser that handles malformed AI output (direct parse → regex cut-point balancing → section-level extraction)

### AI Integration (lines 190–267)
- `generateMeshConfig(description)` — Calls Claude API to generate a full mesh network config (agents, channels, groups, example messages) from a natural language description
- `callAgentAI(agent, senderAgent, message, ...)` — Routes messages between agents through Claude API, maintaining conversation history and cross-network context

### Canvas Visualization (lines 269–350+)
- `NetworkCanvas` component — Renders agents in a circular layout with animated channel connections, data flow pulses, group boundaries, and glow effects
- `EcosystemCanvas` — Renders the multi-network ecosystem view

### Main Application Component
- `MeshWorkspace` — Root component managing all state: agents, channels, groups, messages, ecosystem snapshots, and bridges

## Domain Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | An AI entity with a role, DID, key pair, and custom prompt directive |
| **Role** | One of: Researcher, Builder, Curator, Validator, Orchestrator (each has a unique color) |
| **Channel** | A P2P communication link between two agents; types: Data Sync, Task Relay, Consensus |
| **Group** | A collection of agents governed by a shared model (Majority Vote, Threshold Sig, Delegated, Unanimous) |
| **Ecosystem** | A collection of saved network snapshots that can be loaded, dissolved, or bridged |
| **Bridge** | A cross-network communication channel connecting agents from different saved networks |

## Constants & Configuration

Defined at the top of `workspace (2).jsx`:

- **`ROLES`** (5) — `researcher`, `builder`, `curator`, `validator`, `orchestrator`
- **`CHANNEL_TYPES`** (3) — `data`, `task`, `consensus`
- **`GOVERNANCE_MODELS`** (4) — `majority`, `threshold`, `delegated`, `unanimous`
- **`PROMPT_TEMPLATES`** (6) — Custom, Data Analyst, Code Reviewer, Research Synthesizer, Task Coordinator, Knowledge Curator
- **`SCENARIO_PRESETS`** (6) — DeFi Security Audit, Research Lab, Content Studio, Incident Response, Startup Operations, Supply Chain DAO
- **`NETWORK_COLORS`** (8) — Color palette for distinguishing networks in the ecosystem view

## Design System

Documented in `prototype/mesh-style-guide.html`. Key principles:

- **Dark-first theme** — Primary background `#0a0a0f`, depth through opacity layering
- **Terminal-grade precision** — Monospaced fonts for data, structured layouts
- **Color encodes meaning** — Role colors are semantic, never decorative
- **Typography** — DM Mono (code/data), Space Grotesk (headings/display)
- **Spacing scale** — `xs` (4px) through `3xl` (48px)

### Role Color Mapping
| Role | Color |
|------|-------|
| Researcher | `#00e5a0` (green) |
| Builder | `#fbbf24` (amber) |
| Curator | `#a78bfa` (purple) |
| Validator | `#38bdf8` (blue) |
| Orchestrator | `#f472b6` (pink) |

## Development Notes

### No Build System
There is currently no package manager, bundler, or build pipeline. The JSX file requires a React environment to run. When setting up:
- A bundler like Vite or Next.js will be needed
- React must be provided as a dependency
- The Anthropic API key must be supplied (the current code calls `api.anthropic.com` directly from the browser, which requires CORS headers or a proxy)

### No Tests
There is no test infrastructure. When adding tests, consider:
- Unit tests for `sanitizeJSONString()` and `repairJSON()` — these have well-defined inputs/outputs
- Component tests for the workspace UI state management
- Mock the Anthropic API calls in tests

### No Linting or Formatting
No ESLint, Prettier, or other code quality tools are configured.

### API Usage
The code calls the Anthropic Messages API directly via `fetch()`:
- Endpoint: `https://api.anthropic.com/v1/messages`
- Model: `claude-sonnet-4-20250514`
- No API key is hardcoded — it must be provided at runtime (currently the `x-api-key` header is not set in the code; this will need to be addressed)
- Max tokens: 4096 for mesh generation, 1000 for agent responses

### File Naming
The main source file has a space and parenthetical in its name (`workspace (2).jsx`). This should be renamed to a clean identifier (e.g., `workspace.jsx` or `MeshWorkspace.jsx`) when the project matures.

## Conventions for AI Assistants

1. **This is a prototype** — Avoid over-engineering. Keep changes focused and minimal.
2. **Single-file architecture** — All logic is in one JSX file. Splitting into modules is acceptable but not required unless the user requests it.
3. **Preserve the design language** — Follow the color scheme, typography, and visual conventions from the style guide when making UI changes.
4. **DID format matters** — Use `did:peer:`, `did:group:`, `did:network:` prefixes for generated identifiers.
5. **JSON repair is critical** — The `repairJSON` function handles unreliable AI output. Changes to it should be tested carefully with malformed inputs.
6. **Keep agent responses concise** — The system prompt limits responses to 150 words. Maintain this constraint.
7. **Canvas rendering** — The network visualization uses manual Canvas 2D drawing with a 2x scale for retina displays. Changes must account for this scaling.
8. **No secrets in code** — The API key is not and should not be hardcoded. Any API integration must handle credentials externally.

## Git Workflow

- **Default branch:** `master`
- **Commit style:** Descriptive commit messages (only one commit exists: "initial commit - prototype included")
- No branch protection, PR templates, or CI workflows are configured yet.

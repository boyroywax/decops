# DecOps - Decentralized Agent Mesh Workspace

A React-based prototype for designing, managing, and orchestrating multi-agent systems with AI-powered generation capabilities.

## Project Structure

```
decops/
├── src/
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces & type definitions
│   ├── constants/
│   │   └── index.ts              # ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, presets
│   ├── utils/
│   │   ├── identity.ts           # DID/key generation utilities
│   │   └── json.ts               # JSON sanitization & repair for AI responses
│   ├── services/
│   │   └── ai.ts                 # Anthropic API integration layer
│   ├── hooks/
│   │   ├── useActivityLog.ts     # Activity log state management
│   │   ├── useWorkspace.ts       # Agent/channel/group/message CRUD + messaging
│   │   ├── useArchitect.ts       # AI architect generation + deployment
│   │   └── useEcosystem.ts       # Network save/load, bridges, cross-network messaging
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── NetworkCanvas.tsx     # Agent mesh topology visualization
│   │   │   └── EcosystemCanvas.tsx   # Multi-network topology visualization
│   │   ├── layout/
│   │   │   ├── Header.tsx            # App header with stats
│   │   │   └── Sidebar.tsx           # Navigation + activity log
│   │   ├── shared/
│   │   │   └── ui.tsx                # Reusable UI components
│   │   └── views/
│   │       ├── ArchitectView.tsx     # AI-powered network generator
│   │       ├── EcosystemView.tsx     # Ecosystem management + bridges
│   │       ├── AgentsView.tsx        # Agent registry + CRUD
│   │       ├── ChannelsView.tsx      # P2P channel management
│   │       ├── GroupsView.tsx        # Group governance management
│   │       ├── MessagesView.tsx      # Channel/group messaging
│   │       └── NetworkView.tsx       # Network topology canvas view
│   ├── App.tsx                   # Main app shell
│   └── index.ts                  # Entry point
├── prototype/
│   ├── workspace (2).jsx         # Original monolithic prototype (1,620 lines)
│   └── mesh-style-guide.html     # Design system documentation
├── package.json
├── tsconfig.json
└── CLAUDE.md                     # This file
```

## Development Guidelines

### Main Branch

The default branch is **`main`** (not `master`).

### TypeScript & React

- All new code should be in TypeScript (`.ts` or `.tsx`)
- Use proper type definitions from `src/types/index.ts`
- Component props should have explicit interfaces
- Prefer functional components with hooks

### Code Organization

- **Types**: Add new types to `src/types/index.ts`
- **Constants**: Add new constants to `src/constants/index.ts`
- **Utilities**: Add pure functions to `src/utils/`
- **API calls**: Add to `src/services/`
- **State management**: Use custom hooks in `src/hooks/`
- **UI Components**: Add to `src/components/` with appropriate subdirectory

### Custom Hooks

The codebase uses 4 main custom hooks that manage different aspects of state:

1. **`useActivityLog`** - Manages the activity log sidebar
2. **`useWorkspace`** - Manages agents, channels, groups, messages, and messaging
3. **`useArchitect`** - Manages AI-powered network generation and deployment
4. **`useEcosystem`** - Manages saved networks, bridges, and cross-network communication

### AI Integration

All AI functionality is isolated in `src/services/ai.ts`:
- `generateMeshConfig()` - Generate network blueprints from descriptions
- `callAgentAI()` - Agent-to-agent communication via Claude API

**Configuration:**
- Model: `claude-sonnet-4-20250514`
- API endpoint: `https://api.anthropic.com/v1/messages`

To change the model or endpoint, edit `src/services/ai.ts`.

### Canvas Components

Canvas-based visualizations use `requestAnimationFrame` for 60fps rendering:
- `NetworkCanvas.tsx` - Single network agent mesh topology
- `EcosystemCanvas.tsx` - Multi-network ecosystem topology

### Adding New Features

1. **New agent type/role**: Add to `ROLES` in `src/constants/index.ts`
2. **New channel type**: Add to `CHANNEL_TYPES` in `src/constants/index.ts`
3. **New governance model**: Add to `GOVERNANCE_MODELS` in `src/constants/index.ts`
4. **New view**: Create component in `src/components/views/` and add to `App.tsx`

## Design System

The visual design is documented in `prototype/mesh-style-guide.html`:
- **Colors**: 30+ CSS variables for roles, semantic colors, groups
- **Typography**: DM Mono (monospace) + Space Grotesk (display)
- **Spacing**: xs (4px) through 3xl (24px)
- **Border Radius**: sm (3px) through 3xl (12px)

## Prototype vs Production

The original prototype (`prototype/workspace (2).jsx`) is preserved for reference. The refactored TypeScript structure in `src/` provides:

- ✅ Type safety with TypeScript
- ✅ Proper separation of concerns
- ✅ Reusable custom hooks
- ✅ Modular component architecture
- ✅ Easier testing and maintenance

## Building

```bash
npm install
npm run dev        # Development server
npm run build      # Production build
npm run typecheck  # TypeScript type checking
```

## Key Concepts

### Agents
Autonomous entities with DIDs, roles (researcher, builder, curator, validator, orchestrator), and optional AI prompts.

### Channels
P2P communication links between agents. Types: data sync, task relay, consensus.

### Groups
Collections of agents with governance models: majority vote, threshold signature, delegated, unanimous.

### Networks
Complete agent meshes that can be saved to the ecosystem.

### Bridges
Cross-network communication channels connecting agents in different networks.

### Workspace Architect
AI-powered feature that generates complete network blueprints from natural language descriptions.

## Contributing

When making changes:
1. Work on feature branches starting with `claude/`
2. Maintain TypeScript type safety
3. Update this documentation for structural changes
4. Keep the original prototype in `prototype/` for reference

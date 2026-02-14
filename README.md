# Decops Mesh Workspace

Decops is a decentralized agent collaboration platform UI designed for creating and managing multi-agent mesh networks.

## Overview

This project provides a React-based interface for visualizing and interacting with autonomous AI agents in a mesh network topology. It features:
- **Agent Roles**: Researcher, Builder, Curator, Validator, Orchestrator.
- **Visualization**: Canvas-based real-time network topology updates.
- **AI Integration**: Interface for Anthropic Claude integration (requires API key at runtime).

## Prerequisites

- Node.js (v18+ recommended)
- npm

## Getting Started

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start the development server:**
    ```bash
    npm run dev
    ```

3.  **Build for production:**
    ```bash
    npm run build
    ```
    The output will be in the `dist` directory.

## logical Structure

- `src/`: Main React application source code.
  - `components/`: UI components (Views, Layout, etc.).
  - `hooks/`: Custom React hooks for state management.
  - `types/`: TypeScript type definitions.
  - `utils/`: Helper functions.
- `prototype/`: Original single-file prototype implementation (`workspace (2).jsx`) and style guide.

## Testing

Currently, the project focuses on type safety via TypeScript. You can run the type check with:

```bash
npm run typecheck
```
(No unit test suite is currently configured).

## Note on Usage

This application requires an Anthropic API key to function fully (for agent interactions). The key is not stored and must be provided during runtime usage if prompted or configured in the environment (consult the application UI/prototype notes).

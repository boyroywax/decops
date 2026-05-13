# ADR 0001 — Toolkit Contract

- **Status:** Accepted
- **Date:** 2026-05-13
- **Supersedes:** —

## Context

The codebase grew from a single chat surface into a multi-domain workspace
(libp2p, studio, editor, architect, image-gen, identity, …). Earlier each
toolkit registered itself via ad-hoc side-effect imports in `main.tsx` and
sometimes again from feature-flag hooks. This caused HMR double-registration,
ordering bugs, and made adding a toolkit a multi-file change.

## Decision

A toolkit is a self-contained module that exports a `ToolkitManifest` and
optionally a `register.ts` for UI/command registration plus a `*Bot.ts` for
chat delegations.

- `ToolkitModule` carries `manifest`, command definitions, optional bot.
- All toolkits register through a single entry point: `src/toolkits/index.ts`.
- `main.tsx` performs exactly one `import "@/toolkits"` for boot.
- Chat-agent registration is exposed via the `useToolkitChatAgents()` hook
  and consumed by `CommandContextProvider` only.

Adding a new toolkit is a one-line change in `@/toolkits/index.ts`.

## Consequences

- ✅ Deterministic boot order; no HMR double-registration.
- ✅ One canonical place to find every toolkit.
- ✅ Bot delegations no longer bypass the shared chat pipeline.
- ⚠️ Toolkits cannot lazy-load their command sets at first request; a future
  ADR may reintroduce dynamic registration if bundle size becomes an issue.

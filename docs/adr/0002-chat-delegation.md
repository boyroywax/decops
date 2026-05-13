# ADR 0002 — Chat Delegation Model

- **Status:** Accepted
- **Date:** 2026-05-13

## Context

Multiple toolkits (libp2p, studio, architect, image-gen) want to participate
in chat by injecting their own system prompt, tool subset, and provider
choice. Previously libp2p had its own `onSubmit` path that bypassed
`streamChatWithWorkspace`, leading to divergent behaviour for tool calls,
streaming, and error reporting.

## Decision

- Every chat-aware toolkit registers a `ChatDelegation` describing
  `{ id, label, systemPrompt, toolFilter, provider }`.
- All chat traffic — regardless of which delegation is active — flows
  through `runChatTurn()` in `src/services/ai/runner.ts`, which in turn uses
  `streamChatWithWorkspace`. Tool calls go through the unified
  `CommandRegistry.execute()` path, which enforces RBAC.
- Delegations are pure data; they do **not** own UI submit handlers. The
  active delegation is selected by user via the chat header.

## Consequences

- ✅ Single error/streaming/tool-call path; bug fixes apply uniformly.
- ✅ RBAC, timeouts, audit logging, and `outputSchema` work for every
  toolkit automatically.
- ✅ Delegations can be unit-tested as plain objects.
- ⚠️ A delegation cannot intercept submission to do custom pre-processing;
  bespoke flows must be modeled as commands instead.

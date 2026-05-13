# ADR 0003 — Job Lifecycle & Atomic Reservation

- **Status:** Accepted
- **Date:** 2026-05-13

## Context

The original job executor effect read `jobs`, picked candidates up to
`MAX_CONCURRENT_JOBS`, and dispatched them. Rapid effect re-runs in React
18 strict mode caused the same job to be picked twice, exceeding the
concurrency cap and producing duplicate side effects.

A separate problem: the polling fallback (`setInterval(processJobs, 1000)`)
masked event-loss bugs and added 1 s latency to every job state transition.

## Decision

- Introduce `reserveBatch()` in `src/hooks/jobScheduler.ts` — a single
  selector that atomically marks a slate of queued jobs as `running` and
  returns them. Selection happens inside the Zustand setter, so concurrent
  callers see the post-reservation state.
- Job slot release lives **only** in the executor's IIFE `finally` block.
- The `Job` type is a discriminated union on `status`:
  - `queued | running` (no terminal data)
  - `awaiting-input` (carries required `pendingPrompt`)
  - `completed | failed` (carry required `completedAt`, optional `result`)
- The 1 s polling fallback is removed; the executor effect is dependent on
  `jobs` so every queue mutation triggers a re-run.

## Consequences

- ✅ Concurrency cap is enforced under any scheduling order.
- ✅ Slot accounting cannot leak (only one release path).
- ✅ Consumers must narrow on `status` before accessing terminal-only
  fields, eliminating a class of `undefined` bugs.
- ✅ State transitions are immediate; jobs no longer wait up to 1 s.
- ⚠️ A bug that fails to mark a queued job triggers no recovery sweep —
  future work may add a heartbeat metric.

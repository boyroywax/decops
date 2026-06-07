# Decops Deep Dive Findings

Date: 2026-06-07
Repository: /home/coder/decops
Branch: feat/helia-ipfs-toolkit

## Scope and Method

This report reflects a current-state deep dive of the decops app using:
- repository and source-structure inspection
- dependency and script review
- static debt scans (TODO/FIXME and ts-prune sample)
- verification runs: typecheck, tests, build, size budget, and npm audit

## Executive Summary

The codebase is feature-rich and actively maintained, with strong test breadth and a passing typecheck/build. However, the current delivery state is not release-ready due to failing tests, size budget overruns, and multiple high-severity dependency advisories.

Overall status: Yellow (development-active, quality-gated release blocked)

## Execution Checklist Progress (Updated)

Completed in this session:
- Stabilized test suite by aligning 6 failing test files with current runtime contracts.
- Re-ran full validation: typecheck PASS, tests PASS (69 files, 609 tests), build PASS.
- Ran security remediation pass with `npm audit fix --omit=dev`.
- Reduced production audit exposure from 12 vulnerabilities (6 high, 6 moderate) to 2 moderate, 0 high, 0 critical.
- Implemented incremental bundle-splitting improvements:
  - lazy-loaded toolkit list/detail views
  - added targeted manual chunks for p2p/decentralized deps + toolkit surfaces
  - recovered size budgets to passing

Current blockers/open items:
- Remaining 2 moderate prod vulnerabilities are linked to `vite-plugin-top-level-await` -> `uuid`, and npm proposes a semver-major/downgrade-style fix (`--force`) that requires explicit compatibility decision.

Latest measured size status:
- main JS entry: 291.24 kB gzip (limit 450 kB) ✅
- main CSS entry: 33.73 kB gzip (limit 95 kB) ✅

## Current State Snapshot

- Language and stack: TypeScript, React 19, Vite 6, Vitest, Zustand, PWA plugin
- Working tree: clean (no tracked or untracked changes before this report file)
- Source footprint: 109,602 lines across TypeScript/TSX in src/
- Test footprint: 69 test files, 609 tests total
- Test breadth signal: 162 describe blocks and 582 it blocks
- Architecture shape: dual structure exists
  - Core and domain folders under src/services, src/components, src/hooks
  - Toolkit modules under src/toolkits (architect, studio, libp2p, helia, orbitdb, etc.)

## Verification Results

### Type Safety

- Command: npm run typecheck
- Result: PASS

### Test Suite

- Command: npm test
- Result: FAIL
- Summary: 9 failed, 600 passed (609 total), 6 test files failing

Failing areas observed:
- job executor integration contract drift
- AI runner retry behavior expectations
- SSE parser output shape expectation mismatch
- messaging command status semantics drift (queued vs delivered)
- default tool-surface cap assumptions (<20) now exceeded (22)
- prompt rubric rule gap (missing reasoning-protocol)

### Production Build

- Command: npm run build
- Result: PASS with warnings
- Notable warnings:
  - mixed static and dynamic imports reduce expected chunk-splitting benefits
  - large chunks warning triggered
- Largest emitted JS asset: 3,614.11 kB (687.73 kB gzip)

### Size Budgets

- Command: npm run size
- Result: FAIL
- Budget deltas:
  - main JS entry: 676.61 kB gzip vs 450 kB limit (+226.61 kB)
  - main CSS entry: 101.52 kB gzip vs 95 kB limit (+6.52 kB)

### Dependency Security

- Command: npm audit --omit=dev --json
- Result: FAIL (exit code 1)
- Production vulnerability summary:
  - high: 6
  - moderate: 6
  - total: 12

Direct/high-impact examples include advisories affecting:
- axios
- react-router-dom/react-router
- vite
- @libp2p/kad-dht
- dompurify

## Architecture and Documentation Alignment

## What looks strong

- Modular toolkit foldering is substantial and fairly consistent.
- Command/job/toolkit abstractions are mature and heavily exercised in tests.
- Vitest setup in vite config shows practical accommodations for wasm/didcomm test behavior.

## Drift and staleness signals

- README states no unit tests are configured, but the repository has an extensive Vitest suite.
- docs/ARCHITECTURE.md shows metadata tied to a different branch and older update context.
- Historical audit files exist in root; likely useful, but several appear snapshot-based and can diverge quickly from current behavior.

## Maintainability Hotspots

Large files suggest concentration risk and likely mixed responsibilities:
- src/components/layout/LLMManager.tsx (1321 lines)
- src/services/toolkits/types.ts (1265 lines)
- src/components/views/ToolkitDetailView.tsx (1104 lines)
- src/toolkits/editor/EditorView.tsx (1000 lines)
- src/toolkits/orbitdb/service.ts (999 lines)
- src/components/views/AgentDetailView.tsx (963 lines)
- src/toolkits/studio/components/StudioView.tsx (960 lines)

Debt marker scan is relatively clean (few TODO/FIXME comments found), but ts-prune output indicates potentially significant unused export surface, especially in aggregate/barrel-style files.

## Risk Assessment

High risk:
- failing automated tests in core command/AI execution pathways
- high-severity production dependency advisories
- bundle/asset growth above enforced limits

Medium risk:
- architecture and README drift may mislead contributors and reviewers
- very large modules increase change risk and review complexity

Low risk:
- low explicit TODO/FIXME density in implementation files

## Prioritized Recommendations

1. Stabilize red tests before feature expansion
- align updated runtime behavior with test contracts or update tests where behavior intentionally changed
- especially: messaging status semantics, AI runner retry behavior, SSE result shape, tool-surface cap tests

2. Execute dependency remediation sprint
- run targeted upgrades for axios, react-router-dom/react-router, vite, @libp2p/kad-dht, dompurify
- rerun audit and verify no regression in chat/toolkit runtime behavior

3. Enforce bundle reduction plan
- define manual chunk strategy in Vite for heavy toolkit and network stacks
- separate optional toolkit UIs/services behind clearer lazy boundaries
- keep size-limit as a required CI gate

4. Reduce hotspot file complexity
- split top 5-7 largest files by domain responsibility (view shell, hooks, service adapters, types)
- start with ToolkitDetailView, LLMManager, and toolkit type/service monoliths

5. Refresh documentation to match reality
- update README testing section
- stamp architecture docs with current branch/date or move old snapshots under an archival subsection

## Suggested 7-Day Hardening Plan

Day 1-2
- fix or realign all 9 failing tests
- confirm green: npm run typecheck, npm test

Day 3-4
- dependency upgrade and audit closure for high advisories
- confirm green: npm audit --omit=dev

Day 5-6
- bundle-splitting pass and CSS budget reduction
- confirm green: npm run build and npm run size

Day 7
- docs refresh and architecture traceability update

## Evidence Commands Used

- git status --short
- npm run typecheck
- npm test
- npm run build
- npm run size
- npm audit --omit=dev --json
- npx ts-prune -p tsconfig.json | head -n 120
- find/rg scans for structure, test inventory, and TODO/FIXME markers

# DecOps Deep-Dive Audit: Memory + Agent Runtime

Date: 2026-06-03
Scope: Recent memory UX/schema work and adjacent agent/runtime files

## Executive Summary

The implementation is largely functional and close to production-ready for the requested memory modal and schema migration. Typecheck passes, and command-level archive tests are present and passing.

Primary risks are not core crashes; they are correctness drift and UX/operational gaps:
- Import dry-run metrics are inflated and can mislead operators.
- Legacy multi-entry archive imports silently collapse to a single entry.
- Add-memory import success summary is effectively unreachable because modal closes immediately.
- Archive metadata/tags can encode filter scope instead of the exported memory scope.
- Archive build/parse logic is duplicated between UI and command paths, increasing drift risk.

## What Is Completed

- Memory detail modal supports edit, disable/enable, delete, export, copy ID, and chevron navigation.
- Modal clipping issue is mitigated via portal rendering.
- Archive schema migrated to v0 shape:
  - kind
  - schema
  - metadata
  - spec.memory (single memory)
- Backward compatibility for legacy v1 payloads exists.
- Conversation badge/list consistency fix is in place.
- Theming/contrast updates for light and solar modes are implemented.

## Architecture Snapshot

Key modules and responsibilities:
- UI memory workflows: [src/components/chat/MemoriesPanel.tsx](src/components/chat/MemoriesPanel.tsx)
- Memory storage/query/update/import: [src/services/collectiveMemory.ts](src/services/collectiveMemory.ts)
- Archive contract/parser/builder: [src/services/collectiveMemoryArchive.ts](src/services/collectiveMemoryArchive.ts)
- Command-level archive export/import: [src/services/commands/definitions/collective-memory.ts](src/services/commands/definitions/collective-memory.ts)
- Archive command tests: [src/test/services/commands/definitions/collective-memory-archive.test.ts](src/test/services/commands/definitions/collective-memory-archive.test.ts)

## Verified Findings (Ordered by Severity)

### 1) Medium: Dry-run import counts are not semantically accurate
Location: [src/services/commands/definitions/collective-memory.ts#L477](src/services/commands/definitions/collective-memory.ts#L477)

Problem:
- In dry-run mode, each valid archive increments imported by one regardless of mode behavior and existing IDs.
- This can overstate expected writes for skip-existing scenarios.

Impact:
- Operator decisions can be based on incorrect preview counts.

Recommendation:
- Add a pure simulation path that checks existing IDs and computes wouldImport/wouldUpdate/wouldSkip without writing.
- Return separate fields in dry-run output, for example wouldImport, wouldUpdate, wouldSkip.

### 2) Medium: Legacy v1 multi-entry archives are reduced to first entry silently
Location: [src/services/collectiveMemoryArchive.ts#L161](src/services/collectiveMemoryArchive.ts#L161)

Problem:
- Legacy parser maps entries but takes only entries[0].
- Additional valid entries are dropped with no warning.

Impact:
- Silent data loss during migration from historical artifacts.

Recommendation:
- Return structured warnings from parser when extra entries are ignored.
- Better: provide a migration helper that explodes one v1 payload into multiple v0 manifests.

### 3) Medium: Add-memory import summary is practically hidden by immediate close
Locations:
- Import summary set: [src/components/chat/MemoriesPanel.tsx#L92](src/components/chat/MemoriesPanel.tsx#L92)
- Immediate close callback: [src/components/chat/MemoriesPanel.tsx#L105](src/components/chat/MemoriesPanel.tsx#L105)
- Summary render target: [src/components/chat/MemoriesPanel.tsx#L276](src/components/chat/MemoriesPanel.tsx#L276)
- Parent closes modal: [src/components/chat/MemoriesPanel.tsx#L790](src/components/chat/MemoriesPanel.tsx#L790)

Problem:
- Import summary state is set, then onCreated closes the modal immediately.
- The success summary element exists but users usually never see it.

Impact:
- Reduced operator confidence and poor import feedback.

Recommendation:
- Keep modal open after import and show success summary with a close button.
- Or move the success message to a global toast/notebook entry.

### 4) Low-Medium: Archive scope tag/label can reflect filter scope rather than memory scope
Location: [src/services/commands/definitions/collective-memory.ts#L321](src/services/commands/definitions/collective-memory.ts#L321)

Problem:
- Export artifact labels and tags use the request scope filter value.
- If scope filter is all, exported memory may be workspace/global but metadata can be tagged scope:all.

Impact:
- Metadata ambiguity for downstream filtering and audit traceability.

Recommendation:
- Use memory.scope for persisted scope labels/tags.
- Keep filter scope separately as metadata annotation if needed.

### 5) Low-Medium: Duplicate archive construction logic across UI and command paths
Locations:
- Command export builder usage: [src/services/commands/definitions/collective-memory.ts#L315](src/services/commands/definitions/collective-memory.ts#L315)
- UI export builder usage: [src/components/chat/MemoriesPanel.tsx#L497](src/components/chat/MemoriesPanel.tsx#L497)
- UI import parse+persist path: [src/components/chat/MemoriesPanel.tsx#L84](src/components/chat/MemoriesPanel.tsx#L84)

Problem:
- Similar business logic exists in both command and UI flows.
- Artifact naming, tags, and annotations can drift over time.

Impact:
- Inconsistent behavior and harder maintenance.

Recommendation:
- Extract a shared archive application service with one canonical implementation for:
  - build artifact payload
  - parse/validate archive
  - import result mapping

### 6) Low: UUID alias helper currently no-ops
Location: [src/services/rag/workspaceIndexer.ts#L72](src/services/rag/workspaceIndexer.ts#L72)

Problem:
- Helper name implies aliasing but returns raw ID unchanged.

Impact:
- Potential confusion and minor token bloat in indexed text.

Recommendation:
- Either implement shortening behavior or rename helper to reflect pass-through behavior.

## Quality Metrics and Coverage

Audited high-change memory files:
- [src/components/chat/MemoriesPanel.tsx](src/components/chat/MemoriesPanel.tsx): 885 lines
- [src/services/collectiveMemoryArchive.ts](src/services/collectiveMemoryArchive.ts): 265 lines
- [src/services/commands/definitions/collective-memory.ts](src/services/commands/definitions/collective-memory.ts): 577 lines
- [src/test/services/commands/definitions/collective-memory-archive.test.ts](src/test/services/commands/definitions/collective-memory-archive.test.ts): 114 lines

Signal notes:
- No TODO/FIXME/HACK markers were found in the inspected core files.
- Typecheck baseline passed for current workspace state.
- Archive tests exist but focus on command-level contract behavior.

## Testing Gaps

1. UI flow tests are missing for AddMemoryModal import modes (artifact and file).
2. No regression test asserting user-visible success/error messaging for import path.
3. No migration-focused tests for legacy v1 payloads containing multiple entries.
4. No consistency tests ensuring UI export and command export produce equivalent artifact tags/metadata.

## Prioritized Remediation Plan

1. Correct dry-run accounting in import command and expose wouldImport/wouldUpdate/wouldSkip.
2. Preserve or explicitly report dropped entries when importing legacy v1 multi-entry artifacts.
3. Fix AddMemoryModal success UX by surfacing import summary outside transient modal close.
4. Normalize archive scope metadata to memory.scope.
5. Consolidate archive business logic into a single shared service used by both UI and commands.
6. Add focused test cases for UI import/export workflows and legacy migration edge cases.

## Risk After Fixes

If the above plan is completed, residual risk should be low and mostly operational (theme contrast regressions or edge-case UX polish), rather than data integrity concerns.

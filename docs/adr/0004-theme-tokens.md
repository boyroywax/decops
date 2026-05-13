# ADR 0004 — Theme Tokens

- **Status:** Accepted
- **Date:** 2026-05-13

## Context

Earlier toolkits hardcoded slate-palette hex literals (`#1e293b`,
`#94a3b8`, `#475569`, …) directly in component CSS. Adding the light and
solar themes required either duplicating every selector or `[data-theme]`
overrides per literal — the latter accumulated 100+ overrides and frequent
drift between theme variants.

## Decision

- All neutral colors (text, background, border) reference tokens defined in
  `src/styles/design-tokens.css` and overridden in `theme-light.css` and
  `theme-solar.css`.
- The canonical token set:
  - `--text-primary`, `--text-secondary`, `--text-muted`, `--text-ghost`
  - `--bg-primary`, `--bg-surface`, `--bg-surface-hover`, `--bg-modal`
  - `--border-medium`
- Token references **always** include a fallback: `var(--text-primary, #e4e4e7)`.
  This guarantees the dark default if the design-tokens stylesheet fails to
  load.
- Brand / per-node accent colors (e.g. `#06b6d4` for storage, `#a855f7`
  for deliverable, `#22d3ee` for cyan) are **not** tokenized — they carry
  semantic meaning per node type and are deliberately consistent across
  themes.

## Consequences

- ✅ Adding a new theme is a single CSS file with token overrides.
- ✅ One source of truth for the neutral palette.
- ✅ Fallback values guarantee no flash-of-unstyled-text.
- ⚠️ Authors must distinguish brand vs neutral colors when adding new
  styles; lint rule pending in §10 follow-up work.

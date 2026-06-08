# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-06-08

Initial public pre-release of the Decops Mesh Workspace — a decentralized
agent collaboration platform UI for creating and managing multi-agent mesh
networks.

### Added
- Workspace → Ecosystem → Network → Group/Channel → Agent hierarchy with
  Zustand-backed state.
- Agent runtime with cognition protocol, autonomy levels, and a job executor.
- Command registry with RBAC enforcement and toolkit-backed tool surfaces.
- Built-in toolkits: libp2p, Helia, Kubo, OrbitDB, OrbitDB server, web crawler,
  navigator, orchestrator, studio, editor, architect, and cognition.
- AI provider integrations (Anthropic, OpenAI, OpenRouter) with SSE streaming.
- Structured logging service (audit + error backends) and an `ErrorBoundary`.
- Progressive Web App support via `vite-plugin-pwa`.
- Strict TypeScript, Vitest suite (609 tests), CI workflow, and bundle-size
  budgets.

### Changed
- Toolkit detail views are lazy-loaded and vendor bundles are split into
  dedicated chunks to keep the main bundle within budget.

### Removed
- Non-functional placeholder "Quick Actions" controls in the web-crawler
  toolkit detail view; the underlying `fetch_url` and `crawl_site` commands
  remain available to agents through the command registry.

### Security
- Reduced production dependency vulnerabilities to 2 moderate (0 high/critical).
  The remaining advisories are transitive (`uuid` via
  `vite-plugin-top-level-await`) and have no runtime impact; a fix requires a
  semver-major bump and is deferred.

[0.0.1]: https://github.com/boyroywax/decops/releases/tag/v0.0.1

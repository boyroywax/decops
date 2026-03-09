/**
 * ToolkitRegistry — central registry for OCI-compliant, modular toolkit modules.
 *
 * Manages the full lifecycle of ToolkitModule instances:
 *
 *   Registration / Lifecycle
 *   • register     — load, validate dependencies, activate a kit
 *   • unregister   — teardown, remove commands, delete from registry
 *
 *   Queries
 *   • get / getAll / isRegistered — lookup by ID or get all
 *   • getByCategory / getByLabel  — filtered queries
 *   • getFacets                   — introspect which facets a kit provides
 *
 *   OCI Packaging
 *   • pack         — serialize a module into an OCI artifact manifest
 *   • unpack       — deserialize an OCI artifact manifest into a module shell
 *   • getOCIRef    — build an OCI reference for push/pull
 *
 *   Legacy
 *   • toToolkit / getAllAsToolkits — backward-compatible Toolkit[] export
 *
 *   Subscription
 *   • subscribe    — react to registry changes (for UI re-renders)
 *
 * The registry delegates command registration to the existing CommandRegistry,
 * so all commands continue to work with the job executor, tool-use bridge,
 * and Studio visual editor without any changes.
 */

import type { Toolkit, ToolkitCategory } from "@/types";
import type { CommandRegistry } from "@/services/commands/registry";
import type {
  ToolkitModule,
  ToolkitContext,
  ToolkitFacet,
  OCIArtifactManifest,
  OCIDescriptor,
  OCILayer,
  OCIReference,
} from "./types";

export class ToolkitRegistry {
  private modules = new Map<string, ToolkitModule>();
  private commandRegistry: CommandRegistry;
  private listeners = new Set<() => void>();

  constructor(commandRegistry: CommandRegistry) {
    this.commandRegistry = commandRegistry;
  }

  // ── Registration ────────────────────────────────

  /**
   * Register a toolkit module.
   * All of its commands are added to the global CommandRegistry and its
   * optional `init` hook is called.
   */
  async register(module: ToolkitModule): Promise<void> {
    const id = module.manifest.id;

    if (this.modules.has(id)) {
      console.warn(`Toolkit "${id}" already registered — unregistering first.`);
      await this.unregister(id);
    }

    // Validate dependencies (including version tiers)
    if (module.manifest.dependencies) {
      for (const dep of module.manifest.dependencies) {
        const depModule = this.modules.get(dep.id);
        if (!depModule) {
          if (!dep.optional) {
            console.warn(
              `Toolkit "${id}" depends on "${dep.id}" (${dep.version}) which is not registered.`
            );
          }
          continue;
        }

        const depVersion = depModule.manifest.version;

        // Check minimum version (hard floor)
        if (dep.minimumVersion && depVersion < dep.minimumVersion) {
          console.warn(
            `Toolkit "${id}" requires "${dep.id}" >= ${dep.minimumVersion} ` +
            `but ${depVersion} is registered. Kit may not function correctly.`
          );
        }

        // Check recommended version (soft warning)
        if (dep.recommendedVersion && depVersion < dep.recommendedVersion) {
          console.info(
            `Toolkit "${id}": dependency "${dep.id}" is at ${depVersion}, ` +
            `recommended ${dep.recommendedVersion}. Consider upgrading.`
          );
        }

        // Log latest version availability (informational)
        if (dep.latestVersion && depVersion < dep.latestVersion) {
          console.debug(
            `Toolkit "${id}": dependency "${dep.id}" has newer version ` +
            `${dep.latestVersion} available (current: ${depVersion}).`
          );
        }
      }
    }

    // Register every command owned by this toolkit
    for (const cmd of module.commands) {
      this.commandRegistry.register(cmd);
    }

    // Add the module to the registry BEFORE running init so that
    // subsequently registered modules can see this one during their
    // dependency validation (important for synchronous registration
    // loops like `initializeToolkits`).
    this.modules.set(id, module);

    // Run lifecycle init hook
    if (module.init) {
      const ctx: ToolkitContext = { commandRegistry: this.commandRegistry };
      await module.init(ctx);
    }

    this.notify();
  }

  /**
   * Unregister a toolkit — run its `destroy` hook, remove its commands, and
   * delete it from the registry.
   */
  async unregister(id: string): Promise<void> {
    const module = this.modules.get(id);
    if (!module) return;

    // Run lifecycle destroy hook
    if (module.destroy) {
      await module.destroy();
    }

    // Remove commands from global registry
    for (const cmd of module.commands) {
      this.commandRegistry.unregister(cmd.id);
    }

    this.modules.delete(id);
    this.notify();
  }

  // ── Queries ─────────────────────────────────────

  get(id: string): ToolkitModule | undefined {
    return this.modules.get(id);
  }

  getAll(): ToolkitModule[] {
    return Array.from(this.modules.values());
  }

  isRegistered(id: string): boolean {
    return this.modules.has(id);
  }

  /** Filter registered kits by category. */
  getByCategory(category: ToolkitCategory): ToolkitModule[] {
    return this.getAll().filter((m) => m.manifest.category === category);
  }

  /** Filter registered kits by a label key-value pair. */
  getByLabel(key: string, value: string): ToolkitModule[] {
    return this.getAll().filter((m) => m.manifest.labels?.[key] === value);
  }

  /**
   * Introspect which facets a given kit provides.
   * Returns the set of non-empty facet names.
   */
  getFacets(id: string): ToolkitFacet[] {
    const mod = this.modules.get(id);
    if (!mod) return [];

    const facets: ToolkitFacet[] = ["metadata"]; // always present

    if (mod.commands.length > 0) facets.push("commands");
    if (mod.tools.length > 0) facets.push("tools");
    if (mod.agents && mod.agents.length > 0) facets.push("agents");
    if (mod.jobs && mod.jobs.length > 0) facets.push("jobs");
    if (mod.automations && mod.automations.length > 0) facets.push("automations");
    if (mod.tasks && mod.tasks.length > 0) facets.push("tasks");
    if (mod.collections && mod.collections.length > 0) facets.push("collections");
    if (mod.ui) facets.push("ui");
    if (mod.configuration) facets.push("configuration");
    if (mod.logging) facets.push("logging");
    if (mod.notifications) facets.push("notifications");
    if (mod.metrics) facets.push("metrics");
    if (mod.rbac) facets.push("rbac");
    if (mod.tests) facets.push("tests");
    if (mod.docs) facets.push("docs");
    if (mod.api) facets.push("api");

    return facets;
  }

  // ── OCI Packaging ───────────────────────────────

  /**
   * Pack a ToolkitModule into an OCI artifact manifest.
   *
   * This creates a content-addressable manifest where each facet is
   * represented as a layer.  The manifest can then be pushed to any
   * OCI-compatible registry (Harbor, GHCR, Docker Hub, etc.).
   *
   * NOTE: In-browser we create a *logical* manifest.  Actual blob storage
   * and digest computation requires a server-side OCI client.
   */
  pack(module: ToolkitModule): OCIArtifactManifest {
    const facets = this.getFacets(module.manifest.id);

    const configDescriptor: OCIDescriptor = {
      mediaType: "application/vnd.decops.kit.config.v1+json",
      digest: `sha256:${this.pseudoDigest(JSON.stringify(module.manifest))}`,
      size: JSON.stringify(module.manifest).length,
      annotations: {
        "org.opencontainers.image.title": module.manifest.name,
        "org.opencontainers.image.version": module.manifest.version,
        "org.opencontainers.image.description": module.manifest.description,
      },
    };

    const layers: OCILayer[] = facets.map((facet) => {
      const data = this.facetData(module, facet);
      const json = JSON.stringify(data);
      return {
        mediaType: `application/vnd.decops.kit.${facet}.v1+json`,
        digest: `sha256:${this.pseudoDigest(json)}`,
        size: json.length,
        facet,
        annotations: {
          "dev.decops.kit.facet": facet,
        },
      };
    });

    return {
      schemaVersion: 2,
      mediaType: "application/vnd.decops.kit.manifest.v1+json",
      config: configDescriptor,
      layers,
      annotations: {
        "org.opencontainers.image.created":
          module.manifest.createdAt ?? new Date().toISOString(),
        "org.opencontainers.image.version": module.manifest.version,
        "org.opencontainers.image.title": module.manifest.name,
        ...(module.manifest.author
          ? { "org.opencontainers.image.authors": module.manifest.author.name }
          : {}),
        ...(module.manifest.license
          ? { "org.opencontainers.image.licenses": module.manifest.license }
          : {}),
        ...(module.manifest.repository
          ? { "org.opencontainers.image.source": module.manifest.repository }
          : {}),
      },
    };
  }

  /**
   * Build an OCI reference for a kit (for push/pull operations).
   */
  getOCIRef(
    module: ToolkitModule,
    registryHost = "registry.decops.io"
  ): OCIReference {
    return {
      registry: registryHost,
      repository: `decops/kits/${module.manifest.id}`,
      reference: module.manifest.version,
    };
  }

  /** Extract the data for a given facet from a module (for OCI layer serialization). */
  private facetData(
    module: ToolkitModule,
    facet: ToolkitFacet
  ): unknown {
    const mapping: Record<ToolkitFacet, unknown> = {
      metadata: module.manifest,
      commands: module.commands.map((c) => ({
        id: c.id,
        description: c.description,
      })),
      tools: module.tools,
      agents: module.agents ?? [],
      jobs: module.jobs ?? [],
      automations: module.automations ?? [],
      tasks: module.tasks ?? [],
      collections: module.collections ?? [],
      ui: module.ui ?? module.app ?? null,
      configuration: module.configuration ?? null,
      logging: module.logging ?? module.logs ?? null,
      notifications: module.notifications ?? null,
      metrics: module.metrics
        ? { definitions: module.metrics.definitions }
        : null,
      rbac: module.rbac ?? null,
      tests: module.tests ?? null,
      docs: module.docs ?? null,
      api: module.api ?? null,
    };
    return mapping[facet];
  }

  /**
   * Generate a pseudo-digest for in-browser use.
   * Real OCI implementations use sha256 over the raw blob bytes.
   */
  private pseudoDigest(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }

  // ── Legacy compat ───────────────────────────────

  /**
   * Convert a single module into the legacy `Toolkit` shape consumed by the
   * UI components and AI prompt builder.
   */
  toToolkit(module: ToolkitModule): Toolkit {
    return {
      ...module.manifest,
      commands: module.commands.map((c) => c.id),
      tools: module.tools,
      agents: module.agents,
      app: module.ui?.app ?? module.app,
      jobTemplates: module.jobs?.map((j) => j.id),
      automations: module.automations?.map((a) => a.id),
      activityEnabled: module.activity?.enabled ?? true,
      configFieldCount: module.configuration?.fields.length ?? 0,
      metricCount: module.metrics?.definitions.length ?? 0,
      taskCount: module.tasks?.length ?? 0,
      collectionCount: module.collections?.length ?? 0,
      notificationCount: module.notifications?.templates.length ?? 0,
      permissionCount: module.rbac?.permissions.length ?? 0,
      testCount: module.tests?.tests.length ?? 0,
      docCount: module.docs?.documents.length ?? 0,
      endpointCount: module.api?.endpoints.length ?? 0,
      facets: this.getFacets(module.manifest.id).length > 0
        ? this.getFacets(module.manifest.id)
        : undefined,
    };
  }

  /** Build the full TOOLKITS-style array from all registered modules. */
  getAllAsToolkits(): Toolkit[] {
    return this.getAll().map((m) => this.toToolkit(m));
  }

  // ── Subscription ────────────────────────────────

  /**
   * Subscribe to registry changes (toolkit added / removed).
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error("ToolkitRegistry listener error:", e);
      }
    }
  }
}

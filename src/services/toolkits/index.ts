/**
 * Toolkit Module System — public API.
 *
 * Usage:
 *   import { toolkitRegistry, initializeToolkits, TOOLKITS } from "@/services/toolkits";
 *
 * Call `initializeToolkits()` once at startup (before React renders).
 * After that, `TOOLKITS` contains the legacy Toolkit[] array derived from
 * the registered modules, and `toolkitRegistry` can be used to query,
 * register, or unregister toolkit modules at runtime.
 *
 * OCI packaging:
 *   const manifest = toolkitRegistry.pack(module);
 *   const ref = toolkitRegistry.getOCIRef(module, "ghcr.io");
 */

// ── Type exports (all 17 facets + OCI) ───────────

export type {
  // Module & lifecycle
  ToolkitModule,
  ToolkitManifest,
  ToolkitContext,
  ToolkitFacet,
  // OCI
  OCIDescriptor,
  OCILayer,
  OCIArtifactManifest,
  OCIReference,
  // Metadata
  ToolkitAuthor,
  ToolkitDependency,
  // App / UI
  ToolkitApp,
  ToolkitUI,
  ToolkitUIContribution,
  UIContributionType,
  PlatformTarget,
  // Jobs
  ToolkitJobTemplate,
  ToolkitJobStep,
  ToolkitJobInput,
  ToolkitJobOutput,
  // Automations
  ToolkitAutomation,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationAction,
  // Tasks
  ToolkitTask,
  TaskChecklistItem,
  TaskPriority,
  TaskStatus,
  // Collections
  ToolkitCollection,
  CollectionField,
  CollectionFieldType,
  CollectionIndex,
  // Configuration
  ToolkitConfigField,
  ToolkitConfiguration,
  // Logging
  ToolkitLogEntry,
  ToolkitLogConfig,
  ToolkitLogLevel,
  ToolkitLogChannel,
  ToolkitLogging,
  // Notifications
  ToolkitNotifications,
  ToolkitNotificationTemplate,
  NotificationChannel,
  NotificationPriority,
  // Metrics
  ToolkitMetric,
  ToolkitMetricsProvider,
  // RBAC
  ToolkitRBAC,
  ToolkitRole,
  ToolkitPermission,
  PermissionAction,
  // Tests
  ToolkitTestSuite,
  ToolkitTest,
  TestAssertion,
  TestType,
  // Docs
  ToolkitDocs,
  ToolkitDoc,
  DocType,
  // API
  ToolkitAPI,
  ToolkitAPIEndpoint,
  HTTPMethod,
  // Activity
  ToolkitActivityEntry,
} from "./types";

export { ToolkitRegistry } from "./registry";

import type { Toolkit } from "@/types";
import { registry as commandRegistry } from "@/services/commands/registry";
import { ToolkitRegistry } from "./registry";
import { builtinModules } from "./builtins";

// ── Singleton ────────────────────────────────────

/** Global toolkit registry instance. */
export const toolkitRegistry = new ToolkitRegistry(commandRegistry);

// ── Legacy compat ────────────────────────────────

/**
 * TOOLKITS array — backward-compatible export.
 *
 * Populated by `initializeToolkits()`.  Consumers that previously imported
 * `TOOLKITS` from `@/constants` now get this via a re-export.
 *
 * For new code prefer `toolkitRegistry.getAllAsToolkits()` or
 * `toolkitRegistry.get(id)` directly.
 */
export let TOOLKITS: Toolkit[] = [];

// ── Initialization ───────────────────────────────

/**
 * Register all built-in toolkit modules.
 * Should be called once at startup before the React tree mounts.
 */
export function initializeToolkits(): void {
  for (const mod of builtinModules) {
    // register is async-capable but built-in modules are synchronous
    toolkitRegistry.register(mod);
  }

  // Populate the legacy TOOLKITS array
  TOOLKITS = toolkitRegistry.getAllAsToolkits();
}

/**
 * Logging toolkit module.
 *
 * Facets: metadata, commands, tools, collections, configuration,
 *         logging, metrics, rbac, docs, activity
 *
 * This is the platform's built-in logging toolkit.  It owns the
 * LogAggregator service, provides commands for querying / publishing
 * logs, and ships modular backends (console, file, IPFS, IPLD, HTTP).
 *
 * Dependencies: none (core toolkit — other kits may depend on it).
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import {
  logQueryCommand,
  logPublishCommand,
  logListChannelsCommand,
  logListSinksCommand,
  logAddSinkCommand,
  logRemoveSinkCommand,
  logClearCommand,
  logFlushCommand,
  logRootCidsCommand,
} from "@/services/commands/definitions/logging";
import { getLogAggregator } from "@/services/logging/aggregator";

export const loggingModule: ToolkitModule = {
  manifest: {
    id: "logging",
    name: "Logging",
    description:
      "Centralized, channel-based logging with modular backends. " +
      "Aggregates logs from all toolkits into a single source of truth. " +
      "Supports console, file, IPFS/IPLD (decentralized), HTTP, and custom sinks.",
    icon: "ScrollText",
    color: "#06b6d4",
    gradient: ["#06b6d4", "#22d3ee"],
    category: "system",
    status: "available",
    builtIn: true,
    tags: [
      "logging",
      "observability",
      "ipfs",
      "ipld",
      "decentralized",
      "aggregation",
      "channels",
      "sinks",
      "structured-logging",
    ],
    labels: { tier: "core", domain: "observability", owner: "platform-team" },
    version: "2.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2026-03-09T00:00:00Z",
    // No dependencies — this is a foundational kit that others depend on.
    dependencies: [],
    minPlatformVersion: "1.0.0",
  },

  // ── Commands ──────────────────────────────────

  commands: [
    logQueryCommand,
    logPublishCommand,
    logListChannelsCommand,
    logListSinksCommand,
    logAddSinkCommand,
    logRemoveSinkCommand,
    logClearCommand,
    logFlushCommand,
    logRootCidsCommand,
  ],

  // ── Tools (MCP / function-calling) ────────────

  tools: [
    {
      id: "logging.query",
      name: "Query Logs",
      description:
        "Search the aggregated platform log by kit, channel, level, time range, tag, or CID.",
      commandId: "log_query",
      inputSchema: {
        type: "object",
        properties: {
          sourceKit: { type: "string", description: "Filter by source toolkit" },
          channel: { type: "string", description: "Filter by channel" },
          minLevel: {
            type: "string",
            enum: ["trace", "debug", "info", "warn", "error", "fatal"],
            description: "Minimum severity level",
          },
          since: { type: "string", description: "ISO-8601 start time" },
          until: { type: "string", description: "ISO-8601 end time" },
          limit: { type: "number", description: "Max entries (default 50)" },
          tag: { type: "string", description: "Filter by tag" },
        },
      },
    },
    {
      id: "logging.publish",
      name: "Publish Log Entry",
      description: "Publish a structured log entry to the aggregator.",
      commandId: "log_publish",
      inputSchema: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["trace", "debug", "info", "warn", "error", "fatal"] },
          message: { type: "string" },
          channel: { type: "string" },
          sourceKit: { type: "string" },
          data: { type: "object" },
        },
        required: ["level", "message"],
      },
    },
    {
      id: "logging.addSink",
      name: "Add Log Sink",
      description:
        "Dynamically add a logging backend (console, file, IPFS, IPLD, HTTP, or custom).",
      inputSchema: {
        type: "object",
        properties: {
          config: {
            type: "object",
            description: "LogSinkConfig — must include id, name, type, enabled, and backend-specific block",
          },
        },
        required: ["config"],
      },
    },
    {
      id: "logging.rootCids",
      name: "Get Root CIDs",
      description:
        "List content-addressable root CIDs from IPFS/IPLD sinks for log verification.",
      inputSchema: { type: "object", properties: {} },
    },
  ],

  // ── Collections ───────────────────────────────

  collections: [
    {
      id: "log_entries",
      name: "Log Entries",
      description: "Aggregated log entries from all toolkits.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "timestamp", type: "date", required: true, indexed: true },
        { name: "level", type: "enum", required: true, enumValues: ["trace", "debug", "info", "warn", "error", "fatal"], indexed: true },
        { name: "message", type: "string", required: true },
        { name: "sourceKit", type: "string", indexed: true },
        { name: "channel", type: "string", indexed: true },
        { name: "cid", type: "string", indexed: true },
        { name: "parentCid", type: "string" },
        { name: "data", type: "json" },
        { name: "tags", type: "array" },
      ],
      primaryKey: "id",
      indexes: [
        { fields: ["sourceKit", "timestamp"], name: "idx_kit_time" },
        { fields: ["channel", "level"], name: "idx_chan_level" },
        { fields: ["cid"], name: "idx_cid", unique: true },
      ],
      retention: { maxEntries: 50_000, maxAge: 7 * 24 * 60 * 60 * 1000, policy: "fifo" },
    },
    {
      id: "log_channels",
      name: "Log Channels",
      description: "Registered log channels across all toolkits.",
      schema: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "name", type: "string", required: true },
        { name: "description", type: "string" },
        { name: "minLevel", type: "enum", enumValues: ["trace", "debug", "info", "warn", "error", "fatal"] },
        { name: "persistent", type: "boolean" },
      ],
      primaryKey: "id",
    },
    {
      id: "log_sinks",
      name: "Log Sinks",
      description: "Active log sink configurations.",
      schema: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "name", type: "string", required: true },
        { name: "type", type: "enum", required: true, enumValues: ["console", "file", "ipfs", "ipld", "http", "syslog", "custom"] },
        { name: "enabled", type: "boolean", required: true },
        { name: "minLevel", type: "enum", enumValues: ["trace", "debug", "info", "warn", "error", "fatal"] },
      ],
      primaryKey: "id",
    },
  ],

  // ── Configuration ─────────────────────────────

  configuration: {
    fields: [
      {
        key: "globalMinLevel",
        label: "Global Min Level",
        description: "Minimum severity level for the aggregated log (entries below this are dropped)",
        type: "select",
        defaultValue: "debug",
        options: [
          { label: "Trace", value: "trace" },
          { label: "Debug", value: "debug" },
          { label: "Info", value: "info" },
          { label: "Warn", value: "warn" },
          { label: "Error", value: "error" },
          { label: "Fatal", value: "fatal" },
        ],
      },
      {
        key: "maxEntries",
        label: "Max Entries",
        description: "Maximum log entries retained in the aggregated store (FIFO eviction)",
        type: "number",
        defaultValue: 10000,
      },
      {
        key: "ipfsApiUrl",
        label: "IPFS API URL",
        description: "IPFS HTTP API endpoint for decentralized logging (leave empty to disable)",
        type: "string",
        defaultValue: "",
      },
      {
        key: "ipfsPin",
        label: "IPFS Pin Entries",
        description: "Pin log entries on the IPFS node",
        type: "boolean",
        defaultValue: false,
      },
      {
        key: "ipldCodec",
        label: "IPLD Codec",
        description: "IPLD serialization codec for DAG log nodes",
        type: "select",
        defaultValue: "dag-cbor",
        options: [
          { label: "DAG-CBOR", value: "dag-cbor" },
          { label: "DAG-JSON", value: "dag-json" },
          { label: "DAG-PB", value: "dag-pb" },
        ],
      },
      {
        key: "consoleColor",
        label: "Console Colors",
        description: "Enable colored output in the console sink",
        type: "boolean",
        defaultValue: true,
      },
    ],
  },

  // ── Logging (self-referential) ────────────────

  logging: {
    config: { minLevel: "info", maxEntries: 1000 },
    channels: [
      {
        id: "logging.lifecycle",
        name: "Logging Lifecycle",
        description: "Sink/channel registration and deregistration events",
        persistent: true,
      },
      {
        id: "logging.errors",
        name: "Logging Errors",
        description: "Errors from sink backends (flush failures, connection issues)",
        minLevel: "error",
        persistent: true,
      },
      {
        id: "logging.aggregation",
        name: "Log Aggregation",
        description: "Cross-kit aggregation events and statistics",
      },
      {
        id: "logging.ipfs",
        name: "IPFS/IPLD Events",
        description: "CID creation, DAG node updates, pin operations",
        persistent: true,
      },
    ],
    // The logging toolkit subscribes to all channels for aggregation
    subscriptions: [],
    sinks: [
      {
        id: "logging-console",
        name: "Platform Console",
        type: "console",
        enabled: true,
        console: { color: true, json: false },
      },
    ],
  },

  // ── Metrics ───────────────────────────────────

  metrics: {
    definitions: [
      { name: "toolkit.logging.entries_total", description: "Total log entries aggregated", type: "counter" },
      { name: "toolkit.logging.entries_stored", description: "Entries currently in the aggregated store", type: "gauge" },
      { name: "toolkit.logging.channels_active", description: "Number of registered channels", type: "gauge" },
      { name: "toolkit.logging.sinks_active", description: "Number of active sinks", type: "gauge" },
      { name: "toolkit.logging.ipfs_flushes", description: "Total IPFS/IPLD flush operations", type: "counter" },
      { name: "toolkit.logging.errors", description: "Total sink write errors", type: "counter" },
    ],
    collect: () => {
      const agg = getLogAggregator();
      return {
        "toolkit.logging.entries_total": 0,
        "toolkit.logging.entries_stored": agg.size,
        "toolkit.logging.channels_active": agg.getChannels().length,
        "toolkit.logging.sinks_active": agg.getSinkIds().length,
        "toolkit.logging.ipfs_flushes": 0,
        "toolkit.logging.errors": 0,
      };
    },
  },

  // ── RBAC ──────────────────────────────────────

  rbac: {
    permissions: [
      { id: "logging.read", name: "Read Logs", description: "Query the aggregated log", resource: "log", actions: ["read"] },
      { id: "logging.write", name: "Write Logs", description: "Publish log entries", resource: "log", actions: ["create"] },
      { id: "logging.manage", name: "Manage Logging", description: "Add/remove sinks, clear logs", resource: "log", actions: ["create", "update", "delete", "admin"] },
    ],
    roles: [
      { id: "log-admin", name: "Log Admin", description: "Full logging access", permissions: ["logging.read", "logging.write", "logging.manage"] },
      { id: "log-viewer", name: "Log Viewer", description: "Read-only log access", permissions: ["logging.read"] },
      { id: "log-writer", name: "Log Writer", description: "Read and write logs", permissions: ["logging.read", "logging.write"] },
    ],
    defaultRole: "log-viewer",
  },

  // ── Docs ──────────────────────────────────────

  docs: {
    documents: [
      {
        id: "logging-overview",
        title: "Logging Toolkit Overview",
        type: "guide",
        order: 1,
        tags: ["logging", "getting-started"],
        content: [
          "# Logging Toolkit",
          "",
          "The Logging Toolkit provides centralized, channel-based logging with modular backends.",
          "",
          "## Architecture",
          "",
          "```",
          "  Kit A ──publish──┐",
          "  Kit B ──publish──┤──→ LogAggregator ──→ [Console]",
          "  Kit C ──publish──┘        │           ──→ [File]",
          "                            │           ──→ [IPFS/IPLD]",
          "                            │           ──→ [HTTP]",
          "                            │           ──→ [Custom]",
          "                            ▼",
          "                     Source of Truth",
          "                    (in-memory store)",
          "```",
          "",
          "## Channels",
          "",
          "Log channels provide named pub/sub topics. Kits declare which channels",
          "they publish to and which they subscribe to in their `logging` facet.",
          "",
          "## Backends (Sinks)",
          "",
          "| Type    | Description |",
          "|---------|-------------|",
          "| console | Browser/Node console output |",
          "| file    | Filesystem with rotation |",
          "| ipfs    | Content-addressable blobs on IPFS |",
          "| ipld    | Append-only DAG on IPFS using IPLD codecs |",
          "| http    | Forward to a centralized logging service |",
          "| custom  | User-supplied backend |",
          "",
          "## IPFS/IPLD Backend",
          "",
          "The IPLD backend creates a verifiable, append-only DAG:",
          "",
          "```",
          "  [Batch 3] ──parent──→ [Batch 2] ──parent──→ [Batch 1] ──parent──→ null",
          "     ↑ rootCid",
          "```",
          "",
          "Each DAG node contains a batch of log entries, a link to the previous",
          "node, and metadata. The root CID can be shared for independent verification.",
        ].join("\n"),
      },
      {
        id: "logging-dependency-guide",
        title: "Declaring Logging as a Dependency",
        type: "guide",
        order: 2,
        tags: ["logging", "dependencies"],
        content: [
          "# Declaring the Logging Toolkit as a Dependency",
          "",
          "Kits that publish or subscribe to log channels should declare a",
          "dependency on the logging toolkit in their manifest:",
          "",
          "```typescript",
          "manifest: {",
          "  // ...",
          "  dependencies: [",
          "    {",
          '      id: "logging",',
          '      version: "^2.0.0",',
          '      minimumVersion: "2.0.0",',
          '      recommendedVersion: "2.0.0",',
          '      latestVersion: "2.0.0",',
          "    },",
          "  ],",
          "},",
          "```",
          "",
          "### Version Tiers",
          "",
          "| Field | Purpose |",
          "|-------|---------|",
          "| `version` | Semver range — shorthand for `minimumVersion` |",
          "| `minimumVersion` | Hard floor — kit won't load if dependency is older |",
          "| `recommendedVersion` | Tested-against version — soft warning if below |",
          "| `latestVersion` | Informational — shows available upgrades |",
        ].join("\n"),
      },
    ],
    readme: "Centralized logging with modular backends (console, file, IPFS/IPLD, HTTP, custom).",
    changelog: [
      "## 2.0.0 (2026-03-09)",
      "",
      "- **Breaking**: Log levels now include `trace` and `fatal`",
      "- Added `LogAggregator` — single source-of-truth log bus",
      "- Added modular sink system (console, file, IPFS, IPLD, HTTP, custom)",
      "- Added IPFS/IPLD decentralized logging backend",
      "- Added channel-based pub/sub with cross-kit subscriptions",
      "- Added `ToolkitDependency` version tiers (minimum, recommended, latest)",
      "- Added 9 logging commands (query, publish, channels, sinks, flush, clear, CIDs)",
      "- Added structured `ToolkitLogEntry` with CID and DAG linkage fields",
    ].join("\n"),
  },

  // ── Activity ──────────────────────────────────

  activity: { enabled: true },

  // ── Lifecycle ─────────────────────────────────
  //
  // IMPORTANT: init must be synchronous (not async) so that
  // `initializeToolkits()` completes registration before moving
  // to the next module.  The registry calls `await module.init(ctx)`
  // — if init returns a Promise the modules.set() is deferred to a
  // microtask, causing downstream dependency checks to fail.

  init: () => {
    const agg = getLogAggregator();
    agg.log("info", "Logging toolkit initialized (v2.0.0)", {
      sourceKit: "logging",
      channel: "logging.lifecycle",
    });
  },

  destroy: () => {
    const agg = getLogAggregator();
    agg.log("info", "Logging toolkit shutting down", {
      sourceKit: "logging",
      channel: "logging.lifecycle",
    });
  },
};

/**
 * Logging toolkit — command definitions.
 *
 * Commands:
 *   • log_query          — query aggregated logs
 *   • log_publish        — publish a log entry
 *   • log_list_channels  — list registered channels
 *   • log_list_sinks     — list active sinks
 *   • log_add_sink       — add a log sink at runtime
 *   • log_remove_sink    — remove a sink by ID
 *   • log_clear          — clear the aggregated log
 *   • log_flush          — flush all sink buffers
 *   • log_root_cids      — list root CIDs from content-addressable sinks
 */

import type { CommandDefinition } from "@/services/commands/types";
import { getLogAggregator } from "@/services/logging/aggregator";
import type { ToolkitLogLevel, LogSinkConfig } from "@/services/toolkits/types";

// ── log_query ─────────────────────────────────────

export const logQueryCommand: CommandDefinition = {
  id: "log_query",
  description:
    "Query the aggregated platform log. Filters by source kit, channel, level, time range, tag, or CID.",
  tags: ["logging", "query", "observability"],
  rbac: ["orchestrator"],
  args: {
    sourceKit: {
      name: "sourceKit",
      type: "string",
      required: false,
      description: "Filter entries from a specific toolkit",
    },
    channel: {
      name: "channel",
      type: "string",
      required: false,
      description: "Filter entries from a specific channel",
    },
    minLevel: {
      name: "minLevel",
      type: "string",
      required: false,
      description: "Minimum severity level (trace|debug|info|warn|error|fatal)",
      enum: ["trace", "debug", "info", "warn", "error", "fatal"],
    },
    since: {
      name: "since",
      type: "string",
      required: false,
      description: "ISO-8601 start time (inclusive)",
    },
    until: {
      name: "until",
      type: "string",
      required: false,
      description: "ISO-8601 end time (inclusive)",
    },
    limit: {
      name: "limit",
      type: "number",
      required: false,
      description: "Maximum entries to return (default 50)",
      defaultValue: 50,
    },
    tag: {
      name: "tag",
      type: "string",
      required: false,
      description: "Filter by tag",
    },
  },
  output: "Array of matching log entries",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const agg = getLogAggregator();
    const entries = agg.query({
      sourceKit: args.sourceKit as string | undefined,
      channel: args.channel as string | undefined,
      minLevel: args.minLevel as ToolkitLogLevel | undefined,
      since: args.since as string | undefined,
      until: args.until as string | undefined,
      limit: (args.limit as number) ?? 50,
      tag: args.tag as string | undefined,
    });
    return JSON.stringify(entries, null, 2);
  },
};

// ── log_publish ───────────────────────────────────

export const logPublishCommand: CommandDefinition = {
  id: "log_publish",
  description: "Publish a log entry to the aggregated log and any matching channels/sinks.",
  tags: ["logging", "publish"],
  rbac: ["orchestrator", "builder", "researcher"],
  args: {
    level: {
      name: "level",
      type: "string",
      required: true,
      description: "Severity level",
      enum: ["trace", "debug", "info", "warn", "error", "fatal"],
    },
    message: {
      name: "message",
      type: "string",
      required: true,
      description: "Log message",
    },
    channel: {
      name: "channel",
      type: "string",
      required: false,
      description: "Target channel ID",
    },
    sourceKit: {
      name: "sourceKit",
      type: "string",
      required: false,
      description: "Source toolkit ID (defaults to 'logging')",
      defaultValue: "logging",
    },
    data: {
      name: "data",
      type: "object",
      required: false,
      description: "Structured data to attach",
    },
  },
  output: "Published entry ID",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const agg = getLogAggregator();
    const entry = {
      timestamp: new Date().toISOString(),
      level: args.level as ToolkitLogLevel,
      message: args.message as string,
      channel: args.channel as string | undefined,
      sourceKit: (args.sourceKit as string) ?? "logging",
      data: args.data as Record<string, unknown> | undefined,
    };
    agg.publish(entry);
    return `Published entry`;
  },
};

// ── log_list_channels ─────────────────────────────

export const logListChannelsCommand: CommandDefinition = {
  id: "log_list_channels",
  description: "List all registered log channels across all toolkits.",
  tags: ["logging", "channels", "query"],
  rbac: ["orchestrator"],
  args: {},
  output: "Array of channel metadata",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    const agg = getLogAggregator();
    return JSON.stringify(agg.getChannels(), null, 2);
  },
};

// ── log_list_sinks ────────────────────────────────

export const logListSinksCommand: CommandDefinition = {
  id: "log_list_sinks",
  description: "List all active log sinks (console, file, IPFS, IPLD, HTTP, custom).",
  tags: ["logging", "sinks", "query"],
  rbac: ["orchestrator"],
  args: {},
  output: "Array of sink IDs",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    const agg = getLogAggregator();
    return JSON.stringify(agg.getSinkIds());
  },
};

// ── log_add_sink ──────────────────────────────────

export const logAddSinkCommand: CommandDefinition = {
  id: "log_add_sink",
  description:
    "Add a log sink at runtime. Supports console, file, ipfs, ipld, http, and custom backends.",
  tags: ["logging", "sinks", "configuration"],
  rbac: ["orchestrator"],
  args: {
    config: {
      name: "config",
      type: "object",
      required: true,
      description: "LogSinkConfig object (id, name, type, enabled, backend-specific options)",
    },
  },
  output: "Confirmation",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const agg = getLogAggregator();
    const config = args.config as LogSinkConfig;
    if (!config.id || !config.type) {
      throw new Error("Sink config must include 'id' and 'type'");
    }
    await agg.addSink(config);
    return `Sink "${config.id}" (${config.type}) added`;
  },
};

// ── log_remove_sink ───────────────────────────────

export const logRemoveSinkCommand: CommandDefinition = {
  id: "log_remove_sink",
  description: "Remove a log sink by ID.",
  tags: ["logging", "sinks", "configuration"],
  rbac: ["orchestrator"],
  args: {
    sinkId: {
      name: "sinkId",
      type: "string",
      required: true,
      description: "ID of the sink to remove",
    },
  },
  output: "Confirmation",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const agg = getLogAggregator();
    await agg.removeSink(args.sinkId as string);
    return `Sink "${args.sinkId}" removed`;
  },
};

// ── log_clear ─────────────────────────────────────

export const logClearCommand: CommandDefinition = {
  id: "log_clear",
  description: "Clear all entries from the aggregated log (does not affect sink history).",
  tags: ["logging", "maintenance"],
  rbac: ["orchestrator"],
  args: {},
  output: "Confirmation",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    const agg = getLogAggregator();
    agg.clear();
    return "Aggregated log cleared";
  },
};

// ── log_flush ─────────────────────────────────────

export const logFlushCommand: CommandDefinition = {
  id: "log_flush",
  description: "Flush all sink buffers — force pending entries to be written to their backends.",
  tags: ["logging", "maintenance"],
  rbac: ["orchestrator"],
  args: {},
  output: "Confirmation",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    const agg = getLogAggregator();
    await agg.flush();
    return "All sinks flushed";
  },
};

// ── log_root_cids ─────────────────────────────────

export const logRootCidsCommand: CommandDefinition = {
  id: "log_root_cids",
  description:
    "List root CIDs from all content-addressable sinks (IPFS/IPLD). " +
    "Useful for verifying log integrity and sharing decentralized log references.",
  tags: ["logging", "ipfs", "ipld", "cid", "observability"],
  rbac: ["orchestrator"],
  args: {},
  output: "Map of sink ID → root CID",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    const agg = getLogAggregator();
    const cids = agg.collectRootCids();
    if (Object.keys(cids).length === 0) {
      return "No content-addressable sinks have published entries yet.";
    }
    return JSON.stringify(cids, null, 2);
  },
};

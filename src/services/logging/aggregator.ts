/**
 * LogAggregator — central log bus for the decops platform.
 *
 * Responsibilities:
 *   1. **Channel pub/sub** — kits publish log entries to named channels;
 *      other kits (or the platform) subscribe and react.
 *   2. **Aggregation** — all entries are collected into a single,
 *      chronologically ordered store (the "source of truth").
 *   3. **Sink routing** — entries are fanned out to one or more
 *      `LogBackend` instances (console, file, IPFS, IPLD, HTTP, custom).
 *   4. **Querying** — consumers can query the aggregated log by level,
 *      channel, source kit, time range, or CID.
 *
 * The aggregator is a singleton — obtain it via `getLogAggregator()`.
 */

import type {
  ToolkitLogEntry,
  ToolkitLogLevel,
  ToolkitLogChannel,
  ToolkitLogging,
  LogSinkConfig,
} from "@/services/toolkits/types";
import {
  type LogBackend,
  ConsoleBackend,
  createBackend,
} from "./backends";

// ═══════════════════════════════════════════════════
//  Level ordering (for filtering)
// ═══════════════════════════════════════════════════

const LEVEL_ORDER: Record<ToolkitLogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

function meetsLevel(entryLevel: ToolkitLogLevel, minLevel: ToolkitLogLevel): boolean {
  return (LEVEL_ORDER[entryLevel] ?? 0) >= (LEVEL_ORDER[minLevel] ?? 0);
}

// ═══════════════════════════════════════════════════
//  Subscriber callback shape
// ═══════════════════════════════════════════════════

export type LogSubscriber = (entry: ToolkitLogEntry) => void;

// ═══════════════════════════════════════════════════
//  Query helpers
// ═══════════════════════════════════════════════════

export interface LogQuery {
  /** Filter by source toolkit. */
  sourceKit?: string;
  /** Filter by channel. */
  channel?: string;
  /** Minimum severity. */
  minLevel?: ToolkitLogLevel;
  /** ISO-8601 start time (inclusive). */
  since?: string;
  /** ISO-8601 end time (inclusive). */
  until?: string;
  /** Maximum number of entries to return (most recent first). */
  limit?: number;
  /** Filter by tag. */
  tag?: string;
  /** Filter by CID prefix. */
  cidPrefix?: string;
}

// ═══════════════════════════════════════════════════
//  LogAggregator
// ═══════════════════════════════════════════════════

export class LogAggregator {
  // Source of truth — all entries, ordered by insertion time
  private entries: ToolkitLogEntry[] = [];

  // Global retention cap (eviction uses FIFO)
  private maxEntries: number;

  // Global minimum level (entries below this are dropped before storage)
  private globalMinLevel: ToolkitLogLevel;

  // Registered channels (channel ID → metadata)
  private channels = new Map<string, ToolkitLogChannel>();

  // Per-channel subscribers
  private channelSubs = new Map<string, Set<LogSubscriber>>();

  // Wildcard subscribers (receive every entry)
  private globalSubs = new Set<LogSubscriber>();

  // Active sinks (sink ID → backend instance)
  private sinks = new Map<string, { config: LogSinkConfig; backend: LogBackend }>();

  // Per-kit root CIDs (kit ID → latest CID from content-addressable backends)
  private rootCids = new Map<string, string>();

  constructor(opts?: { maxEntries?: number; minLevel?: ToolkitLogLevel }) {
    this.maxEntries = opts?.maxEntries ?? 10_000;
    this.globalMinLevel = opts?.minLevel ?? "debug";

    // Default console sink
    this.sinks.set("__console__", {
      config: { id: "__console__", name: "Console", type: "console", enabled: true },
      backend: new ConsoleBackend({ color: true }),
    });
  }

  // ── Channel management ──────────────────────────

  /** Register a log channel. */
  registerChannel(channel: ToolkitLogChannel): void {
    this.channels.set(channel.id, channel);
    if (!this.channelSubs.has(channel.id)) {
      this.channelSubs.set(channel.id, new Set());
    }
  }

  /** Unregister a channel and remove its subscribers. */
  unregisterChannel(id: string): void {
    this.channels.delete(id);
    this.channelSubs.delete(id);
  }

  /** Get all registered channels. */
  getChannels(): ToolkitLogChannel[] {
    return Array.from(this.channels.values());
  }

  // ── Sink management ─────────────────────────────

  /**
   * Add (or replace) a log sink.
   * The backend is created from the `LogSinkConfig` via the factory.
   */
  async addSink(config: LogSinkConfig): Promise<void> {
    // Tear down existing sink with same ID
    const existing = this.sinks.get(config.id);
    if (existing) {
      await existing.backend.destroy?.();
    }

    const backend = createBackend(config);
    await backend.init?.();
    this.sinks.set(config.id, { config, backend });
  }

  /**
   * Add a custom backend directly (for `type: "custom"` sinks).
   */
  async addCustomSink(id: string, backend: LogBackend): Promise<void> {
    const existing = this.sinks.get(id);
    if (existing) {
      await existing.backend.destroy?.();
    }
    await backend.init?.();
    this.sinks.set(id, {
      config: { id, name: backend.name, type: "custom", enabled: true },
      backend,
    });
  }

  /** Remove a sink by ID. */
  async removeSink(id: string): Promise<void> {
    const sink = this.sinks.get(id);
    if (sink) {
      await sink.backend.destroy?.();
      this.sinks.delete(id);
    }
  }

  /** List active sink IDs. */
  getSinkIds(): string[] {
    return Array.from(this.sinks.keys());
  }

  // ── Kit registration helper ─────────────────────

  /**
   * Register all channels, subscriptions, and sinks declared by a
   * toolkit's `ToolkitLogging` facet.
   */
  async registerKit(kitId: string, logging: ToolkitLogging): Promise<void> {
    // Channels
    for (const ch of logging.channels ?? []) {
      this.registerChannel(ch);
    }

    // Cross-kit subscriptions
    for (const chanId of logging.subscriptions ?? []) {
      // Log subscription intent — actual handling happens when entries
      // are published to that channel and the kit has a subscriber.
      if (!this.channelSubs.has(chanId)) {
        this.channelSubs.set(chanId, new Set());
      }
    }

    // Sinks
    for (const sinkConfig of logging.sinks ?? []) {
      if (sinkConfig.enabled) {
        await this.addSink(sinkConfig);
      }
    }
  }

  /** Unregister all channels and sinks belonging to a kit. */
  async unregisterKit(kitId: string, logging: ToolkitLogging): Promise<void> {
    for (const ch of logging.channels ?? []) {
      this.unregisterChannel(ch.id);
    }
    for (const sinkConfig of logging.sinks ?? []) {
      await this.removeSink(sinkConfig.id);
    }
  }

  // ── Publish / Ingest ────────────────────────────

  /**
   * Publish a log entry.
   *
   * The entry is:
   *   1. Validated against the global minimum level
   *   2. Stored in the aggregated log (source of truth)
   *   3. Dispatched to matching channel subscribers
   *   4. Dispatched to wildcard (global) subscribers
   *   5. Fanned out to all matching sinks / backends
   */
  publish(entry: ToolkitLogEntry): void {
    // Level gate
    if (!meetsLevel(entry.level, this.globalMinLevel)) return;

    // Channel-level gate
    if (entry.channel) {
      const chanMeta = this.channels.get(entry.channel);
      if (chanMeta?.minLevel && !meetsLevel(entry.level, chanMeta.minLevel)) {
        return;
      }
    }

    // Assign an ID if missing
    if (!entry.id) {
      entry.id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    // Store
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    // Channel subscribers
    if (entry.channel) {
      const subs = this.channelSubs.get(entry.channel);
      if (subs) {
        for (const fn of subs) {
          try { fn(entry); } catch { /* subscriber error — swallow */ }
        }
      }
    }

    // Global subscribers
    for (const fn of this.globalSubs) {
      try { fn(entry); } catch { /* swallow */ }
    }

    // Fan out to sinks
    for (const { config, backend } of this.sinks.values()) {
      if (!config.enabled) continue;

      // Per-sink level filter
      if (config.minLevel && !meetsLevel(entry.level, config.minLevel)) continue;

      // Per-sink channel filter
      if (config.channels && config.channels.length > 0) {
        if (!entry.channel || !config.channels.includes(entry.channel)) continue;
      }

      try {
        backend.write(entry);
      } catch {
        /* sink error — swallow */
      }
    }
  }

  /**
   * Convenience: publish with minimal args.
   */
  log(
    level: ToolkitLogLevel,
    message: string,
    opts?: { sourceKit?: string; channel?: string; data?: Record<string, unknown>; tags?: string[] }
  ): void {
    this.publish({
      timestamp: new Date().toISOString(),
      level,
      message,
      sourceKit: opts?.sourceKit,
      channel: opts?.channel,
      data: opts?.data,
      tags: opts?.tags,
    });
  }

  // ── Subscriptions ───────────────────────────────

  /** Subscribe to a specific channel. Returns unsubscribe function. */
  subscribe(channelId: string, fn: LogSubscriber): () => void {
    if (!this.channelSubs.has(channelId)) {
      this.channelSubs.set(channelId, new Set());
    }
    this.channelSubs.get(channelId)!.add(fn);
    return () => { this.channelSubs.get(channelId)?.delete(fn); };
  }

  /** Subscribe to ALL entries (wildcard). Returns unsubscribe function. */
  subscribeAll(fn: LogSubscriber): () => void {
    this.globalSubs.add(fn);
    return () => { this.globalSubs.delete(fn); };
  }

  // ── Querying ────────────────────────────────────

  /** Query the aggregated log. */
  query(q: LogQuery): ToolkitLogEntry[] {
    let results = this.entries;

    if (q.sourceKit) {
      results = results.filter((e) => e.sourceKit === q.sourceKit);
    }
    if (q.channel) {
      results = results.filter((e) => e.channel === q.channel);
    }
    if (q.minLevel) {
      results = results.filter((e) => meetsLevel(e.level, q.minLevel!));
    }
    if (q.since) {
      results = results.filter((e) => e.timestamp >= q.since!);
    }
    if (q.until) {
      results = results.filter((e) => e.timestamp <= q.until!);
    }
    if (q.tag) {
      results = results.filter((e) => e.tags?.includes(q.tag!));
    }
    if (q.cidPrefix) {
      results = results.filter((e) => e.cid?.startsWith(q.cidPrefix!));
    }

    // Most recent first
    results = [...results].reverse();

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  /** Return the full aggregated log (newest first). */
  getAll(): ToolkitLogEntry[] {
    return [...this.entries].reverse();
  }

  /** Total number of stored entries. */
  get size(): number {
    return this.entries.length;
  }

  /** Clear the entire aggregated log. */
  clear(): void {
    this.entries = [];
  }

  // ── CID tracking ────────────────────────────────

  /** Get the root CID for a kit's content-addressable log. */
  getRootCid(kitId: string): string | undefined {
    return this.rootCids.get(kitId);
  }

  /** Manually set the root CID (called by backends after flush). */
  setRootCid(kitId: string, cid: string): void {
    this.rootCids.set(kitId, cid);
  }

  /** Collect root CIDs from all content-addressable sinks. */
  collectRootCids(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [id, { backend }] of this.sinks) {
      const cid = backend.getRootCid?.();
      if (cid) result[id] = cid;
    }
    return result;
  }

  // ── Lifecycle ───────────────────────────────────

  /** Flush all sinks. */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const { backend } of this.sinks.values()) {
      if (backend.flush) promises.push(backend.flush());
    }
    await Promise.allSettled(promises);
  }

  /** Graceful shutdown: flush + destroy all sinks. */
  async destroy(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const { backend } of this.sinks.values()) {
      if (backend.destroy) promises.push(backend.destroy());
    }
    await Promise.allSettled(promises);
    this.sinks.clear();
    this.channelSubs.clear();
    this.globalSubs.clear();
  }
}

// ═══════════════════════════════════════════════════
//  Singleton
// ═══════════════════════════════════════════════════

let _instance: LogAggregator | null = null;

/** Get the global LogAggregator instance (lazy singleton). */
export function getLogAggregator(): LogAggregator {
  if (!_instance) {
    _instance = new LogAggregator();
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetLogAggregator(): void {
  _instance?.destroy();
  _instance = null;
}
